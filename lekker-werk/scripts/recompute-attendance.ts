/**
 * Rebuilds derived attendance (attendance_records + break_records) from the clock_events ledger.
 * Run after changing how hours are calculated, or after changing a company's rules.
 *
 *   npm run attendance:recompute                    # every company, last 62 days
 *   npm run attendance:recompute -- --days 365
 *   npm run attendance:recompute -- --company <id>
 */
import { loadEnv } from "./_env";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadEnv();
  const { sql } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  const { recomputeDay } = await import("@/server/services/attendance.service");

  const days = Number(arg("days") ?? 62);
  const company = arg("company");
  // Every employee/day that has events in the window, in each location's local calendar.
  const pairs = (
    await db.execute(sql`
      select distinct ce.employee_id as "employeeId",
        (ce.occurred_at at time zone l.timezone)::date::text as "workDate"
      from clock_events ce
      join employees e on e.id = ce.employee_id
      join locations l on l.id = e.location_id
      where ce.occurred_at >= now() - make_interval(days => ${days})
        ${company ? sql`and ce.company_id = ${company}` : sql``}
      order by 1, 2`)
  ).rows as { employeeId: string; workDate: string }[];

  for (const [i, p] of pairs.entries()) {
    await recomputeDay(db, p.employeeId, p.workDate);
    if (i % 100 === 0) process.stdout.write(`  ${i}/${pairs.length}\r`);
  }
  console.log(`Recomputed ${pairs.length} employee-days.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
