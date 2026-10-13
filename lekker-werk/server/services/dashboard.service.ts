import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { workSchedules } from "@/db/schema";
import { addDays, isoWeekday, localDate, localMinutes, parseHHmm } from "@/lib/time";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { getCompany, getSettings } from "./company.service";

export interface DashboardFilters {
  date?: string;
  locationId?: string;
  department?: string;
  managerId?: string;
}

function empConditions(ctx: AuthContext, f: DashboardFilters, alias = "e"): SQL {
  const parts: SQL[] = [sql.raw(`${alias}.company_id`).append(sql` = ${ctx.companyId}`)];
  const col = (c: string) => sql.raw(`${alias}.${c}`);
  if (ctx.locationScope !== null) {
    parts.push(
      ctx.locationScope.length
        ? sql`${col("location_id")} in (${sql.join(ctx.locationScope.map((id) => sql`${id}::uuid`), sql`, `)})`
        : sql`false`,
    );
  }
  if (f.locationId) parts.push(sql`${col("location_id")} = ${f.locationId}`);
  if (f.department) parts.push(sql`${col("department")} = ${f.department}`);
  if (f.managerId) parts.push(sql`${col("manager_id")} = ${f.managerId}`);
  return sql.join(parts, sql` and `);
}

type Row = Record<string, unknown>;
const rows = async (q: SQL) => (await db.execute(q)).rows as Row[];

