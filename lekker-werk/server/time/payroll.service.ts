import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  attendanceRecords,
  employees,
  leaveTypes,
  locations,
  payExports,
  payPeriodLines,
  payPeriods,
} from "@/db/schema";
import { periodContaining, previousPeriod, type PeriodBounds } from "@/lib/pay-periods";
import { addDays, localDate } from "@/lib/time";
import { assertCan, type AuthContext } from "../auth/context";
import { AppError, Errors } from "../errors";
import { computePayLines, type PayLines } from "../attendance/paycodes";
import { audit } from "../services/audit.service";
import { recomputeDay } from "../services/attendance.service";
import { getCompany, getSettings } from "../services/company.service";
import { getEffectiveTerms } from "./terms.service";
import { listExceptions } from "./exceptions.service";

/** Fixed order for columns and CSV output; leave codes follow alphabetically. */
export const PAY_CODE_ORDER = [
  "NORMAL",
  "OVERTIME",
  "SUNDAY",
  "PUBLIC_HOLIDAY_WORKED",
  "PUBLIC_HOLIDAY",
  "CLOSURE_PAID",
  "CLOSURE_UNPAID",
  "ABSENT",
];

export function sortPayCodes(codes: Iterable<string>) {
  return [...new Set(codes)].sort((a, b) => {
    const ia = PAY_CODE_ORDER.indexOf(a);
    const ib = PAY_CODE_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b);
  });
}

// ---- Periods ------------------------------------------------------------------------------

async function ensurePeriod(companyId: string, b: PeriodBounds) {
  await db.insert(payPeriods).values({ companyId, startDate: b.start, endDate: b.end }).onConflictDoNothing();
  const [row] = await db
    .select()
    .from(payPeriods)
    .where(and(eq(payPeriods.companyId, companyId), eq(payPeriods.startDate, b.start)));
  return row;
}

/**
 * Current period plus the previous few. Periods are created from the company's payroll settings
 * as they're needed; changing the frequency only affects periods not created yet, and an OPEN
 * period that no longer fits the new pattern is dropped (locked ones are history and stay).
 */
export async function listPayPeriods(ctx: AuthContext, history = 6) {
  assertCan(ctx, "payroll:manage");
  const company = await getCompany(ctx);
  const { payroll } = await getSettings(ctx.companyId);
  const today = localDate(new Date(), company.timezone);

  // Nothing before the company's first activity (sign-up, or older imported attendance).
  const [{ first }] = (
    await db.execute(sql`select least(${company.createdAt.toISOString().slice(0, 10)}::date,
      (select min(work_date) from attendance_records where company_id = ${ctx.companyId}))::text as first`)
  ).rows as { first: string }[];
  const wanted: PeriodBounds[] = [];
  let p = periodContaining(today, payroll);
  for (let i = 0; i < history && p.end >= first; i++) {
    wanted.push(p);
    p = previousPeriod(p, payroll);
  }
  const fits = new Set(wanted.map((w) => `${w.start}:${w.end}`));
  await db
    .delete(payPeriods)
    .where(
      and(
        eq(payPeriods.companyId, ctx.companyId),
        eq(payPeriods.status, "OPEN"),
        gte(payPeriods.endDate, addDays(today, -400)),
        sql`(${payPeriods.startDate}::text || ':' || ${payPeriods.endDate}::text) not in (${sql.join([...fits].map((f) => sql`${f}`), sql`, `)})`,
        sql`not exists (select 1 from pay_exports x where x.pay_period_id = ${payPeriods.id})`,
      ),
    );
  // Wanted periods that would overlap a locked one (after a frequency change) are skipped.
  const locked = await db
    .select({ startDate: payPeriods.startDate, endDate: payPeriods.endDate })
    .from(payPeriods)
    .where(and(eq(payPeriods.companyId, ctx.companyId), inArray(payPeriods.status, ["LOCKED", "EXPORTED"])));
  for (const w of wanted) {
    const clash = locked.some((l) => l.startDate <= w.end && l.endDate >= w.start && !(l.startDate === w.start && l.endDate === w.end));
    if (!clash) await ensurePeriod(ctx.companyId, w);
  }
  return db
    .select()
    .from(payPeriods)
    .where(eq(payPeriods.companyId, ctx.companyId))
    .orderBy(desc(payPeriods.startDate))
    .limit(history + 6);
}

