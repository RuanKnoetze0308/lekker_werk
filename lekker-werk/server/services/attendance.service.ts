import "server-only";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lt,
  sql,
  sum,
  type SQL,
} from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import {
  attendanceRecords,
  breakRecords,
  clockAttempts,
  companies,
  clockDevices,
  clockEvents,
  employees,
  locations,
} from "@/db/schema";
import type { z } from "zod";
import type { attendanceQuery, correctionSchema } from "@/lib/schemas/workforce";
import { addDays, dayRangeUtc, localDate } from "@/lib/time";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { buildShifts, classifyDay, summariseDay } from "../attendance/derive";
import { loadDayContext } from "../time/day-context";
import { assertDatesOpen } from "../time/period-lock";
import { audit } from "./audit.service";
import { getSettings } from "./company.service";
import { resolveDaySchedule } from "./schedule.service";

/**
 * Rebuilds the derived attendance row for one local work day from the immutable event ledger.
 * Safe to call repeatedly (idempotent). Superseded (corrected) events are ignored.
 */
export async function recomputeDay(
  executor: Db | Tx,
  employeeId: string,
  workDate: string,
  now = new Date(),
) {
  const [emp] = await executor
    .select({
      companyId: employees.companyId,
      locationId: employees.locationId,
      timezone: locations.timezone,
      hiredOn: employees.hiredOn,
      deactivatedOn: employees.deactivatedOn,
      companyCreatedAt: companies.createdAt,
    })
    .from(employees)
    .innerJoin(locations, eq(locations.id, employees.locationId))
    .innerJoin(companies, eq(companies.id, employees.companyId))
    .where(eq(employees.id, employeeId));
  if (!emp) return;

  const settings = (await getSettings(emp.companyId)).attendance;
  // Nothing is "scheduled" outside employment or before the company started tracking attendance,
  // so those days never become absences.
  const trackFrom = settings.trackFrom ?? localDate(emp.companyCreatedAt, emp.timezone);
  const employed =
    workDate >= trackFrom &&
    (!emp.hiredOn || workDate >= emp.hiredOn) &&
    (!emp.deactivatedOn || workDate <= emp.deactivatedOn);
  const [start, end] = dayRangeUtc(workDate, emp.timezone);
  const horizon = new Date(end.getTime() + 24 * 3600_000);

  const events = await executor
    .select({
      id: clockEvents.id,
      eventType: clockEvents.eventType,
      occurredAt: clockEvents.occurredAt,
      locationId: clockEvents.locationId,
    })
    .from(clockEvents)
    .where(
      and(
        eq(clockEvents.employeeId, employeeId),
        gte(clockEvents.occurredAt, start),
        lt(clockEvents.occurredAt, horizon),
        eq(clockEvents.validationStatus, "ACCEPTED"),
        sql`not exists (select 1 from clock_events c where c.corrects_event_id = ${clockEvents.id})`,
      ),
    )
    .orderBy(asc(clockEvents.occurredAt));

  const shifts = buildShifts(events).filter((s) => s.inAt >= start && s.inAt < end);
  const schedule = await resolveDaySchedule(emp.companyId, employeeId, emp.locationId, workDate, executor);
  const summary = summariseDay(shifts, {
    now,
    timeZone: emp.timezone,
    maxShiftHours: settings.maxShiftHours,
    schedule,
    overtimeAfterDefault: settings.overtimeAfterMinutesPerDay,
    mealBreak: settings.mealBreak,
  });

  // Leave, public holidays and closures decide days that weren't (fully) worked.
  const outcome = classifyDay({
    summary,
    schedule: employed ? schedule : null,
    mealBreakPaid: settings.mealBreak.paid,
    ...(await loadDayContext(emp.companyId, employeeId, emp.locationId, workDate, executor)),
    dayIsOver: workDate < localDate(now, emp.timezone),
  });

  if (!outcome) {
    const existing = await executor
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.workDate, workDate)));
    for (const r of existing) {
      await executor.delete(breakRecords).where(eq(breakRecords.attendanceRecordId, r.id));
      await executor.delete(attendanceRecords).where(eq(attendanceRecords.id, r.id));
    }
    return;
  }

  const firstEvent = events.find((e) => e.eventType === "CLOCK_IN");
  const values = {
    companyId: emp.companyId,
    employeeId,
    locationId: firstEvent?.locationId ?? emp.locationId,
    workDate,
    firstClockIn: summary?.firstClockIn ?? null,
    lastClockOut: summary?.lastClockOut ?? null,
    workedMinutes: summary?.workedMinutes ?? 0,
    breakMinutes: summary?.breakMinutes ?? 0,
    autoBreakMinutes: summary?.autoBreakMinutes ?? 0,
    overtimeMinutes: summary?.overtimeMinutes ?? 0,
    lateMinutes: summary?.lateMinutes ?? 0,
    earlyDepartureMinutes: summary?.earlyDepartureMinutes ?? 0,
    ...outcome,
  };
  const [record] = await executor
    .insert(attendanceRecords)
    .values(values)
    .onConflictDoUpdate({
      target: [attendanceRecords.employeeId, attendanceRecords.workDate],
      set: values,
    })
    .returning({ id: attendanceRecords.id });

  await executor.delete(breakRecords).where(eq(breakRecords.attendanceRecordId, record.id));
  const breaks = shifts.flatMap((s) => s.breaks);
  if (breaks.length) {
    await executor.insert(breakRecords).values(
      breaks.map((b) => ({
        companyId: emp.companyId,
        employeeId,
        attendanceRecordId: record.id,
        startedAt: b.start,
        endedAt: b.end,
        startEventId: b.startEventId,
        endEventId: b.endEventId,
      })),
    );
  }
}

