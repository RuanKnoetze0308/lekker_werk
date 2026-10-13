/**
 * Demo data for a company, created through the real services and the real clocking engine, so
 * what you see in the dashboard is exactly what production code produces. Every row it creates
 * is listed in demo_data_registry; `npm run demo:clean` removes all of it and nothing else.
 *
 *   npm run demo:seed                    # the only company, 4 weeks of history
 *   npm run demo:seed -- --company <id>  # pick a company when there are several
 *   npm run demo:seed -- --days 14
 *
 * What it builds:
 *   - 2 extra locations (Cape Town Warehouse, Durban Depot) next to your existing ones
 *   - 12 employees, schedules (shop hours, early + late warehouse shifts, standard week)
 *   - QR codes, an RFID reader and a PIN kiosk, cards and PINs
 *   - Telegram / WhatsApp chats linked with real link codes through the chat pipeline
 *   - weeks of clock-ins: on time, late, breaks, overtime, early leavers, forgotten clock-outs,
 *     absences and a few rejected attempts, each sent through the method that employee uses
 *   - one live WhatsApp clock-in right now, through the full conversation flow
 *   - an integration request
 *   - a demo admin login (password written to scripts/demo/.demo-login.json, git-ignored)
 */
import { loadEnv } from "../_env";

type Method = "TELEGRAM" | "WHATSAPP" | "RFID" | "PIN";
interface Person {
  first: string;
  last: string;
  dept: string;
  position: string;
  site: "SHOP" | "WAREHOUSE" | "DEPOT";
  schedule: "SHOP" | "WH_EARLY" | "WH_LATE" | "STANDARD";
  method: Method;
}

const PEOPLE: Person[] = [
  { first: "Thabo", last: "Nkosi", dept: "Retail", position: "Store supervisor", site: "SHOP", schedule: "SHOP", method: "TELEGRAM" },
  { first: "Lerato", last: "Mokoena", dept: "Retail", position: "Cashier", site: "SHOP", schedule: "SHOP", method: "TELEGRAM" },
  { first: "Pieter", last: "van der Merwe", dept: "Retail", position: "Sales assistant", site: "SHOP", schedule: "SHOP", method: "TELEGRAM" },
  { first: "Ayesha", last: "Patel", dept: "Retail", position: "Sales assistant", site: "SHOP", schedule: "SHOP", method: "TELEGRAM" },
  { first: "Sipho", last: "Dlamini", dept: "Warehouse", position: "Forklift operator", site: "WAREHOUSE", schedule: "WH_EARLY", method: "RFID" },
  { first: "Nomvula", last: "Khumalo", dept: "Warehouse", position: "Picker", site: "WAREHOUSE", schedule: "WH_EARLY", method: "RFID" },
  { first: "Johan", last: "Botha", dept: "Warehouse", position: "Shift lead", site: "WAREHOUSE", schedule: "WH_EARLY", method: "RFID" },
  { first: "Zanele", last: "Mthembu", dept: "Warehouse", position: "Picker", site: "WAREHOUSE", schedule: "WH_LATE", method: "RFID" },
  { first: "Kagiso", last: "Molefe", dept: "Warehouse", position: "Packer", site: "WAREHOUSE", schedule: "WH_LATE", method: "RFID" },
  { first: "Fatima", last: "Adams", dept: "Logistics", position: "Dispatch clerk", site: "DEPOT", schedule: "STANDARD", method: "WHATSAPP" },
  { first: "Mandla", last: "Zulu", dept: "Logistics", position: "Driver", site: "DEPOT", schedule: "STANDARD", method: "WHATSAPP" },
  { first: "Chantel", last: "Jacobs", dept: "Logistics", position: "Admin officer", site: "DEPOT", schedule: "STANDARD", method: "PIN" },
];

/** The WhatsApp employee who clocks in live at the end, through the whole conversation flow. */
const LIVE_EMPLOYEE = "Mandla";

