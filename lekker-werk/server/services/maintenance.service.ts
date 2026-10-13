import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purgeExpiredSessions } from "./authentication.service";
import { purgeRateLimits } from "./rate-limit.service";
import { notify } from "./notification.service";

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
  return { forgottenCompanies: forgotten.length };
}
