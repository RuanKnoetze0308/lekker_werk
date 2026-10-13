import { localMinutes } from "@/lib/time";
import type { MealBreakPolicy } from "@/db/schema/system";
import type { ResolvedDaySchedule } from "../services/schedule.service";

export interface EventLite {
  eventType: "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
  occurredAt: Date;
  id?: string;
}

export interface Shift {
  inAt: Date;
  outAt: Date | null;
  breaks: { start: Date; end: Date | null; startEventId?: string; endEventId?: string }[];
}

/** Turns an ordered event stream into shifts. A new CLOCK_IN closes an unfinished earlier shift. */
export function buildShifts(events: EventLite[]): Shift[] {
  const shifts: Shift[] = [];
  let current: Shift | null = null;
  for (const ev of events) {
    switch (ev.eventType) {
      case "CLOCK_IN":
        if (current) shifts.push(current);
        current = { inAt: ev.occurredAt, outAt: null, breaks: [] };
        break;
      case "BREAK_START":
        if (current && !current.breaks.some((b) => b.end === null)) {
          current.breaks.push({ start: ev.occurredAt, end: null, startEventId: ev.id });
        }
        break;
      case "BREAK_END": {
        const open = current?.breaks.find((b) => b.end === null);
        if (open) {
          open.end = ev.occurredAt;
          open.endEventId = ev.id;
        }
        break;
      }
      case "CLOCK_OUT":
        if (current) {
          const open = current.breaks.find((b) => b.end === null);
          if (open) open.end = ev.occurredAt;
          current.outAt = ev.occurredAt;
          shifts.push(current);
          current = null;
        }
        break;
    }
  }
  if (current) shifts.push(current);
  return shifts;
}

const mins = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));

export interface DaySummary {
  workedMinutes: number;
  breakMinutes: number;
  autoBreakMinutes: number;
  scheduledMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  firstClockIn: Date | null;
  lastClockOut: Date | null;
  status: "PRESENT" | "LATE" | "INCOMPLETE";
}

export function summariseDay(
  shifts: Shift[],
  opts: {
    now: Date;
    timeZone: string;
    maxShiftHours: number;
    schedule: ResolvedDaySchedule | null;
    overtimeAfterDefault: number;
    mealBreak: MealBreakPolicy;
  },
): DaySummary | null {
  if (!shifts.length) return null;
  const { now, timeZone, maxShiftHours, schedule } = opts;

  let worked = 0;
  let breaks = 0;
  let incomplete = false;

  for (const s of shifts) {
    const stale = !s.outAt && now.getTime() - s.inAt.getTime() > maxShiftHours * 3600_000;
    if (stale) {
      incomplete = true; // forgot to clock out; counts for nothing until corrected
      continue;
    }
    const end = s.outAt ?? now;
    let b = 0;
    for (const br of s.breaks) b += mins(br.start, br.end ?? end);
    breaks += b;
    worked += Math.max(0, mins(s.inAt, end) - b);
  }

  // Meal break: most people don't clock lunch. Deduct the shortfall once the day is long enough.
  const { mealBreak } = opts;
  const requiredBreak = schedule?.breakMinutes ?? mealBreak.minutes;
  let autoBreak = 0;
  if (mealBreak.policy === "AUTO_DEDUCT" && worked > mealBreak.afterMinutes && breaks < requiredBreak) {
    autoBreak = Math.min(requiredBreak - breaks, worked);
    worked -= autoBreak;
    breaks += autoBreak;
  }
  // A paid break is time worked; it is still reported as break time.
  if (mealBreak.paid) worked += breaks;

  const first = shifts[0].inAt;
  const lastShift = shifts[shifts.length - 1];
  const lastOut = [...shifts].reverse().find((s) => s.outAt)?.outAt ?? null;

  const scheduled = (schedule?.scheduledMinutes ?? 0) + (schedule && mealBreak.paid ? (schedule.breakMinutes ?? 0) : 0);
  const otThreshold = schedule?.overtimeAfterMinutes ?? (scheduled || opts.overtimeAfterDefault);
  const overtime = scheduled || schedule ? Math.max(0, worked - otThreshold) : 0;

  let late = 0;
  let early = 0;
  if (schedule) {
    const inMin = localMinutes(first, timeZone);
    if (inMin > schedule.startMinutes + schedule.graceMinutes) late = inMin - schedule.startMinutes;
    if (lastShift.outAt) {
      const outMin = localMinutes(lastShift.outAt, timeZone);
      if (outMin < schedule.endMinutes) early = schedule.endMinutes - outMin;
    }
  }

  return {
    workedMinutes: worked,
    breakMinutes: breaks,
    autoBreakMinutes: autoBreak,
    scheduledMinutes: scheduled,
    overtimeMinutes: overtime,
    lateMinutes: late,
    earlyDepartureMinutes: early,
    firstClockIn: first,
    lastClockOut: lastOut,
    status: incomplete ? "INCOMPLETE" : late > 0 ? "LATE" : "PRESENT",
  };
}