export async function getDashboardOverview(ctx: AuthContext, f: DashboardFilters = {}) {
  assertCan(ctx, "dashboard:view");
  if (f.locationId) assertLocationAccess(ctx, f.locationId);

  const company = await getCompany(ctx);
  const settings = (await getSettings(ctx.companyId)).attendance;
  const tz = company.timezone;
  const now = new Date();
  const today = f.date ?? localDate(now, tz);
  const isToday = today === localDate(now, tz);
  const monthStart = `${today.slice(0, 8)}01`;
  const cond = empConditions(ctx, f);
  const since = new Date(now.getTime() - settings.maxShiftHours * 3600_000);

  // Total active employees + per-location headcount
  const perLocation = await rows(sql`
    select l.id as "locationId", l.name, count(e.id)::int as employees
    from locations l
    left join employees e on e.location_id = l.id and e.status = 'ACTIVE'
      ${f.department ? sql`and e.department = ${f.department}` : sql``}
      ${f.managerId ? sql`and e.manager_id = ${f.managerId}` : sql``}
    where l.company_id = ${ctx.companyId} and l.status = 'ACTIVE'
      ${f.locationId ? sql`and l.id = ${f.locationId}` : sql``}
      ${
        ctx.locationScope === null
          ? sql``
          : ctx.locationScope.length
            ? sql`and l.id in (${sql.join(ctx.locationScope.map((id) => sql`${id}::uuid`), sql`, `)})`
            : sql`and false`
      }
    group by l.id, l.name
    order by l.name`);
  const totalEmployees = perLocation.reduce((n, r) => n + Number(r.employees), 0);

  // Current state per employee (latest accepted event) — bounded to the max-shift window.
  let inNow = 0;
  let onBreak = 0;
  if (isToday) {
    const states = await rows(sql`
      select s.event_type as "eventType", count(*)::int as n from (
        select distinct on (ce.employee_id) ce.employee_id, ce.event_type
        from clock_events ce
        join employees e on e.id = ce.employee_id
        where ce.company_id = ${ctx.companyId}
          and ce.occurred_at >= ${since.toISOString()}
          and ce.validation_status = 'ACCEPTED'
          and e.status = 'ACTIVE' and ${cond}
          and not exists (select 1 from clock_events c2 where c2.corrects_event_id = ce.id)
        order by ce.employee_id, ce.occurred_at desc
      ) s group by s.event_type`);
    for (const r of states) {
      if (r.eventType === "CLOCK_IN" || r.eventType === "BREAK_END") inNow += Number(r.n);
      if (r.eventType === "BREAK_START") onBreak += Number(r.n);
    }
  }

  const [day] = await rows(sql`
    select count(*)::int as present,
      coalesce(sum(a.worked_minutes),0)::int as worked,
      coalesce(sum(a.scheduled_minutes),0)::int as scheduled,
      coalesce(sum(a.overtime_minutes),0)::int as overtime,
      (count(*) filter (where a.late_minutes > 0))::int as late,
      (count(*) filter (where a.early_departure_minutes > 0))::int as early
    from attendance_records a join employees e on e.id = a.employee_id
    where a.company_id = ${ctx.companyId} and a.work_date = ${today} and ${cond}`);

  // Absent = scheduled day, past start+grace, no clock-in yet. (Default schedule drives the estimate.)
  const [defSched] = await db
    .select()
    .from(workSchedules)
    .where(and(eq(workSchedules.companyId, ctx.companyId), isNull(workSchedules.locationId)))
    .orderBy(asc(workSchedules.createdAt))
    .limit(1);
  const dayDef = defSched?.days.find((d) => d.day === isoWeekday(today));
  const workingDay = settings.workingWeek.includes(isoWeekday(today)) && Boolean(dayDef ?? !defSched);
  const startMin = dayDef ? parseHHmm(dayDef.start) : 8 * 60;
  const dayMinutes = dayDef ? parseHHmm(dayDef.end) - parseHHmm(dayDef.start) - (dayDef.breakMinutes ?? 0) : 0;
  const pastStart = !isToday || localMinutes(now, tz) > startMin + (defSched?.graceMinutes ?? 5);
  const absent = workingDay && pastStart ? Math.max(0, totalEmployees - Number(day.present)) : 0;

  const [exceptions] = await rows(sql`
    select
      (select count(*)::int from attendance_records a join employees e on e.id = a.employee_id
        where a.company_id = ${ctx.companyId} and a.status = 'INCOMPLETE'
          and a.work_date >= ${addDays(today, -7)} and ${cond}) as incomplete,
      (select count(*)::int from clock_attempts ca
        where ca.company_id = ${ctx.companyId} and ca.status = 'REJECTED'
          and ca.created_at >= ${new Date(now.getTime() - 24 * 3600_000).toISOString()}) as rejected`);

  const [period] = await rows(sql`
    select coalesce(sum(a.worked_minutes),0)::int as worked,
      coalesce(sum(a.scheduled_minutes),0)::int as scheduled,
      coalesce(sum(a.overtime_minutes),0)::int as overtime,
      count(*)::int as days
    from attendance_records a join employees e on e.id = a.employee_id
    where a.company_id = ${ctx.companyId} and a.work_date >= ${monthStart} and a.work_date <= ${today} and ${cond}`);

  let workingDays = 0;
  for (let d = monthStart; d <= today; d = addDays(d, 1)) {
    if (settings.workingWeek.includes(isoWeekday(d))) workingDays++;
  }
  const possible = totalEmployees * workingDays;

  return {
    date: today,
    timezone: tz,
    isToday,
    today: {
      clockedIn: inNow,
      onBreak,
      clockedOut: Math.max(0, totalEmployees - inNow - onBreak),
      workedMinutes: Number(day.worked),
      scheduledMinutes: Number(day.scheduled) + absent * Math.max(0, dayMinutes),
      lateArrivals: Number(day.late),
      earlyDepartures: Number(day.early),
      absent,
      overtimeMinutes: Number(day.overtime),
      incompleteRecords: Number(exceptions.incomplete),
      rejectedAttempts: Number(exceptions.rejected),
    },
    workforce: {
      totalEmployees,
      perLocation: perLocation.map((r) => ({
        locationId: String(r.locationId),
        name: String(r.name),
        employees: Number(r.employees),
      })),
      monthWorkedMinutes: Number(period.worked),
      monthScheduledMinutes: Number(period.scheduled),
      monthOvertimeMinutes: Number(period.overtime),
      attendanceRate: possible ? Math.min(100, Math.round((Number(period.days) / possible) * 100)) : null,
    },
  };
}

/** Location drill-down: who is where right now, plus today's hours per employee. */
export async function getLocationDay(ctx: AuthContext, locationId: string, date?: string) {
  assertCan(ctx, "dashboard:view");
  assertLocationAccess(ctx, locationId);
  const company = await getCompany(ctx);
  const day = date ?? localDate(new Date(), company.timezone);
  return rows(sql`
    select e.id as "employeeId", e.first_name || ' ' || e.last_name as name, e.employee_number as "employeeNumber",
      a.first_clock_in as "firstClockIn", a.last_clock_out as "lastClockOut",
      coalesce(a.worked_minutes,0)::int as worked, coalesce(a.overtime_minutes,0)::int as overtime,
      coalesce(a.late_minutes,0)::int as late, a.status
    from employees e
    left join attendance_records a on a.employee_id = e.id and a.work_date = ${day}
    where e.company_id = ${ctx.companyId} and e.location_id = ${locationId} and e.status = 'ACTIVE'
    order by e.last_name, e.first_name
    limit 500`);
}