/** Deterministic randomness: re-seeding produces the same story. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadEnv();
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  const S = await import("@/db/schema");
  const { employeeSchema, scheduleSchema } = await import("@/lib/schemas/workforce");
  const { addDays, isoWeekday, localDate, parseHHmm, startOfLocalDay } = await import("@/lib/time");
  const { getBillingAccess } = await import("@/server/billing/billing.service");
  const { processClock } = await import("@/server/clocking/clocking.service");
  const { createDevice } = await import("@/server/devices/device.service");
  const { issueCredential } = await import("@/server/devices/credential.service");
  const { submitPunches } = await import("@/server/devices/device-ingest");
  const { simulateChat } = await import("@/server/channels/simulator");
  const { createEmployee } = await import("@/server/services/employee.service");
  const { createLocation, listLocations } = await import("@/server/services/location.service");
  const { createQrCode, getQrToken } = await import("@/server/services/qr.service");
  const { assignSchedule, createSchedule } = await import("@/server/services/schedule.service");
  const { recomputeDay } = await import("@/server/services/attendance.service");
  const { createIntegrationRequest } = await import("@/server/services/integration-request.service");
  const { createUser } = await import("@/server/services/user.service");
  const { randomToken } = await import("@/lib/crypto");
  const { writeFileSync } = await import("node:fs");
  type AuthContext = import("@/server/auth/context").AuthContext;

  // ---- Company + acting admin -------------------------------------------------------------
  const companies = await db.select().from(S.companies);
  const company = arg("company") ? companies.find((c) => c.id === arg("company")) : companies.length === 1 ? companies[0] : undefined;
  if (!company) {
    console.error(companies.length ? "Several companies exist. Pass --company <id>:" : "No company yet. Sign up in the app first.");
    for (const c of companies) console.error(`  ${c.id}  ${c.name}`);
    process.exit(1);
  }
  const already = await db.select().from(S.demoDataRegistry).where(eq(S.demoDataRegistry.companyId, company.id)).limit(1);
  if (already.length) {
    console.error(`Demo data already exists for ${company.name}. Run \`npm run demo:clean\` first.`);
    process.exit(1);
  }
  const [admin] = await db
    .select()
    .from(S.users)
    .where(and(eq(S.users.companyId, company.id), eq(S.users.role, "COMPANY_ADMIN")))
    .limit(1);
  const billing = await getBillingAccess(company.id);
  if (billing.locked) {
    console.error("This company's trial/subscription is inactive, so clocking is paused. Fix billing first.");
    process.exit(1);
  }
  const ctx: AuthContext = {
    userId: admin.id,
    companyId: company.id,
    role: "COMPANY_ADMIN",
    name: admin.name,
    email: admin.email,
    locationScope: null,
    billing,
  };

  const track = (entityType: string, entityId: string) =>
    db.insert(S.demoDataRegistry).values({ entityType, entityId, companyId: company.id });

  const tz = company.timezone;
  const days = Number(arg("days") ?? 28);
  const today = localDate(new Date(), tz);
  const firstDay = addDays(today, -days);
  const random = rng(20261010);
  const between = (a: number, b: number) => a + Math.round(random() * (b - a));
  const chance = (p: number) => random() < p;
  console.log(`Seeding demo data for ${company.name} (${firstDay} → ${today})`);

  // ---- Locations ----------------------------------------------------------------------------
  const existing = await listLocations(ctx);
  const shop = existing[0];
  const warehouse = await createLocation(ctx, {
    name: "Cape Town Warehouse",
    address: "12 Bofors Circle, Epping Industria, Cape Town",
    latitude: -33.9299,
    longitude: 18.5357,
  });
  const depot = await createLocation(ctx, {
    name: "Durban Depot",
    address: "45 Edwin Swales Dr, Rossburgh, Durban",
    latitude: -29.8987,
    longitude: 30.9914,
  });
  await track("location", warehouse.id);
  await track("location", depot.id);
  const site = { SHOP: shop.id, WAREHOUSE: warehouse.id, DEPOT: depot.id };

  // ---- Schedules ----------------------------------------------------------------------------
  const week = (d: number[], start: string, end: string, breakMinutes: number) => d.map((day) => ({ day, start, end, breakMinutes }));
  const schedules = {
    SHOP: await createSchedule(ctx, scheduleSchema.parse({
      name: "Shop hours (demo)", locationId: shop.id,
      days: [...week([1, 2, 3, 4, 5], "08:00", "17:00", 60), { day: 6, start: "08:00", end: "13:00", breakMinutes: 0 }],
    })),
    WH_EARLY: await createSchedule(ctx, scheduleSchema.parse({
      name: "Warehouse early shift (demo)", locationId: warehouse.id, days: week([1, 2, 3, 4, 5], "06:00", "14:30", 30),
    })),
    WH_LATE: await createSchedule(ctx, scheduleSchema.parse({
      name: "Warehouse late shift (demo)", locationId: warehouse.id, days: week([1, 2, 3, 4, 5, 6], "14:00", "22:30", 30),
    })),
    STANDARD: await createSchedule(ctx, scheduleSchema.parse({
      name: "Depot standard week (demo)", locationId: depot.id, days: week([1, 2, 3, 4, 5], "08:00", "17:00", 60),
    })),
  };
  for (const s of Object.values(schedules)) await track("work_schedule", s.id);
  const scheduleDays = Object.fromEntries(
    await Promise.all(
      Object.entries(schedules).map(async ([k, s]) => {
        const [row] = await db.select().from(S.workSchedules).where(eq(S.workSchedules.id, s.id));
        return [k, row.days];
      }),
    ),
  ) as Record<Person["schedule"], { day: number; start: string; end: string; breakMinutes?: number }[]>;

  // ---- QR codes + devices -------------------------------------------------------------------
  const qr: Record<string, { id: string; token: string }> = {};
  for (const [key, locationId] of Object.entries(site)) {
    const row = await createQrCode(ctx, { locationId, label: "Entrance (demo)", type: "GENERAL" });
    await track("qr_code", row.id);
    qr[key] = { id: row.id, token: await getQrToken(ctx, row.id) };
  }
  const reader = await createDevice(ctx, {
    locationId: warehouse.id, kind: "RFID_READER", name: "Warehouse gate reader", serialNumber: "ZK-RF-2041", fixedAction: null,
  });
  const kiosk = await createDevice(ctx, {
    locationId: depot.id, kind: "KIOSK", name: "Depot reception tablet", serialNumber: null, fixedAction: null,
  });
  await track("clock_device", reader.id);
  await track("clock_device", kiosk.id);
  const [readerRow] = await db.select().from(S.clockDevices).where(eq(S.clockDevices.id, reader.id));
  const [kioskRow] = await db.select().from(S.clockDevices).where(eq(S.clockDevices.id, kiosk.id));

  // ---- Employees, credentials, chat links ---------------------------------------------------
  interface Emp extends Person { id: string; chatId?: string; card?: string; pin?: string }
  const emps: Emp[] = [];
  for (const [i, p] of PEOPLE.entries()) {
    const n = String(i + 1).padStart(3, "0");
    const row = await createEmployee(ctx, employeeSchema.parse({
      locationId: site[p.site],
      employeeNumber: `DEMO-${n}`,
      firstName: p.first,
      lastName: p.last,
      email: `${p.first}.${p.last.replace(/\s/g, "")}@demo.lekkerwerk.test`.toLowerCase(),
      phone: `+27 82 555 ${n.padStart(4, "0")}`,
      department: p.dept,
      position: p.position,
      preferredChannel: p.method === "WHATSAPP" ? "WHATSAPP" : p.method === "TELEGRAM" ? "TELEGRAM" : null,
    }));
    await track("employee", row.id);
    await assignSchedule(ctx, { employeeId: row.id, scheduleId: schedules[p.schedule].id, effectiveFrom: firstDay });
    const emp: Emp = { ...p, id: row.id };

    if (p.method === "RFID") {
      emp.card = `04A1${String(i + 1).padStart(4, "0")}`;
      await issueCredential(ctx, row.id, { kind: "RFID_CARD", value: emp.card, label: "Staff card" });
    } else if (p.method === "PIN") {
      emp.pin = "4821";
      await issueCredential(ctx, row.id, { kind: "PIN", value: emp.pin, label: null });
    } else {
      emp.chatId = `sim-demo-${p.first.toLowerCase()}`;
      await track("chat", `${p.method}:${emp.chatId}`);
      // The real linking conversation: a one-time code sent to the bot.
      const res = await simulateChat(ctx, { channel: p.method, externalId: emp.chatId, displayName: p.first, linkEmployeeId: row.id });
      if (!res.replies[0]?.text.startsWith("Welcome")) throw new Error(`Linking ${p.first} failed: ${res.replies[0]?.text}`);
    }
    emps.push(emp);
  }
  console.log(`  ${emps.length} employees, 3 QR codes, 2 devices, cards/PINs and chat links`);

  // ---- Shifts -------------------------------------------------------------------------------
  type Action = "CLOCK_IN" | "CLOCK_OUT" | "BREAK_START" | "BREAK_END";
  interface Punch { at: Date; emp: Emp; action: Action }
  const punches: Punch[] = [];
  const now = new Date();
  const at = (date: string, minutes: number) => new Date(startOfLocalDay(date, tz).getTime() + minutes * 60_000);

  for (let d = firstDay; d <= today; d = addDays(d, 1)) {
    for (const e of emps) {
      if (e.first === LIVE_EMPLOYEE && d === today) continue;
      const plan = scheduleDays[e.schedule].find((x) => x.day === isoWeekday(d));
      if (!plan || chance(0.04)) continue; // day off / absent
      const start = parseHHmm(plan.start);
      const end = parseHHmm(plan.end);

      const late = chance(0.1);
      const inAt = start + (late ? between(9, 40) : between(-12, 4));
      const overtime = chance(0.12);
      const leftEarly = !overtime && chance(0.05);
      const outAt = end + (overtime ? between(40, 150) : leftEarly ? -between(30, 90) : between(-3, 15));
      const forgot = chance(0.03);

      punches.push({ at: at(d, inAt), emp: e, action: "CLOCK_IN" });
      if (plan.breakMinutes) {
        const bStart = Math.round((start + end) / 2) - 30 + between(-20, 20);
        punches.push({ at: at(d, bStart), emp: e, action: "BREAK_START" });
        punches.push({ at: at(d, bStart + plan.breakMinutes + between(-5, 12)), emp: e, action: "BREAK_END" });
      }
      if (!forgot) punches.push({ at: at(d, outAt), emp: e, action: "CLOCK_OUT" });
    }
  }
  const due = punches.filter((p) => p.at < now).sort((a, b) => a.at.getTime() - b.at.getTime());

  // Each punch goes in the way that employee really clocks: chat + QR, card on the reader, PIN on the kiosk.
  let accepted = 0;
  let rejected = 0;
  let seq = 0;
  async function send(p: Punch, opts: { tapAuto?: boolean; card?: string } = {}) {
    const e = p.emp;
    if (e.method === "RFID" || e.method === "PIN") {
      const device = e.method === "RFID" ? readerRow : kioskRow;
      // Readers send AUTO for in/out taps (the engine decides); break buttons send an explicit action.
      const auto = p.action === "CLOCK_IN" || p.action === "CLOCK_OUT";
      const [r] = await submitPunches(
        device,
        [{
          punchId: `demo-${++seq}`,
          credential: e.method === "RFID" ? { kind: "RFID_CARD", value: opts.card ?? e.card! } : { kind: "PIN", value: e.pin! },
          action: auto && opts.tapAuto !== false ? undefined : p.action,
        }],
        { now: p.at },
      );
      return r.status === "ACCEPTED";
    }
    const r = await processClock({
      companyId: company!.id,
      action: p.action,
      source: e.method,
      identity: { kind: "CHAT", channel: e.method, externalId: e.chatId! },
      qrToken: qr[e.site].token,
      now: p.at,
    });
    return r.ok;
  }

  for (const [i, p] of due.entries()) {
    if (await send(p)) accepted++;
    else rejected++;
    if (i % 200 === 0) process.stdout.write(`  clocking ${i}/${due.length}\r`);
  }

  // A few realistic failures so the "Pending issues" and audit views have something to show.
  const sipho = emps.find((e) => e.first === "Sipho")!;
  const lerato = emps.find((e) => e.first === "Lerato")!;
  const lastIn = due.filter((p) => p.emp === sipho && p.action === "CLOCK_IN").at(-1);
  if (lastIn) {
    await send({ ...lastIn, at: new Date(lastIn.at.getTime() + 20_000) }); // double tap -> DUPLICATE
    await send({ ...lastIn, at: new Date(lastIn.at.getTime() + 3600_000) }, { card: "04FFFF99" }); // unknown card
    rejected += 2;
  }
  await processClock({
    companyId: company.id, action: "CLOCK_IN", source: "TELEGRAM",
    identity: { kind: "CHAT", channel: "TELEGRAM", externalId: lerato.chatId! },
    now: new Date(now.getTime() - 26 * 3600_000), // forgot to scan the QR code -> QR_INVALID
  });
  rejected++;
  console.log(`  ${accepted} clock events accepted, ${rejected} rejected attempts logged`);

  // Final pass with the real clock, so forgotten clock-outs show as INCOMPLETE everywhere.
  for (const e of emps) {
    for (let d = firstDay; d <= today; d = addDays(d, 1)) await recomputeDay(db, e.id, d);
  }

  // ---- Live: a full WhatsApp conversation, right now -----------------------------------------
  const live = emps.find((e) => e.first === LIVE_EMPLOYEE)!;
  const scan = await simulateChat(ctx, { channel: "WHATSAPP", externalId: live.chatId!, scanQrId: qr.DEPOT.id });
  const clockIn = await simulateChat(ctx, { channel: "WHATSAPP", externalId: live.chatId!, text: "CLOCK_IN" });
  console.log(`  live WhatsApp chat (${live.first}):`);
  for (const r of [...scan.replies, ...clockIn.replies]) console.log(`    bot: ${r.text.split("\n")[0]}`);

  // ---- Integration request --------------------------------------------------------------------
  const req = await createIntegrationRequest(ctx, {
    systemName: "Sage VIP Payroll",
    category: "PAYROLL",
    website: "https://www.sage.com/en-za/",
    contactEmail: admin.email,
    dataNeeded: "Approved hours and overtime per employee into the monthly pay run",
    notes: "Demo request created by the seed script.",
  });
  await track("integration_request", req.id);

  // ---- Demo admin login (for walkthroughs and automated UI checks; removed by demo:clean) -----
  const login = { email: `demo-admin+${company.id.slice(0, 8)}@demo.lekkerwerk.test`, password: randomToken(18) };
  const demoAdmin = await createUser(ctx, { name: "Demo Admin", email: login.email, role: "COMPANY_ADMIN", password: login.password, locationIds: [] });
  await track("user", demoAdmin.id);
  writeFileSync("scripts/demo/.demo-login.json", JSON.stringify({ ...login, url: process.env.APP_URL }, null, 2));

  const [{ n }] = (await db.execute(sql`select count(*)::int as n from clock_events where company_id = ${company.id}`)).rows as { n: number }[];
  console.log(`Done. ${n} clock events in the database. Open the dashboard to see them.`);
  console.log("Demo admin login saved to scripts/demo/.demo-login.json");
  console.log(`Demo card numbers: ${emps.filter((e) => e.card).map((e) => `${e.first} ${e.card}`).join(", ")}; kiosk PIN for Chantel: 4821`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
