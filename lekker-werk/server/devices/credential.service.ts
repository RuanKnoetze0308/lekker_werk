import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { employeeCredentials, employees } from "@/db/schema";
import type { z } from "zod";
import type { credentialIssueSchema } from "@/lib/schemas/devices";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "../services/audit.service";
import { credentialHint, hashCredential } from "./credential-hash";

async function loadEmployee(ctx: AuthContext, employeeId: string) {
  const [emp] = await db
    .select({ id: employees.id, locationId: employees.locationId })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.companyId, ctx.companyId)));
  if (!emp) throw Errors.notFound("Employee");
  assertLocationAccess(ctx, emp.locationId);
  return emp;
}

export async function listCredentials(ctx: AuthContext, employeeId: string) {
  assertCan(ctx, "employees:read");
  await loadEmployee(ctx, employeeId);
  return db
    .select({
      id: employeeCredentials.id,
      kind: employeeCredentials.kind,
      valueHint: employeeCredentials.valueHint,
      label: employeeCredentials.label,
      lastUsedAt: employeeCredentials.lastUsedAt,
      revokedAt: employeeCredentials.revokedAt,
      createdAt: employeeCredentials.createdAt,
    })
    .from(employeeCredentials)
    .where(and(eq(employeeCredentials.employeeId, employeeId), eq(employeeCredentials.companyId, ctx.companyId)))
    .orderBy(desc(employeeCredentials.createdAt));
}

/** Assign a card / tag / PIN / fingerprint id to an employee. One live owner per value. */
export async function issueCredential(
  ctx: AuthContext,
  employeeId: string,
  input: z.infer<typeof credentialIssueSchema>,
) {
  assertCan(ctx, "employees:write");
  await loadEmployee(ctx, employeeId);
  const valueHash = hashCredential(ctx.companyId, input.kind, input.value);

  const [taken] = await db
    .select({ employeeId: employeeCredentials.employeeId })
    .from(employeeCredentials)
    .where(
      and(
        eq(employeeCredentials.companyId, ctx.companyId),
        eq(employeeCredentials.kind, input.kind),
        eq(employeeCredentials.valueHash, valueHash),
        isNull(employeeCredentials.revokedAt),
      ),
    );
  if (taken) {
    throw Errors.conflict(
      taken.employeeId === employeeId
        ? "This employee already has that credential."
        : input.kind === "PIN"
          ? "That PIN is already in use. Choose another."
          : "That card or tag is already assigned to another employee. Revoke it there first.",
    );
  }

  const [row] = await db
    .insert(employeeCredentials)
    .values({
      companyId: ctx.companyId,
      employeeId,
      kind: input.kind,
      valueHash,
      valueHint: credentialHint(input.kind, input.value),
      label: input.label || null,
      createdBy: ctx.userId,
    })
    .returning({ id: employeeCredentials.id });
  // Never log the value itself.
  await audit(ctx, "credential.issued", "employee_credential", row.id, { employeeId, kind: input.kind });
  return row;
}

export async function revokeCredential(ctx: AuthContext, employeeId: string, credentialId: string) {
  assertCan(ctx, "employees:write");
  await loadEmployee(ctx, employeeId);
  const res = await db
    .update(employeeCredentials)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(employeeCredentials.id, credentialId),
        eq(employeeCredentials.employeeId, employeeId),
        eq(employeeCredentials.companyId, ctx.companyId),
        isNull(employeeCredentials.revokedAt),
      ),
    )
    .returning({ id: employeeCredentials.id });
  if (!res.length) throw Errors.notFound("Credential");
  await audit(ctx, "credential.revoked", "employee_credential", credentialId, { employeeId });
}
