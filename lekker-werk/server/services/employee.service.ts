import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  communicationAccounts,
  employeeLocations,
  employees,
  linkCodes,
  locations,
  users,
} from "@/db/schema";
import type { z } from "zod";
import type { employeeListQuery, employeeSchema, employeeUpdateSchema } from "@/lib/schemas/workforce";
import { randomToken, sha256 } from "@/lib/crypto";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { assertWithinPlan } from "../billing/billing.service";
import { Errors } from "../errors";
import { audit } from "./audit.service";

function scope(ctx: AuthContext): SQL | undefined {
  if (ctx.locationScope === null) return undefined;
  return ctx.locationScope.length ? inArray(employees.locationId, ctx.locationScope) : sql`false`;
}

export async function listEmployees(ctx: AuthContext, q: z.infer<typeof employeeListQuery>) {
  assertCan(ctx, "employees:read");
  const where = and(
    eq(employees.companyId, ctx.companyId),
    scope(ctx),
    q.status ? eq(employees.status, q.status) : undefined,
    q.locationId
      ? or(
          eq(employees.locationId, q.locationId),
          sql`exists (select 1 from employee_locations el where el.employee_id = ${employees.id} and el.location_id = ${q.locationId})`,
        )
      : undefined,
    q.department ? eq(employees.department, q.department) : undefined,
    q.managerId ? eq(employees.managerId, q.managerId) : undefined,
    q.q
      ? or(
          ilike(employees.firstName, `%${q.q}%`),
          ilike(employees.lastName, `%${q.q}%`),
          ilike(employees.employeeNumber, `%${q.q}%`),
        )
      : undefined,
  );

  const [{ total }] = await db.select({ total: count() }).from(employees).where(where);
  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      firstName: employees.firstName,
      lastName: employees.lastName,
      department: employees.department,
      position: employees.position,
      status: employees.status,
      preferredChannel: employees.preferredChannel,
      locationId: employees.locationId,
      locationName: locations.name,
    })
    .from(employees)
    .innerJoin(locations, eq(locations.id, employees.locationId))
    .where(where)
    .orderBy(asc(employees.lastName), asc(employees.firstName))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  return { rows, total, page: q.page, pageSize: q.pageSize };
}

export async function getEmployee(ctx: AuthContext, id: string) {
  assertCan(ctx, "employees:read");
  const [row] = await db
    .select({
      employee: employees,
      locationName: locations.name,
      locationTimezone: locations.timezone,
      managerName: users.name,
    })
    .from(employees)
    .innerJoin(locations, eq(locations.id, employees.locationId))
    .leftJoin(users, eq(users.id, employees.managerId))
    .where(and(eq(employees.id, id), eq(employees.companyId, ctx.companyId)));
  if (!row) throw Errors.notFound("Employee");
  assertLocationAccess(ctx, row.employee.locationId);

  const extra = await db
    .select({ locationId: employeeLocations.locationId, name: locations.name })
    .from(employeeLocations)
    .innerJoin(locations, eq(locations.id, employeeLocations.locationId))
    .where(eq(employeeLocations.employeeId, id));

  const accounts = await db
    .select({
      id: communicationAccounts.id,
      channel: communicationAccounts.channel,
      displayName: communicationAccounts.displayName,
      verifiedAt: communicationAccounts.verifiedAt,
      revokedAt: communicationAccounts.revokedAt,
    })
    .from(communicationAccounts)
    .where(eq(communicationAccounts.employeeId, id))
    .orderBy(desc(communicationAccounts.createdAt));

  return { ...row, extraLocations: extra, accounts };
}

async function assertValidRefs(
  ctx: AuthContext,
  refs: { locationId?: string; managerId?: string | null; extraLocationIds?: string[] },
) {
  const locIds = [...(refs.locationId ? [refs.locationId] : []), ...(refs.extraLocationIds ?? [])];
  if (locIds.length) {
    const found = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(inArray(locations.id, locIds), eq(locations.companyId, ctx.companyId)));
    if (found.length !== new Set(locIds).size) throw Errors.invalid("Invalid location selected.");
    locIds.forEach((id) => assertLocationAccess(ctx, id));
  }
  if (refs.managerId) {
    const [m] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, refs.managerId), eq(users.companyId, ctx.companyId), eq(users.role, "MANAGER")));
    if (!m) throw Errors.invalid("Invalid manager selected.");
  }
}