async function loadPeriod(ctx: AuthContext, id: string) {
  assertCan(ctx, "payroll:manage");
  const [row] = await db
    .select()
    .from(payPeriods)
    .where(and(eq(payPeriods.id, id), eq(payPeriods.companyId, ctx.companyId)));
  if (!row) throw Errors.notFound("Pay period");
  return row;
}

// ---- Totals -------------------------------------------------------------------------------

export interface EmployeeTotals {
  employeeId: string;
  employeeNumber: string;
  name: string;
  locationName: string;
  payType: "HOURLY" | "SALARIED";
  lines: PayLines;
}

/** Employees who are active, or had attendance in the range (left mid-period still get paid). */
async function periodEmployees(companyId: string, start: string, end: string) {
  return db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      name: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      locationName: locations.name,
      timezone: locations.timezone,
    })
    .from(employees)
    .innerJoin(locations, eq(locations.id, employees.locationId))
    .where(
      and(
        eq(employees.companyId, companyId),
        or(
          eq(employees.status, "ACTIVE"),
          sql`exists (select 1 from attendance_records a where a.employee_id = ${employees.id} and a.work_date between ${start} and ${end})`,
        ),
      ),
    )
    .orderBy(asc(employees.lastName), asc(employees.firstName));
}

/** Live totals from current attendance (open periods). */
async function computeTotals(companyId: string, start: string, end: string): Promise<EmployeeTotals[]> {
  const staff = await periodEmployees(companyId, start, end);
  const days = await db
    .select({
      employeeId: attendanceRecords.employeeId,
      workDate: attendanceRecords.workDate,
      status: attendanceRecords.status,
      workedMinutes: attendanceRecords.workedMinutes,
      overtimeMinutes: attendanceRecords.overtimeMinutes,
      scheduledMinutes: attendanceRecords.scheduledMinutes,
      leaveMinutes: attendanceRecords.leaveMinutes,
      leaveCode: leaveTypes.code,
      publicHoliday: attendanceRecords.publicHoliday,
      closureMinutes: attendanceRecords.closureMinutes,
      closurePaid: attendanceRecords.closurePaid,
    })
    .from(attendanceRecords)
    .leftJoin(leaveTypes, eq(leaveTypes.id, attendanceRecords.leaveTypeId))
    .where(and(eq(attendanceRecords.companyId, companyId), gte(attendanceRecords.workDate, start), lte(attendanceRecords.workDate, end)))
    .orderBy(asc(attendanceRecords.workDate));

  const byEmployee = new Map<string, typeof days>();
  for (const d of days) {
    const list = byEmployee.get(d.employeeId) ?? [];
    list.push(d);
    byEmployee.set(d.employeeId, list);
  }
  const out: EmployeeTotals[] = [];
  for (const e of staff) {
    const terms = await getEffectiveTerms(companyId, e.id, end);
    out.push({
      employeeId: e.id,
      employeeNumber: e.employeeNumber,
      name: e.name,
      locationName: e.locationName,
      payType: terms.payType,
      lines: computePayLines(byEmployee.get(e.id) ?? [], terms),
    });
  }
  return out;
}

