import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { attendanceRecords, clockEvents, employees, locations } from "@/db/schema";
import type { EmployeeDataKey } from "@/lib/defaults";
import { addDays, formatMinutes, formatTime, isoWeekday, localDate } from "@/lib/time";
import { getClockState } from "../clocking/clocking.service";
import { getSettings } from "../services/company.service";
import { recomputeDay } from "../services/attendance.service";
import { resolveDaySchedule } from "../services/schedule.service";

const STATE_LABEL = { OUT: "Clocked out", IN: "Clocked in", BREAK: "On break" } as const;

/**
 * Answers one self-service question. Callers MUST have already checked the company's
 * employee-data permission for `key`; this function only builds the answer.
 */
export async function answerInfoRequest(key: EmployeeDataKey, employeeId: string): Promise<string> {
  const [emp] = await db
    .select({ companyId: employees.companyId, locationId: employees.locationId, tz: locations.timezone })
    .from(employees)
    .innerJoin(locations, eq(locations.id, employees.locationId))
    .where(eq(employees.id, employeeId));
  if (!emp) return "Employee not found.";

  const now = new Date();
  const today = localDate(now, emp.tz);
  const sumFrom = async (from: string) => {
    const [r] = await db
      .select({
        worked: sql<number>`coalesce(sum(${attendanceRecords.workedMinutes}),0)::int`,
        overtime: sql<number>`coalesce(sum(${attendanceRecords.overtimeMinutes}),0)::int`,
        days: sql<number>`count(*)::int`,
      })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, employeeId), gte(attendanceRecords.workDate, from)));
    return r;
  };

  switch (key) {
    case "today_hours": {
      await recomputeDay(db, employeeId, today, now); // include a running shift
      const r = await sumFrom(today);
      return r.days ? `Today you have worked ${formatMinutes(r.worked)}.` : "No hours recorded today yet.";
    }
    case "weekly_hours": {
      const r = await sumFrom(addDays(today, -(isoWeekday(today) - 1)));
      return `This week: ${formatMinutes(r.worked)} over ${r.days} day(s).`;
    }
    case "monthly_hours": {
      const r = await sumFrom(`${today.slice(0, 8)}01`);
      return `This month: ${formatMinutes(r.worked)} over ${r.days} day(s).`;
    }
    case "overtime": {
      const r = await sumFrom(`${today.slice(0, 8)}01`);
      return `Overtime this month: ${formatMinutes(r.overtime)}.`;
    }
    case "last_clock_in":
    case "last_clock_out": {
      const type = key === "last_clock_in" ? "CLOCK_IN" : "CLOCK_OUT";
      const [e] = await db
        .select({ at: clockEvents.occurredAt })
        .from(clockEvents)
        .where(and(eq(clockEvents.employeeId, employeeId), eq(clockEvents.eventType, type)))
        .orderBy(desc(clockEvents.occurredAt))
        .limit(1);
      if (!e) return "Nothing recorded yet.";
      return `Last ${type === "CLOCK_IN" ? "clock-in" : "clock-out"}: ${new Intl.DateTimeFormat("en-ZA", { timeZone: emp.tz, dateStyle: "medium", timeStyle: "short" }).format(e.at)}.`;
    }
    case "current_status": {
      const settings = (await getSettings(emp.companyId)).attendance;
      const { state, last } = await getClockState(employeeId, settings.maxShiftHours, now);
      return `Status: ${STATE_LABEL[state]}${last ? ` (since ${formatTime(last.occurredAt, emp.tz)})` : ""}.`;
    }
    case "schedule": {
      const lines: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(today, i);
        const s = await resolveDaySchedule(emp.companyId, employeeId, emp.locationId, d);
        if (s) {
          const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          lines.push(`${d}: ${hhmm(s.startMinutes)}–${hhmm(s.endMinutes)}`);
        }
      }
      return lines.length ? `Your schedule:\n${lines.join("\n")}` : "No scheduled shifts in the next 7 days.";
    }
    case "attendance_history": {
      const rows = await db
        .select({ d: attendanceRecords.workDate, w: attendanceRecords.workedMinutes, s: attendanceRecords.status })
        .from(attendanceRecords)
        .where(eq(attendanceRecords.employeeId, employeeId))
        .orderBy(desc(attendanceRecords.workDate))
        .limit(5);
      return rows.length ? rows.map((r) => `${r.d}: ${formatMinutes(r.w)} (${r.s.toLowerCase()})`).join("\n") : "No history yet.";
    }
    case "leave_balance":
    case "payslip":
      return "This isn't available yet.";
  }
}