export async function createEmployee(ctx: AuthContext, input: z.infer<typeof employeeSchema>) {
  assertCan(ctx, "employees:write");
  await assertWithinPlan(ctx.companyId, "employees");
  await assertValidRefs(ctx, input);
  const dupe = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.companyId, ctx.companyId), eq(employees.employeeNumber, input.employeeNumber)));
  if (dupe.length) throw Errors.conflict("That employee number is already in use.");

  const { extraLocationIds, ...fields } = input;
  return db.transaction(async (tx) => {
    const [emp] = await tx
      .insert(employees)
      .values({ ...fields, companyId: ctx.companyId, hiredOn: fields.hiredOn ?? new Date().toISOString().slice(0, 10) })
      .returning();
    const locs = [emp.locationId, ...extraLocationIds.filter((l) => l !== emp.locationId)];
    await tx.insert(employeeLocations).values(
      locs.map((locationId, i) => ({
        employeeId: emp.id,
        locationId,
        companyId: ctx.companyId,
        isPrimary: i === 0,
      })),
    );
    await audit(ctx, "employee.created", "employee", emp.id, { employeeNumber: emp.employeeNumber }, tx);
    return emp;
  });
}

export async function updateEmployee(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof employeeUpdateSchema>,
) {
  assertCan(ctx, "employees:write");
  const current = await getEmployee(ctx, id);
  await assertValidRefs(ctx, input);
  const { extraLocationIds, ...fields } = input;

  return db.transaction(async (tx) => {
    const [emp] = await tx
      .update(employees)
      .set(fields)
      .where(and(eq(employees.id, id), eq(employees.companyId, ctx.companyId)))
      .returning();

    if (extraLocationIds || input.locationId) {
      const primary = emp.locationId;
      const all = [primary, ...(extraLocationIds ?? current.extraLocations.map((l) => l.locationId)).filter((l) => l !== primary)];
      await tx.delete(employeeLocations).where(eq(employeeLocations.employeeId, id));
      await tx.insert(employeeLocations).values(
        all.map((locationId, i) => ({
          employeeId: id,
          locationId,
          companyId: ctx.companyId,
          isPrimary: i === 0,
        })),
      );
    }
    await audit(ctx, "employee.updated", "employee", id, fields as Record<string, unknown>, tx);
    return emp;
  });
}

/** Never hard-deletes: history must survive. Deactivating also revokes linked chat accounts. */
export async function setEmployeeActive(ctx: AuthContext, id: string, active: boolean) {
  assertCan(ctx, "employees:write");
  await getEmployee(ctx, id);
  if (active) await assertWithinPlan(ctx.companyId, "employees");
  await db.transaction(async (tx) => {
    await tx
      .update(employees)
      .set({
        status: active ? "ACTIVE" : "INACTIVE",
        deactivatedOn: active ? null : new Date().toISOString().slice(0, 10),
      })
      .where(and(eq(employees.id, id), eq(employees.companyId, ctx.companyId)));
    if (!active) {
      await tx
        .update(communicationAccounts)
        .set({ revokedAt: new Date() })
        .where(and(eq(communicationAccounts.employeeId, id), sql`${communicationAccounts.revokedAt} is null`));
    }
    await audit(ctx, active ? "employee.reactivated" : "employee.deactivated", "employee", id, {}, tx);
  });
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** One-time code the employee sends to the company bot to securely link their chat account. */
export async function generateLinkCode(ctx: AuthContext, employeeId: string, channel: "TELEGRAM" | "WHATSAPP") {
  assertCan(ctx, "employees:write");
  await getEmployee(ctx, employeeId);
  const bytes = randomToken(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[bytes.charCodeAt(i) % CODE_ALPHABET.length];
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000);
  await db.insert(linkCodes).values({
    companyId: ctx.companyId,
    employeeId,
    channel,
    codeHash: sha256(code),
    expiresAt,
  });
  return { code, expiresAt };
}

export async function revokeCommunicationAccount(ctx: AuthContext, accountId: string) {
  assertCan(ctx, "employees:write");
  const res = await db
    .update(communicationAccounts)
    .set({ revokedAt: new Date() })
    .where(and(eq(communicationAccounts.id, accountId), eq(communicationAccounts.companyId, ctx.companyId)))
    .returning({ id: communicationAccounts.id });
  if (!res.length) throw Errors.notFound("Account");
}

export async function listDepartments(ctx: AuthContext) {
  const rows = await db
    .selectDistinct({ department: employees.department })
    .from(employees)
    .where(and(eq(employees.companyId, ctx.companyId), sql`${employees.department} is not null`, scope(ctx)));
  return rows.map((r) => r.department!).sort();
}