/**
 * Who is on the clock right now: each employee whose latest event (inside the max-shift
 * window) isn't a clock-out, with when their current shift started and how they clocked in.
 */
export async function getLiveBoard(ctx: AuthContext, f: DashboardFilters = {}) {
  assertCan(ctx, "dashboard:view");
  const settings = (await getSettings(ctx.companyId)).attendance;
  const since = new Date(Date.now() - settings.maxShiftHours * 3600_000).toISOString();
  const cond = empConditions(ctx, f);
  const live = sql`ce.company_id = ${ctx.companyId} and ce.occurred_at >= ${since}
    and ce.validation_status = 'ACCEPTED'
    and not exists (select 1 from clock_events c2 where c2.corrects_event_id = ce.id)`;
  return rows(sql`
    with latest as (
      select distinct on (ce.employee_id) ce.employee_id, ce.event_type, ce.location_id
      from clock_events ce join employees e on e.id = ce.employee_id
      where ${live} and e.status = 'ACTIVE' and ${cond}
      order by ce.employee_id, ce.occurred_at desc
    ), shift as (
      select distinct on (ce.employee_id) ce.employee_id, ce.occurred_at, ce.source, d.name as device_name
      from clock_events ce left join clock_devices d on d.id = ce.device_id
      where ${live} and ce.event_type = 'CLOCK_IN'
      order by ce.employee_id, ce.occurred_at desc
    )
    select e.id as "employeeId", e.first_name || ' ' || e.last_name as name, l.name as "locationName",
      l.timezone, latest.event_type = 'BREAK_START' as "onBreak", shift.occurred_at as "since",
      shift.source, shift.device_name as "deviceName"
    from latest
    join shift on shift.employee_id = latest.employee_id
    join employees e on e.id = latest.employee_id
    join locations l on l.id = latest.location_id
    where latest.event_type <> 'CLOCK_OUT'
    order by shift.occurred_at
    limit 200`);
}

/** Latest accepted clock events, newest first: the "what just happened" feed. */
export async function getRecentActivity(ctx: AuthContext, f: DashboardFilters = {}, limit = 12) {
  assertCan(ctx, "dashboard:view");
  const cond = empConditions(ctx, f);
  return rows(sql`
    select ce.id, ce.event_type as "eventType", ce.occurred_at as "occurredAt", ce.source,
      d.name as "deviceName", e.id as "employeeId", e.first_name || ' ' || e.last_name as name,
      l.name as "locationName", l.timezone
    from clock_events ce
    join employees e on e.id = ce.employee_id
    join locations l on l.id = ce.location_id
    left join clock_devices d on d.id = ce.device_id
    where ce.company_id = ${ctx.companyId} and ce.validation_status = 'ACCEPTED' and ${cond}
    order by ce.occurred_at desc
    limit ${limit}`);
}

/** Hours per employee over a date range (from derived attendance), most hours first. */
export async function getHoursByEmployee(ctx: AuthContext, from: string, to: string, f: DashboardFilters = {}, limit = 10) {
  assertCan(ctx, "dashboard:view");
  const cond = empConditions(ctx, f);
  return rows(sql`
    select e.id as "employeeId", e.first_name || ' ' || e.last_name as name, l.name as "locationName",
      coalesce(sum(a.worked_minutes),0)::int as worked, coalesce(sum(a.scheduled_minutes),0)::int as scheduled,
      coalesce(sum(a.overtime_minutes),0)::int as overtime, count(a.id)::int as days,
      (count(*) filter (where a.late_minutes > 0))::int as "lateDays",
      (count(*) filter (where a.status = 'INCOMPLETE'))::int as incomplete
    from attendance_records a
    join employees e on e.id = a.employee_id
    join locations l on l.id = e.location_id
    where a.company_id = ${ctx.companyId} and a.work_date >= ${from} and a.work_date <= ${to} and ${cond}
    group by e.id, e.first_name, e.last_name, l.name
    order by worked desc
    limit ${limit}`);
}