// ---- Reads -----------------------------------------------------------------------------

function empScope(ctx: AuthContext): SQL | undefined {
  if (ctx.locationScope === null) return undefined;
  return ctx.locationScope.length ? inArray(attendanceRecords.locationId, ctx.locationScope) : sql`false`;
}

export async function listAttendance(ctx: AuthContext, q: z.infer<typeof attendanceQuery>) {
  assertCan(ctx, "attendance:read");
  if (q.locationId) assertLocationAccess(ctx, q.locationId);
  const to = q.to ?? localDate(new Date(), "Africa/Johannesburg");
  const from = q.from ?? addDays(to, -6);

  const where = and(
    eq(attendanceRecords.companyId, ctx.companyId),
    empScope(ctx),
    gte(attendanceRecords.workDate, from),
    sql`${attendanceRecords.workDate} <= ${to}`,
    q.locationId ? eq(attendanceRecords.locationId, q.locationId) : undefined,
    q.employeeId ? eq(attendanceRecords.employeeId, q.employeeId) : undefined,
    q.department ? ilike(employees.department, q.department) : undefined,
  );

  const [{ total }] = await db
    .select({ total: count() })
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .where(where);

  const rows = await db
    .select({
      id: attendanceRecords.id,
      workDate: attendanceRecords.workDate,
      employeeId: employees.id,
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      employeeNumber: employees.employeeNumber,
      locationName: locations.name,
      timezone: locations.timezone,
      firstClockIn: attendanceRecords.firstClockIn,
      lastClockOut: attendanceRecords.lastClockOut,
      workedMinutes: attendanceRecords.workedMinutes,
      breakMinutes: attendanceRecords.breakMinutes,
      scheduledMinutes: attendanceRecords.scheduledMinutes,
      overtimeMinutes: attendanceRecords.overtimeMinutes,
      lateMinutes: attendanceRecords.lateMinutes,
      earlyDepartureMinutes: attendanceRecords.earlyDepartureMinutes,
      status: attendanceRecords.status,
    })
    .from(attendanceRecords)
    .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
    .innerJoin(locations, eq(locations.id, attendanceRecords.locationId))
    .where(where)
    .orderBy(desc(attendanceRecords.workDate), asc(employees.lastName))
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);

  return { rows, total, from, to, page: q.page, pageSize: q.pageSize };
}

export async function employeeHours(ctx: AuthContext, employeeId: string, from: string, to: string) {
  assertCan(ctx, "attendance:read");
  const [emp] = await db
    .select({ locationId: employees.locationId })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.companyId, ctx.companyId)));
  if (!emp) throw Errors.notFound("Employee");
  assertLocationAccess(ctx, emp.locationId);

  const where = and(
    eq(attendanceRecords.employeeId, employeeId),
    eq(attendanceRecords.companyId, ctx.companyId),
    gte(attendanceRecords.workDate, from),
    sql`${attendanceRecords.workDate} <= ${to}`,
  );
  const days = await db
    .select()
    .from(attendanceRecords)
    .where(where)
    .orderBy(desc(attendanceRecords.workDate));
  const [totals] = await db
    .select({
      worked: sum(attendanceRecords.workedMinutes).mapWith(Number),
      scheduled: sum(attendanceRecords.scheduledMinutes).mapWith(Number),
      overtime: sum(attendanceRecords.overtimeMinutes).mapWith(Number),
      late: sum(sql`case when ${attendanceRecords.lateMinutes} > 0 then 1 else 0 end`).mapWith(Number),
      days: count(),
    })
    .from(attendanceRecords)
    .where(where);
  return { days, totals };
}