/** Frozen totals of a locked period. */
async function snapshotTotals(companyId: string, periodId: string, start: string, end: string): Promise<EmployeeTotals[]> {
  const staff = await periodEmployees(companyId, start, end);
  const lines = await db
    .select()
    .from(payPeriodLines)
    .where(and(eq(payPeriodLines.payPeriodId, periodId), eq(payPeriodLines.companyId, companyId)));
  const byEmployee = new Map<string, PayLines>();
  for (const l of lines) {
    const m = byEmployee.get(l.employeeId) ?? {};
    m[l.payCode] = { minutes: l.minutes, days: Number(l.days) };
    byEmployee.set(l.employeeId, m);
  }
  const out: EmployeeTotals[] = [];
  for (const e of staff) {
    const lines = byEmployee.get(e.id);
    if (!lines) continue;
    const { payType } = await getEffectiveTerms(companyId, e.id, end);
    out.push({ employeeId: e.id, employeeNumber: e.employeeNumber, name: e.name, locationName: e.locationName, payType, lines });
  }
  return out;
}

/** Re-derives every day of the period up to today so absences, leave and holidays are current. */
async function recomputePeriod(companyId: string, start: string, end: string) {
  const staff = await periodEmployees(companyId, start, end);
  for (const e of staff) {
    const today = localDate(new Date(), e.timezone);
    const last = end < today ? end : today;
    for (let d = start; d <= last; d = addDays(d, 1)) await recomputeDay(db, e.id, d);
  }
}

export async function getPayPeriodReport(ctx: AuthContext, id: string, opts: { refresh?: boolean } = {}) {
  const period = await loadPeriod(ctx, id);
  const open = period.status === "OPEN";
  if (open && opts.refresh) await recomputePeriod(ctx.companyId, period.startDate, period.endDate);
  const totals = open
    ? await computeTotals(ctx.companyId, period.startDate, period.endDate)
    : await snapshotTotals(ctx.companyId, period.id, period.startDate, period.endDate);
  const exceptions = await listExceptions(ctx, period.startDate, period.endDate);
  const exports = await db
    .select()
    .from(payExports)
    .where(eq(payExports.payPeriodId, period.id))
    .orderBy(desc(payExports.createdAt));
  return {
    period,
    totals,
    codes: sortPayCodes(totals.flatMap((t) => Object.keys(t.lines))),
    exceptions: {
      absences: exceptions.absences.length,
      incomplete: exceptions.incomplete.length,
      pendingLeave: exceptions.pendingLeaveCount,
    },
    exports,
  };
}

// ---- Lock / reopen / export ---------------------------------------------------------------

/**
 * Final step before payroll: re-derive the period, refuse while exceptions are open (unless
 * forced with a note), then freeze the totals. After this nothing can change those days.
 */
export async function lockPayPeriod(ctx: AuthContext, id: string, input: { note?: string | null; force: boolean }) {
  const period = await loadPeriod(ctx, id);
  if (period.status !== "OPEN") throw Errors.conflict("This period is already locked.");
  await recomputePeriod(ctx.companyId, period.startDate, period.endDate);
  const ex = await listExceptions(ctx, period.startDate, period.endDate);
  const open = ex.absences.length + ex.incomplete.length + ex.pendingLeaveCount;
  if (open && !input.force) {
    throw new AppError(409, "EXCEPTIONS_OPEN", `Sort out ${open} open item${open === 1 ? "" : "s"} first (absences, missing clock-outs, leave requests), or lock anyway with a note.`, {
      absences: ex.absences.length,
      incomplete: ex.incomplete.length,
      pendingLeave: ex.pendingLeaveCount,
    });
  }
  if (open && input.force && !input.note) throw Errors.invalid("Add a note explaining why the period is locked with open items.");

  const totals = await computeTotals(ctx.companyId, period.startDate, period.endDate);
  await db.transaction(async (tx) => {
    await tx.delete(payPeriodLines).where(eq(payPeriodLines.payPeriodId, period.id));
    const rows = totals.flatMap((t) =>
      Object.entries(t.lines).map(([payCode, l]) => ({
        companyId: ctx.companyId,
        payPeriodId: period.id,
        employeeId: t.employeeId,
        payCode,
        minutes: l.minutes,
        days: String(l.days),
      })),
    );
    if (rows.length) await tx.insert(payPeriodLines).values(rows);
    await tx
      .update(payPeriods)
      .set({ status: "LOCKED", lockedBy: ctx.userId, lockedAt: new Date(), lockNote: input.note ?? null })
      .where(eq(payPeriods.id, period.id));
    await audit(ctx, "payroll.locked", "pay_period", period.id, { openItems: open, note: input.note ?? null, employees: totals.length }, tx);
  });
}

