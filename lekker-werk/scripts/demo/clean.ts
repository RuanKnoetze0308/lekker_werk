/**
 * Removes everything `npm run demo:seed` created (as listed in demo_data_registry), including
 * the clock events, attendance and chat links that hang off demo employees. Real data is untouched.
 *
 *   npm run demo:clean
 *
 * clock_events is append-only by trigger. Removing demo rows is the one legitimate exception, so
 * the trigger is switched off inside this transaction only and switched back on before commit.
 */
import { loadEnv } from "../_env";

async function main() {
  loadEnv();
  const { sql } = await import("drizzle-orm");
  const { db } = await import("@/db/client");

  const reg = (await db.execute(sql`select entity_type, entity_id, company_id from demo_data_registry`)).rows as {
    entity_type: string;
    entity_id: string;
    company_id: string;
  }[];
  if (!reg.length) {
    console.log("No demo data found.");
    process.exit(0);
  }
  const ids = (type: string) => reg.filter((r) => r.entity_type === type).map((r) => r.entity_id);
  // uuid[] literal; '{}' when empty so "= any(...)" simply matches nothing.
  const arr = (list: string[]) => sql`${`{${list.join(",")}}`}::uuid[]`;
  const E = arr(ids("employee"));
  const L = arr(ids("location"));
  const Q = arr(ids("qr_code"));
  const D = arr(ids("clock_device"));
  const W = arr(ids("work_schedule"));
  const R = arr(ids("integration_request"));
  const U = arr(ids("user"));
  const chats = ids("chat").map((c) => c.split(":")[1]);
  const all = reg.map((r) => r.entity_id);

  await db.transaction(async (tx) => {
    const run = async (label: string, q: ReturnType<typeof sql>) => {
      const res = await tx.execute(q);
      if (res.rowCount) console.log(`  ${label}: ${res.rowCount}`);
    };
    await tx.execute(sql`alter table clock_events disable trigger clock_events_immutable`);

    await run("clock attempts", sql`delete from clock_attempts where employee_id = any(${E}) or location_id = any(${L}) or device_id = any(${D}) or qr_code_id = any(${Q})`);
    await run("break records", sql`delete from break_records where employee_id = any(${E})`);
    await run("attendance records", sql`delete from attendance_records where employee_id = any(${E}) or location_id = any(${L})`);
    await run("clock events", sql`delete from clock_events where employee_id = any(${E}) or location_id = any(${L})`);
    await run("credentials", sql`delete from employee_credentials where employee_id = any(${E})`);
    await run("chat accounts", sql`delete from communication_accounts where employee_id = any(${E})`);
    await run("link codes", sql`delete from link_codes where employee_id = any(${E})`);
    await run("chat sessions", sql`delete from conversation_states where external_id = any(${`{${chats.join(",")}}`}::text[])`);
    await run("schedule assignments", sql`delete from employee_schedules where employee_id = any(${E}) or schedule_id = any(${W})`);
    await run("employee locations", sql`delete from employee_locations where employee_id = any(${E}) or location_id = any(${L})`);
    await run("notifications", sql`delete from notifications where payload->>'employeeId' = any(${E}::text[]) or payload->>'integrationRequestId' = any(${R}::text[])`);
    await run("employees", sql`delete from employees where id = any(${E})`);
    await run("QR codes", sql`delete from qr_codes where id = any(${Q}) or location_id = any(${L})`);
    await run("devices", sql`delete from clock_devices where id = any(${D}) or location_id = any(${L})`);
    await run("schedules", sql`delete from work_schedules where id = any(${W}) or location_id = any(${L})`);
    await run("manager locations", sql`delete from manager_locations where location_id = any(${L})`);
    await run("locations", sql`delete from locations where id = any(${L})`);
    await run("integration requests", sql`delete from integration_requests where id = any(${R})`);
    await run("audit entries", sql`delete from audit_logs where entity_id = any(${`{${all.join(",")}}`}::text[]) or user_id = any(${U})`);
    await run("demo users", sql`delete from users where id = any(${U})`);
    await run("registry", sql`delete from demo_data_registry`);

    await tx.execute(sql`alter table clock_events enable trigger clock_events_immutable`);
  });
  console.log("Demo data removed.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Clean failed, nothing was changed:", err.message ?? err);
  process.exit(1);
});
