import "server-only";
import { csvCell } from "@/lib/csv";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { formatMinutes } from "@/lib/time";

export type ReportKind =
  | "daily_attendance"
  | "weekly_hours"
  | "monthly_hours"
  | "overtime"
  | "late_arrivals"
  | "location_attendance"
  | "erp_reconciliation";

export const REPORTS: { kind: ReportKind; label: string; description: string }[] = [
  { kind: "daily_attendance", label: "Daily attendance", description: "Every attendance record in the range." },
  { kind: "weekly_hours", label: "Weekly hours", description: "Hours per employee, grouped by ISO week." },
  { kind: "monthly_hours", label: "Monthly hours", description: "Hours per employee, grouped by month." },
  { kind: "overtime", label: "Overtime", description: "Employees with overtime in the range." },
  { kind: "late_arrivals", label: "Late arrivals", description: "Days an employee clocked in late." },
  { kind: "location_attendance", label: "Location attendance", description: "Hours and attendance by location." },
  { kind: "erp_reconciliation", label: "ERP reconciliation", description: "System hours vs imported ERP hours." },
];

export interface ReportParams {
  kind: ReportKind;
  from: string;
  to: string;
  locationId?: string;
  employeeId?: string;
  department?: string;
}

export interface ReportResult {
  columns: string[];
  rows: (string | number | null)[][];
}

type R = Record<string, unknown>;

export async function runReport(ctx: AuthContext, p: ReportParams): Promise<ReportResult> {
  assertCan(ctx, "reports:read");
  if (p.locationId) assertLocationAccess(ctx, p.locationId);

  const scope =
    ctx.locationScope === null
      ? sql``
      : ctx.locationScope.length
        ? sql`and a.location_id in (${sql.join(ctx.locationScope.map((id) => sql`${id}::uuid`), sql`, `)})`
        : sql`and false`;
  const filters = sql`
    a.company_id = ${ctx.companyId} and a.work_date >= ${p.from} and a.work_date <= ${p.to}
    ${scope}
    ${p.locationId ? sql`and a.location_id = ${p.locationId}` : sql``}
    ${p.employeeId ? sql`and a.employee_id = ${p.employeeId}` : sql``}
    ${p.department ? sql`and e.department = ${p.department}` : sql``}`;
  const name = sql`e.first_name || ' ' || e.last_name`;
  const run = async (q: ReturnType<typeof sql>) => (await db.execute(q)).rows as R[];
  const hm = (v: unknown) => formatMinutes(Number(v ?? 0));

  switch (p.kind) {
    case "daily_attendance": {
      const r = await run(sql`select a.work_date::text as d, ${name} as n, e.employee_number as num, l.name as loc,
        a.worked_minutes w, a.scheduled_minutes s, a.overtime_minutes o, a.late_minutes late, a.status
        from attendance_records a join employees e on e.id=a.employee_id join locations l on l.id=a.location_id
        where ${filters} order by a.work_date desc, e.last_name limit 10000`);
      return {
        columns: ["Date", "Employee", "Number", "Location", "Worked", "Scheduled", "Overtime", "Late (min)", "Status"],
        rows: r.map((x) => [String(x.d), String(x.n), String(x.num), String(x.loc), hm(x.w), hm(x.s), hm(x.o), Number(x.late), String(x.status)]),
      };
    }
    case "weekly_hours":
    case "monthly_hours": {
      const bucket = p.kind === "weekly_hours" ? sql`to_char(a.work_date, 'IYYY-"W"IW')` : sql`to_char(a.work_date, 'YYYY-MM')`;
      const r = await run(sql`select ${bucket} as period, ${name} as n, e.employee_number as num,
        sum(a.worked_minutes)::int w, sum(a.scheduled_minutes)::int s, sum(a.overtime_minutes)::int o, count(*)::int days
        from attendance_records a join employees e on e.id=a.employee_id
        where ${filters} group by 1, e.id order by 1 desc, e.last_name limit 10000`);
      return {
        columns: ["Period", "Employee", "Number", "Days", "Worked", "Scheduled", "Overtime"],
        rows: r.map((x) => [String(x.period), String(x.n), String(x.num), Number(x.days), hm(x.w), hm(x.s), hm(x.o)]),
      };
    }
    case "overtime": {
      const r = await run(sql`select ${name} as n, e.employee_number as num, sum(a.overtime_minutes)::int o, count(*)::int days
        from attendance_records a join employees e on e.id=a.employee_id
        where ${filters} and a.overtime_minutes > 0 group by e.id order by o desc limit 10000`);
      return { columns: ["Employee", "Number", "Overtime days", "Overtime"], rows: r.map((x) => [String(x.n), String(x.num), Number(x.days), hm(x.o)]) };
    }
    case "late_arrivals": {
      const r = await run(sql`select a.work_date::text d, ${name} as n, e.employee_number num, l.name loc, a.late_minutes late
        from attendance_records a join employees e on e.id=a.employee_id join locations l on l.id=a.location_id
        where ${filters} and a.late_minutes > 0 order by a.work_date desc limit 10000`);
      return { columns: ["Date", "Employee", "Number", "Location", "Minutes late"], rows: r.map((x) => [String(x.d), String(x.n), String(x.num), String(x.loc), Number(x.late)]) };
    }
    case "location_attendance": {
      const r = await run(sql`select l.name loc, count(distinct a.employee_id)::int emps, count(*)::int days,
        sum(a.worked_minutes)::int w, sum(a.overtime_minutes)::int o, (count(*) filter (where a.late_minutes>0))::int late
        from attendance_records a join employees e on e.id=a.employee_id join locations l on l.id=a.location_id
        where ${filters} group by l.id order by l.name`);
      return { columns: ["Location", "Employees", "Attendance days", "Worked", "Overtime", "Late days"], rows: r.map((x) => [String(x.loc), Number(x.emps), Number(x.days), hm(x.w), hm(x.o), Number(x.late)]) };
    }
    case "erp_reconciliation": {
      const r = await run(sql`
        select ${name} as n, e.employee_number num,
          coalesce(sys.w,0)::int sys_min, coalesce(imp.h,0)::numeric imp_h
        from employees e
        left join (select a.employee_id, sum(a.worked_minutes) w from attendance_records a
                   where a.company_id=${ctx.companyId} and a.work_date >= ${p.from} and a.work_date <= ${p.to} group by 1) sys on sys.employee_id=e.id
        left join (select ih.employee_id, sum(ih.hours) h from imported_hours ih
                   where ih.company_id=${ctx.companyId} and ih.work_date >= ${p.from} and ih.work_date <= ${p.to} group by 1) imp on imp.employee_id=e.id
        where e.company_id=${ctx.companyId} and (sys.w is not null or imp.h is not null)
          ${ctx.locationScope === null ? sql`` : ctx.locationScope.length ? sql`and e.location_id in (${sql.join(ctx.locationScope.map((id) => sql`${id}::uuid`), sql`, `)})` : sql`and false`}
          ${p.locationId ? sql`and e.location_id = ${p.locationId}` : sql``}
        order by e.last_name limit 10000`);
      return {
        columns: ["Employee", "Number", "System hours", "ERP hours", "Difference"],
        rows: r.map((x) => {
          const sys = Number(x.sys_min) / 60;
          const imp = Number(x.imp_h);
          return [String(x.n), String(x.num), Number(sys.toFixed(2)), Number(imp.toFixed(2)), Number((sys - imp).toFixed(2))];
        }),
      };
    }
  }
}

export function toCsv(result: ReportResult): string {
  return [result.columns, ...result.rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
