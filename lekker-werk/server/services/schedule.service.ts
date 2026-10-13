import "server-only";
import { and, asc, desc, eq, isNull, lte, or, gte } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { employeeSchedules, employees, locations, workSchedules } from "@/db/schema";
import type { z } from "zod";
import type { assignScheduleSchema, scheduleSchema } from "@/lib/schemas/workforce";
import { isoWeekday, parseHHmm } from "@/lib/time";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "./audit.service";

export interface ResolvedDaySchedule {
  scheduleId: string;
  startMinutes: number;
  endMinutes: number;
  scheduledMinutes: number;
  /** Break length set on this schedule day; null = use the company meal-break default. */
  breakMinutes: number | null;
  graceMinutes: number;
  overtimeAfterMinutes: number | null;
}

export async function listSchedules(ctx: AuthContext) {
  assertCan(ctx, "schedules:manage");
  return db
    .select({
      id: workSchedules.id,
      name: workSchedules.name,
      days: workSchedules.days,
      graceMinutes: workSchedules.graceMinutes,
      overtimeAfterMinutesPerDay: workSchedules.overtimeAfterMinutesPerDay,
      locationId: workSchedules.locationId,
      locationName: locations.name,
    })
    .from(workSchedules)
    .leftJoin(locations, eq(locations.id, workSchedules.locationId))
    .where(eq(workSchedules.companyId, ctx.companyId))
    .orderBy(asc(workSchedules.name));
}

export async function createSchedule(ctx: AuthContext, input: z.infer<typeof scheduleSchema>) {
  assertCan(ctx, "schedules:manage");
  if (input.locationId) assertLocationAccess(ctx, input.locationId);
  else if (ctx.locationScope !== null) throw Errors.forbidden("Managers can only create location schedules.");
  const [row] = await db
    .insert(workSchedules)
    .values({ ...input, companyId: ctx.companyId })
    .returning({ id: workSchedules.id });
  await audit(ctx, "schedule.changed", "work_schedule", row.id, { name: input.name });
  return row;
}

export async function updateSchedule(ctx: AuthContext, id: string, input: z.infer<typeof scheduleSchema>) {
  assertCan(ctx, "schedules:manage");
  const [existing] = await db
    .select()
    .from(workSchedules)
    .where(and(eq(workSchedules.id, id), eq(workSchedules.companyId, ctx.companyId)));
  if (!existing) throw Errors.notFound("Schedule");
  if (existing.locationId) assertLocationAccess(ctx, existing.locationId);
  else if (ctx.locationScope !== null) throw Errors.forbidden();
  await db
    .update(workSchedules)
    .set({ ...input, locationId: existing.locationId })
    .where(eq(workSchedules.id, id));
  await audit(ctx, "schedule.changed", "work_schedule", id, { name: input.name });
}

export async function assignSchedule(ctx: AuthContext, input: z.infer<typeof assignScheduleSchema>) {
  assertCan(ctx, "schedules:manage");
  const [emp] = await db
    .select({ locationId: employees.locationId })
    .from(employees)
    .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, ctx.companyId)));
  if (!emp) throw Errors.notFound("Employee");
  assertLocationAccess(ctx, emp.locationId);
  const [sched] = await db
    .select({ id: workSchedules.id })
    .from(workSchedules)
    .where(and(eq(workSchedules.id, input.scheduleId), eq(workSchedules.companyId, ctx.companyId)));
  if (!sched) throw Errors.notFound("Schedule");

  await db.transaction(async (tx) => {
    await tx
      .update(employeeSchedules)
      .set({ effectiveTo: input.effectiveFrom })
      .where(and(eq(employeeSchedules.employeeId, input.employeeId), isNull(employeeSchedules.effectiveTo)));
    await tx.insert(employeeSchedules).values({
      companyId: ctx.companyId,
      employeeId: input.employeeId,
      scheduleId: input.scheduleId,
      effectiveFrom: input.effectiveFrom,
    });
    await audit(ctx, "schedule.changed", "employee", input.employeeId, { scheduleId: input.scheduleId }, tx);
  });
}

/**
 * Resolution order: employee assignment -> location schedule -> company default.
 * Returns null when the employee is not scheduled that day (weekend, off day).
 */
export async function resolveDaySchedule(
  companyId: string,
  employeeId: string,
  locationId: string,
  workDate: string,
  executor: Db | Tx = db,
): Promise<ResolvedDaySchedule | null> {
  const [assigned] = await executor
    .select({ s: workSchedules })
    .from(employeeSchedules)
    .innerJoin(workSchedules, eq(workSchedules.id, employeeSchedules.scheduleId))
    .where(
      and(
        eq(employeeSchedules.employeeId, employeeId),
        lte(employeeSchedules.effectiveFrom, workDate),
        or(isNull(employeeSchedules.effectiveTo), gte(employeeSchedules.effectiveTo, workDate)),
      ),
    )
    .orderBy(desc(employeeSchedules.effectiveFrom))
    .limit(1);

  let schedule = assigned?.s;
  if (!schedule) {
    const [loc] = await executor
      .select()
      .from(workSchedules)
      .where(and(eq(workSchedules.companyId, companyId), eq(workSchedules.locationId, locationId)))
      .limit(1);
    schedule = loc;
  }
  if (!schedule) {
    const [def] = await executor
      .select()
      .from(workSchedules)
      .where(and(eq(workSchedules.companyId, companyId), isNull(workSchedules.locationId)))
      .orderBy(asc(workSchedules.createdAt))
      .limit(1);
    schedule = def;
  }
  if (!schedule) return null;

  const day = schedule.days.find((d) => d.day === isoWeekday(workDate));
  if (!day) return null;
  const start = parseHHmm(day.start);
  const end = parseHHmm(day.end);
  return {
    scheduleId: schedule.id,
    startMinutes: start,
    endMinutes: end,
    scheduledMinutes: Math.max(0, end - start - (day.breakMinutes ?? 0)),
    breakMinutes: day.breakMinutes ?? null,
    graceMinutes: schedule.graceMinutes,
    overtimeAfterMinutes: schedule.overtimeAfterMinutesPerDay,
  };
}

/** Name of the schedule an employee follows today (assignment, else location, else company default). */
export async function currentScheduleName(ctx: AuthContext, employeeId: string, today: string) {
  const [assigned] = await db
    .select({ name: workSchedules.name })
    .from(employeeSchedules)
    .innerJoin(workSchedules, eq(workSchedules.id, employeeSchedules.scheduleId))
    .where(
      and(
        eq(employeeSchedules.employeeId, employeeId),
        eq(employeeSchedules.companyId, ctx.companyId),
        lte(employeeSchedules.effectiveFrom, today),
        or(isNull(employeeSchedules.effectiveTo), gte(employeeSchedules.effectiveTo, today)),
      ),
    )
    .orderBy(desc(employeeSchedules.effectiveFrom))
    .limit(1);
  return assigned?.name ?? null;
}
