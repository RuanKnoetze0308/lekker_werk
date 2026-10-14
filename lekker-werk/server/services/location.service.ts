import "server-only";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, locations, managerLocations, managers, users } from "@/db/schema";
import type { z } from "zod";
import type { locationInputSchema } from "@/lib/schemas/auth";
import type { locationUpdateSchema } from "@/lib/schemas/workforce";
import {
  assertCan,
  assertLocationAccess,
  type AuthContext,
} from "../auth/context";
import { Errors } from "../errors";
import { assertWithinPlan } from "../billing/billing.service";
import { audit } from "./audit.service";

function scopeFilter(ctx: AuthContext) {
  return ctx.locationScope === null
    ? undefined
    : ctx.locationScope.length
      ? inArray(locations.id, ctx.locationScope)
      : sql`false`;
}

export async function listLocations(ctx: AuthContext, opts: { includeInactive?: boolean } = {}) {
  assertCan(ctx, "locations:read");
  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      address: locations.address,
      latitude: locations.latitude,
      longitude: locations.longitude,
      timezone: locations.timezone,
      status: locations.status,
      gpsValidationEnabled: locations.gpsValidationEnabled,
      allowedRadiusMeters: locations.allowedRadiusMeters,
      employeeCount: count(employees.id),
    })
    .from(locations)
    .leftJoin(
      employees,
      and(
        eq(employees.status, "ACTIVE"),
        // Primary location or one of the employee's additional locations.
        sql`(${employees.locationId} = ${locations.id} or exists (select 1 from employee_locations el where el.employee_id = ${employees.id} and el.location_id = ${locations.id}))`,
      ),
    )
    .where(
      and(
        eq(locations.companyId, ctx.companyId),
        opts.includeInactive ? undefined : eq(locations.status, "ACTIVE"),
        scopeFilter(ctx),
      ),
    )
    .groupBy(locations.id)
    .orderBy(asc(locations.name));
  return rows;
}

export async function getLocation(ctx: AuthContext, id: string) {
  assertCan(ctx, "locations:read");
  assertLocationAccess(ctx, id);
  const [row] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.companyId, ctx.companyId)));
  if (!row) throw Errors.notFound("Location");
  return row;
}

export async function createLocation(ctx: AuthContext, input: z.infer<typeof locationInputSchema>) {
  assertCan(ctx, "locations:write");
  await assertWithinPlan(ctx.companyId, "locations");
  const [row] = await db
    .insert(locations)
    .values({
      companyId: ctx.companyId,
      name: input.name,
      address: input.address || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    })
    .returning();
  await audit(ctx, "location.created", "location", row.id, { name: row.name });
  return row;
}

export async function updateLocation(
  ctx: AuthContext,
  id: string,
  input: z.infer<typeof locationUpdateSchema>,
) {
  assertCan(ctx, "locations:write");
  await getLocation(ctx, id);
  const set: Partial<typeof locations.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.address !== undefined) set.address = input.address || null;
  if (input.latitude !== undefined) set.latitude = input.latitude;
  if (input.longitude !== undefined) set.longitude = input.longitude;
  if (input.timezone !== undefined) set.timezone = input.timezone;
  if (input.gpsValidationEnabled !== undefined) set.gpsValidationEnabled = input.gpsValidationEnabled;
  if (input.allowedRadiusMeters !== undefined) set.allowedRadiusMeters = input.allowedRadiusMeters;
  if (input.status !== undefined) set.status = input.status;

  const [row] = await db
    .update(locations)
    .set(set)
    .where(and(eq(locations.id, id), eq(locations.companyId, ctx.companyId)))
    .returning();
  await audit(
    ctx,
    input.status === "INACTIVE" ? "location.deactivated" : "location.updated",
    "location",
    id,
    set as Record<string, unknown>,
  );
  return row;
}

export async function listLocationManagers(ctx: AuthContext, locationId: string) {
  assertCan(ctx, "locations:read");
  assertLocationAccess(ctx, locationId);
  return db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(managerLocations)
    .innerJoin(managers, eq(managers.id, managerLocations.managerId))
    .innerJoin(users, eq(users.id, managers.userId))
    .where(
      and(
        eq(managerLocations.locationId, locationId),
        eq(managerLocations.companyId, ctx.companyId),
      ),
    );
}

/** Replaces the set of managers assigned to a location. Only admins may do this. */
export async function setLocationManagers(ctx: AuthContext, locationId: string, userIds: string[]) {
  assertCan(ctx, "users:manage");
  await getLocation(ctx, locationId);

  const valid = userIds.length
    ? await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            inArray(users.id, userIds),
            eq(users.companyId, ctx.companyId),
            eq(users.role, "MANAGER"),
          ),
        )
    : [];
  if (valid.length !== userIds.length) throw Errors.invalid("One or more managers are invalid.");

  await db.transaction(async (tx) => {
    await tx
      .delete(managerLocations)
      .where(
        and(
          eq(managerLocations.locationId, locationId),
          eq(managerLocations.companyId, ctx.companyId),
        ),
      );
    for (const userId of userIds) {
      let [m] = await tx.select().from(managers).where(eq(managers.userId, userId));
      if (!m) {
        [m] = await tx
          .insert(managers)
          .values({ companyId: ctx.companyId, userId })
          .returning();
      }
      await tx
        .insert(managerLocations)
        .values({ managerId: m.id, locationId, companyId: ctx.companyId });
    }
    await audit(ctx, "location.updated", "location", locationId, { managers: userIds }, tx);
  });
}