/** Keyset pagination (`before` = last occurredAt seen) so deep history stays fast. */
export async function listClockEvents(
  ctx: AuthContext,
  opts: { employeeId: string; before?: Date; limit?: number },
) {
  assertCan(ctx, "attendance:read");
  const [emp] = await db
    .select({ locationId: employees.locationId })
    .from(employees)
    .where(and(eq(employees.id, opts.employeeId), eq(employees.companyId, ctx.companyId)));
  if (!emp) throw Errors.notFound("Employee");
  assertLocationAccess(ctx, emp.locationId);

  return db
    .select({
      id: clockEvents.id,
      eventType: clockEvents.eventType,
      occurredAt: clockEvents.occurredAt,
      source: clockEvents.source,
      note: clockEvents.note,
      distanceMeters: clockEvents.distanceMeters,
      locationName: locations.name,
      deviceName: clockDevices.name,
      correctsEventId: clockEvents.correctsEventId,
    })
    .from(clockEvents)
    .innerJoin(locations, eq(locations.id, clockEvents.locationId))
    .leftJoin(clockDevices, eq(clockDevices.id, clockEvents.deviceId))
    .where(
      and(
        eq(clockEvents.employeeId, opts.employeeId),
        eq(clockEvents.companyId, ctx.companyId),
        opts.before ? lt(clockEvents.occurredAt, opts.before) : undefined,
      ),
    )
    .orderBy(desc(clockEvents.occurredAt))
    .limit(Math.min(opts.limit ?? 50, 200));
}

export async function listRecentAttempts(ctx: AuthContext, limit = 50) {
  assertCan(ctx, "attendance:read");
  return db
    .select({
      id: clockAttempts.id,
      createdAt: clockAttempts.createdAt,
      requestedAction: clockAttempts.requestedAction,
      status: clockAttempts.status,
      reason: clockAttempts.rejectionReason,
      source: clockAttempts.source,
      employeeName: sql<string | null>`${employees.firstName} || ' ' || ${employees.lastName}`,
    })
    .from(clockAttempts)
    .leftJoin(employees, eq(employees.id, clockAttempts.employeeId))
    .where(
      and(
        eq(clockAttempts.companyId, ctx.companyId),
        eq(clockAttempts.status, "REJECTED"),
        ctx.locationScope === null
          ? undefined
          : ctx.locationScope.length
            ? inArray(clockAttempts.locationId, ctx.locationScope)
            : sql`false`,
      ),
    )
    .orderBy(desc(clockAttempts.createdAt))
    .limit(limit);
}

/** Manager correction: appends a new event (and optionally supersedes a wrong one). */
export async function createCorrection(ctx: AuthContext, input: z.infer<typeof correctionSchema>) {
  assertCan(ctx, "attendance:correct");
  const [emp] = await db
    .select({
      locationId: employees.locationId,
      companyId: employees.companyId,
      timezone: locations.timezone,
    })
    .from(employees)
    .innerJoin(locations, eq(locations.id, employees.locationId))
    .where(and(eq(employees.id, input.employeeId), eq(employees.companyId, ctx.companyId)));
  if (!emp) throw Errors.notFound("Employee");
  assertLocationAccess(ctx, emp.locationId);
  if (input.occurredAt.getTime() > Date.now() + 60_000) throw Errors.invalid("Correction cannot be in the future.");
  await assertDatesOpen(ctx.companyId, localDate(input.occurredAt, emp.timezone));

  if (input.correctsEventId) {
    const [orig] = await db
      .select({ id: clockEvents.id })
      .from(clockEvents)
      .where(
        and(
          eq(clockEvents.id, input.correctsEventId),
          eq(clockEvents.companyId, ctx.companyId),
          eq(clockEvents.employeeId, input.employeeId),
        ),
      );
    if (!orig) throw Errors.notFound("Original event");
  }

  await db.transaction(async (tx) => {
    const [ev] = await tx
      .insert(clockEvents)
      .values({
        companyId: ctx.companyId,
        employeeId: input.employeeId,
        locationId: emp.locationId,
        eventType: input.eventType,
        occurredAt: input.occurredAt,
        source: "MANUAL_CORRECTION",
        correctsEventId: input.correctsEventId ?? null,
        correctedBy: ctx.userId,
        note: input.note,
      })
      .returning({ id: clockEvents.id });
    await recomputeDay(tx, input.employeeId, localDate(input.occurredAt, emp.timezone));
    await audit(ctx, "clock_event.corrected", "clock_event", ev.id, {
      employeeId: input.employeeId,
      supersedes: input.correctsEventId ?? null,
      note: input.note,
    }, tx);
  });
}