// ---- Days without (or alongside) clocked work ---------------------------------------------------

export type DayStatus = "PRESENT" | "LATE" | "INCOMPLETE" | "ABSENT" | "ON_LEAVE" | "PUBLIC_HOLIDAY" | "SITE_CLOSED";

export interface DayContext {
  /** From summariseDay; null when nothing was clocked. */
  summary: DaySummary | null;
  schedule: ResolvedDaySchedule | null;
  mealBreakPaid: boolean;
  /** Approved leave covering this date (fraction 1 = full day, 0.5 = half). */
  leave: { leaveTypeId: string; fraction: number } | null;
  publicHoliday: boolean;
  closure: { paid: boolean } | null;
  /** The local day has ended, so "not clocked" now means "absent" rather than "not yet". */
  dayIsOver: boolean;
}

export interface DayOutcome {
  status: DayStatus;
  scheduledMinutes: number;
  leaveMinutes: number;
  leaveTypeId: string | null;
  publicHoliday: boolean;
  closureMinutes: number;
  closurePaid: boolean;
}

/**
 * Decides what a calendar day was for an employee. Precedence when nothing was worked:
 * public holiday > approved leave > site closure > absent. Leave never consumes a public holiday,
 * and a closure only covers scheduled time that wasn't worked or on leave.
 * Returns null when there is nothing to record (unscheduled day, or today and not clocked yet).
 */
export function classifyDay(c: DayContext): DayOutcome | null {
  const scheduledDay = c.schedule !== null;
  const scheduled =
    c.summary?.scheduledMinutes ??
    (c.schedule ? c.schedule.scheduledMinutes + (c.mealBreakPaid ? (c.schedule.breakMinutes ?? 0) : 0) : 0);
  const worked = c.summary?.workedMinutes ?? 0;

  const holiday = c.publicHoliday && scheduledDay;
  const leaveMinutes = c.leave && scheduled > 0 && !c.publicHoliday ? Math.round(scheduled * c.leave.fraction) : 0;
  const closureMinutes =
    c.closure && scheduled > 0 && !c.publicHoliday ? Math.max(0, scheduled - worked - leaveMinutes) : 0;

  const base = {
    scheduledMinutes: scheduled,
    leaveMinutes,
    leaveTypeId: leaveMinutes > 0 ? c.leave!.leaveTypeId : null,
    publicHoliday: c.publicHoliday,
    closureMinutes,
    closurePaid: closureMinutes > 0 ? c.closure!.paid : false,
  };

  if (c.summary) return { ...base, status: c.summary.status };
  if (holiday) return { ...base, status: "PUBLIC_HOLIDAY" };
  if (leaveMinutes > 0) return { ...base, status: "ON_LEAVE" };
  if (closureMinutes > 0) return { ...base, status: "SITE_CLOSED" };
  if (scheduledDay && scheduled > 0 && c.dayIsOver) return { ...base, status: "ABSENT" };
  return null;
}