/** Admins only. Keeps the export history; the next lock writes a fresh snapshot. */
export async function reopenPayPeriod(ctx: AuthContext, id: string, note: string) {
  assertCan(ctx, "settings:manage");
  const period = await loadPeriod(ctx, id);
  if (period.status === "OPEN") throw Errors.conflict("This period is already open.");
  await db.transaction(async (tx) => {
    await tx.delete(payPeriodLines).where(eq(payPeriodLines.payPeriodId, period.id));
    await tx.update(payPeriods).set({ status: "OPEN", lockedBy: null, lockedAt: null }).where(eq(payPeriods.id, period.id));
    await audit(ctx, "payroll.reopened", "pay_period", period.id, { note, wasExported: period.status === "EXPORTED" }, tx);
  });
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const hours = (minutes: number) => (minutes / 60).toFixed(2);

/**
 * Payroll file from the frozen totals:
 *   lines  one row per employee per pay code (works with any payroll import that maps codes)
 *   wide   one row per employee, a column per pay code (spreadsheet friendly)
 * Hours are decimal (7.50 = 7h30m). Leave codes also carry days.
 */
export async function exportPayPeriod(ctx: AuthContext, id: string, format: "lines" | "wide") {
  const period = await loadPeriod(ctx, id);
  if (period.status === "OPEN") throw Errors.conflict("Lock the period before exporting it.");
  const totals = await snapshotTotals(ctx.companyId, period.id, period.startDate, period.endDate);
  const codes = sortPayCodes(totals.flatMap((t) => Object.keys(t.lines)));

  let csv: string;
  let rowCount: number;
  if (format === "lines") {
    const rows = [["employee_number", "employee_name", "period_start", "period_end", "pay_code", "hours", "days"]];
    for (const t of totals) {
      for (const code of codes) {
        const l = t.lines[code];
        if (l) rows.push([t.employeeNumber, t.name, period.startDate, period.endDate, code, hours(l.minutes), l.days ? l.days.toFixed(2) : ""]);
      }
    }
    rowCount = rows.length - 1;
    csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  } else {
    const header = ["employee_number", "employee_name", ...codes.flatMap((c) => (c.startsWith("LEAVE_") || c === "PUBLIC_HOLIDAY" || c === "ABSENT" ? [`${c}_hours`, `${c}_days`] : [`${c}_hours`]))];
    const rows = [header];
    for (const t of totals) {
      rows.push([
        t.employeeNumber,
        t.name,
        ...codes.flatMap((c) => {
          const l = t.lines[c];
          const h = l ? hours(l.minutes) : "0.00";
          return c.startsWith("LEAVE_") || c === "PUBLIC_HOLIDAY" || c === "ABSENT" ? [h, l ? l.days.toFixed(2) : "0.00"] : [h];
        }),
      ]);
    }
    rowCount = totals.length;
    csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  }

  await db.transaction(async (tx) => {
    await tx.insert(payExports).values({
      companyId: ctx.companyId,
      payPeriodId: period.id,
      target: format === "lines" ? "CSV_LINES" : "CSV_WIDE",
      rowCount,
      summary: { employees: totals.length, codes },
      createdBy: ctx.userId,
    });
    await tx.update(payPeriods).set({ status: "EXPORTED" }).where(eq(payPeriods.id, period.id));
    await audit(ctx, "payroll.exported", "pay_period", period.id, { format, rowCount }, tx);
  });
  return { csv: `${csv}\n`, filename: `payroll_${period.startDate}_${period.endDate}_${format}.csv` };
}
