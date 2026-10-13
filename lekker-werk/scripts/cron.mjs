/**
 * Scheduled jobs runner for a cron service (Railway cron, Task Scheduler, GitHub Actions...).
 * Calls the app's protected job endpoints.
 *
 *   node scripts/cron.mjs maintenance   # hourly: holidays, leave accrual, absences, cleanup
 *   node scripts/cron.mjs sync          # every 15 min: due ERP / payroll syncs
 *
 * Needs APP_URL and CRON_SECRET in the environment.
 */
const job = process.argv[2];
if (!["maintenance", "sync"].includes(job)) {
  console.error("Usage: node scripts/cron.mjs maintenance|sync");
  process.exit(1);
}
const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
if (!base || !process.env.CRON_SECRET) {
  console.error("APP_URL and CRON_SECRET must be set.");
  process.exit(1);
}
const res = await fetch(`${base}/api/jobs/${job}`, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  signal: AbortSignal.timeout(10 * 60_000),
});
const body = await res.text();
console.log(`[cron] ${job} -> ${res.status} ${body.slice(0, 500)}`);
if (!res.ok) process.exit(1);
