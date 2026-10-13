import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, locations, siteClosures } from "@/db/schema";
import type { z } from "zod";
import type { siteClosureSchema } from "@/lib/schemas/time";
import { addDays, localDate } from "@/lib/time";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "../services/audit.service";
import { recomputeDay } from "../services/attendance.service";
import { assertDatesOpen } from "./period-lock";

async function loadLocation(ctx: AuthContext, locationId: string) {
  const [loc] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.companyId, ctx.companyId)));
  if (!loc) throw Errors.notFound("Location");
  assertLocationAccess(ctx, loc.id);
  return loc;
}

/** Re-derives every employee of the location for the closure's past and current days. */
async function recomputeLocation(companyId: string, locationId: string, startDate: string, endDate: string, timezone: string) {
  const today = localDate(new Date(), timezone);
  const staff = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.locationId, locationId), eq(employees.status, "ACTIVE")));
  const last = endDate < today ? endDate : today;
  for (const e of staff) for (let d = startDate; d <= last; d = addDays(d, 1)) await recomputeDay(db, e.id, d);
}

export async function listClosures(ctx: AuthContext, locationId: string) {
  assertCan(ctx, "locations:read");
  await loadLocation(ctx, locationId);
  return db
    .select()
    .from(siteClosures)
    .where(and(eq(siteClosures.locationId, locationId), eq(siteClosures.companyId, ctx.companyId), gte(siteClosures.endDate, addDays(localDate(new Date(), "UTC"), -365))))
    .orderBy(desc(siteClosures.startDate));
}

/**
 * Load-shedding, a strike, flooding: scheduled time at the site becomes CLOSURE_PAID or
 * CLOSURE_UNPAID instead of absence. Future days are picked up when they're derived.
 */
export async function createClosure(ctx: AuthContext, locationId: string, input: z.infer<typeof siteClosureSchema>) {
  assertCan(ctx, "attendance:correct");
  const loc = await loadLocation(ctx, locationId);
  await assertDatesOpen(ctx.companyId, input.startDate, input.endDate);
  const [row] = await db
    .insert(siteClosures)
    .values({ ...input, companyId: ctx.companyId, locationId, createdBy: ctx.userId })
    .returning({ id: siteClosures.id });
  await audit(ctx, "closure.created", "site_closure", row.id, { locationId, ...input });
  await recomputeLocation(ctx.companyId, locationId, input.startDate, input.endDate, loc.timezone);
  return row;
}

export async function deleteClosure(ctx: AuthContext, id: string) {
  assertCan(ctx, "attendance:correct");
  const [row] = await db
    .select()
    .from(siteClosures)
    .where(and(eq(siteClosures.id, id), eq(siteClosures.companyId, ctx.companyId)));
  if (!row) throw Errors.notFound("Closure");
  const loc = await loadLocation(ctx, row.locationId);
  await assertDatesOpen(ctx.companyId, row.startDate, row.endDate);
  await db.delete(siteClosures).where(eq(siteClosures.id, id));
  await audit(ctx, "closure.deleted", "site_closure", id, { locationId: row.locationId });
  await recomputeLocation(ctx.companyId, row.locationId, row.startDate, row.endDate, loc.timezone);
}
