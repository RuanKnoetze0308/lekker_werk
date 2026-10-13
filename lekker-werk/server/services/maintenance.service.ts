import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purgeExpiredSessions } from "./authentication.service";
import { purgeRateLimits } from "./rate-limit.service";
import { notify } from "./notification.service";
import { addDays, localDate } from "@/lib/time";
import { recomputeDay } from "./attendance.service";
import { ensureNationalHolidays } from "../time/holidays.service";
import { runLeaveAccruals } from "../time/leave.service";

/** Housekeeping + exception detection. Call from a scheduler (see /api/jobs/maintenance). */
export async function runMaintenance() {
  await purgeExpiredSessions();
  await purgeRateLimits();
  await db.execute(sql`delete from link_codes where expires_at < now() - interval '7 days'`);
  await db.execute(sql`delete from conversation_states where expires_at < now()`);
  await db.execute(sql`delete from password_resets where expires_at < now() - interval '1 day'`);

  // Employees whose last accepted event is an open clock-in older than the max shift length.
  const forgotten = (
    await db.execute(sql`
      select s.company_id, count(*)::int as n from (
        select distinct on (ce.employee_id) ce.company_id, ce.employee_id, ce.event_type, ce.occurred_at
        from clock_events ce
        where ce.occurred_at >= now() - interval '3 days' and ce.validation_status = 'ACCEPTED'
        order by ce.employee_id, ce.occurred_at desc
      ) s
      join company_settings cs on cs.company_id = s.company_id
      where s.event_type in ('CLOCK_IN','BREAK_START','BREAK_END')
        and s.occurred_at < now() - make_interval(hours => coalesce((cs.settings->'attendance'->>'maxShiftHours')::int, 16))
      group by s.company_id`)
  ).rows as { company_id: string; n: number }[];

  for (const f of forgotten) {
    const recent = await db.execute(sql`select 1 from notifications
      where company_id = ${f.company_id} and type = 'FORGOT_CLOCK_OUT' and created_at > now() - interval '24 hours' limit 1`);
    if (recent.rows.length) continue;
    await notify({
      companyId: f.company_id,
      type: "FORGOT_CLOCK_OUT",
      title: `${f.n} employee${f.n === 1 ? "" : "s"} forgot to clock out`,
      body: "Review incomplete attendance records and correct them.",
    });
  }
  // Time & leave: holidays for this year and next, leave accruals, and yesterday's final
  // attendance (that's when "not clocked" becomes an absence, leave or holiday day).
  const year = new Date().getUTCFullYear();
  await ensureNationalHolidays([year, year + 1]);
  const companies = (await db.execute(sql`select c.id, c.timezone from companies c where c.status = 'ACTIVE'`)).rows as { id: string; timezone: string }[];
  let accrued = 0;
  let closedDays = 0;
  for (const c of companies) {
    const today = localDate(new Date(), c.timezone);
    accrued += await runLeaveAccruals(c.id, today);
    const staff = (await db.execute(sql`select id from employees where company_id = ${c.id} and status = 'ACTIVE'`)).rows as { id: string }[];
    for (const e of staff) {
      await recomputeDay(db, e.id, addDays(today, -1));
      closedDays++;
    }
  }
  return { forgottenCompanies: forgotten.length, leaveEntriesAccrued: accrued, daysClosed: closedDays };
}
