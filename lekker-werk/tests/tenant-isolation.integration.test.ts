/**
 * Tenant isolation: an admin of company A calls every id-based operation with company B's ids
 * and must get 403/404, with B's data unchanged. Covers ids in the URL (getEmployee(ctx, id)) and
 * ids inside the body (createQrCode({ locationId })).
 *
 * Needs two companies in the local database, one with demo data (`npm run demo:seed`).
 * Run with `npm run test:integration`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../scripts/_env";

loadEnv();

const { and, eq, ne, sql } = await import("drizzle-orm");
const { db } = await import("@/db/client");
const S = await import("@/db/schema");
const { AppError } = await import("@/server/errors");
const employeeSvc = await import("@/server/services/employee.service");
const locationSvc = await import("@/server/services/location.service");
const dashboardSvc = await import("@/server/services/dashboard.service");
const qrSvc = await import("@/server/services/qr.service");
const scheduleSvc = await import("@/server/services/schedule.service");
const userSvc = await import("@/server/services/user.service");
const attendanceSvc = await import("@/server/services/attendance.service");
const deviceSvc = await import("@/server/devices/device.service");
const credentialSvc = await import("@/server/devices/credential.service");
const leaveSvc = await import("@/server/time/leave.service");
const closureSvc = await import("@/server/time/closures.service");
const payrollSvc = await import("@/server/time/payroll.service");
const termsSvc = await import("@/server/time/terms.service");
const exceptionsSvc = await import("@/server/time/exceptions.service");

type Ctx = Parameters<typeof employeeSvc.getEmployee>[0];

// Company B: the one with the most employees (demo data). Company A: any other with a location.
const [b] = (
  await db.execute(sql`select company_id as id from employees group by company_id order by count(*) desc limit 1`)
).rows as { id: string }[];
const [a] = b
  ? ((
      await db.execute(sql`select l.company_id as id from locations l where l.company_id <> ${b.id} limit 1`)
    ).rows as { id: string }[])
  : [];

function adminCtx(companyId: string, userId: string): Ctx {
  return {
    userId,
    companyId,
    role: "COMPANY_ADMIN",
    name: "Isolation test",
    email: "isolation@test",
    locationScope: null,
    billing: { locked: false } as Ctx["billing"],
  };
}

const first = async <T,>(q: Promise<T[]>) => (await q)[0];

describe.skipIf(!a || !b)("tenant isolation", () => {
  let ctxA: Ctx;
  let ctxB: Ctx;
  const B: Record<string, string> = {};
  let empA = "";

  beforeAll(async () => {
    const userA = await first(db.select({ id: S.users.id }).from(S.users).where(eq(S.users.companyId, a.id)));
    const userB = await first(db.select({ id: S.users.id }).from(S.users).where(eq(S.users.companyId, b.id)));
    ctxA = adminCtx(a.id, userA!.id);
    ctxB = adminCtx(b.id, userB!.id);
    empA = (await first(db.select({ id: S.employees.id }).from(S.employees).where(eq(S.employees.companyId, a.id))))?.id ?? "";

    const pick = async (name: string, q: Promise<{ id: string }[]>) => {
      const row = await first(q);
      if (row) B[name] = row.id;
    };
    await pick("employee", db.select({ id: S.employees.id }).from(S.employees).where(eq(S.employees.companyId, b.id)));
    await pick("location", db.select({ id: S.locations.id }).from(S.locations).where(eq(S.locations.companyId, b.id)));
    await pick("qr", db.select({ id: S.qrCodes.id }).from(S.qrCodes).where(eq(S.qrCodes.companyId, b.id)));
    await pick("device", db.select({ id: S.clockDevices.id }).from(S.clockDevices).where(eq(S.clockDevices.companyId, b.id)));
    await pick("schedule", db.select({ id: S.workSchedules.id }).from(S.workSchedules).where(eq(S.workSchedules.companyId, b.id)));
    await pick("leave", db.select({ id: S.leaveRequests.id }).from(S.leaveRequests).where(eq(S.leaveRequests.companyId, b.id)));
    await pick("leaveType", db.select({ id: S.leaveTypes.id }).from(S.leaveTypes).where(eq(S.leaveTypes.companyId, b.id)));
    await pick("closure", db.select({ id: S.siteClosures.id }).from(S.siteClosures).where(eq(S.siteClosures.companyId, b.id)));
    await pick("period", db.select({ id: S.payPeriods.id }).from(S.payPeriods).where(eq(S.payPeriods.companyId, b.id)));
    await pick("account", db.select({ id: S.communicationAccounts.id }).from(S.communicationAccounts).where(eq(S.communicationAccounts.companyId, b.id)));
    await pick("credential", db.select({ id: S.employeeCredentials.id }).from(S.employeeCredentials).where(eq(S.employeeCredentials.companyId, b.id)));
    await pick("user", db.select({ id: S.users.id }).from(S.users).where(and(eq(S.users.companyId, b.id), ne(S.users.id, ctxB.userId))));
    await pick("absence", db.select({ id: S.attendanceRecords.id }).from(S.attendanceRecords).where(and(eq(S.attendanceRecords.companyId, b.id), eq(S.attendanceRecords.status, "ABSENT"))));
    B.user ??= ctxB.userId;
  });

  /**
   * Company A calling with B's ids must fail, never succeed: 403/404 for ids in the path, and also
   * 422 ("Invalid location selected") for ids inside a body.
   */
  async function denied(need: string[], call: () => Promise<unknown>, statuses = [403, 404]) {
    if (need.some((k) => !B[k])) return; // no such row in the demo data
    const err = await call().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, "call succeeded across tenants").toBeInstanceOf(AppError);
    expect(statuses).toContain((err as InstanceType<typeof AppError>).status);
  }

  /** Reads: refused, or (for lists that filter by the caller's company) empty. Never B's data. */
  async function noData(need: string[], call: () => Promise<unknown>) {
    if (need.some((k) => !B[k])) return;
    const result = await call().then(
      (r) => ({ ok: true as const, r }),
      (e: unknown) => ({ ok: false as const, e }),
    );
    if (result.ok) expect(result.r, "returned another tenant's data").toEqual([]);
    else expect([403, 404]).toContain((result.e as InstanceType<typeof AppError>).status);
  }

  const deniedInBody = (need: string[], call: () => Promise<unknown>) => denied(need, call, [403, 404, 422]);

  it("is a real check: company B's own admin can read its data", async () => {
    // Demo data has all of these; without them most checks below would silently skip.
    for (const k of ["employee", "location", "qr", "device", "schedule", "leave", "period", "account", "credential", "absence"]) {
      expect(B[k], `company B has no ${k}`).toBeTruthy();
    }
    await expect(employeeSvc.getEmployee(ctxB, B.employee)).resolves.toBeTruthy();
    await expect(locationSvc.getLocation(ctxB, B.location)).resolves.toBeTruthy();
  });

  it("refuses reads of another tenant's records", async () => {
    await noData(["employee"], () => employeeSvc.getEmployee(ctxA, B.employee));
    await noData(["location"], () => locationSvc.getLocation(ctxA, B.location));
    await noData(["location"], () => dashboardSvc.getLocationDay(ctxA, B.location));
    await noData(["location"], () => locationSvc.listLocationManagers(ctxA, B.location));
    await noData(["qr"], () => qrSvc.getQrAsset(ctxA, B.qr));
    await noData(["qr"], () => qrSvc.getQrToken(ctxA, B.qr));
    await noData(["qr"], () => qrSvc.getQrDisplayLink(ctxA, B.qr));
    await noData(["employee"], () => credentialSvc.listCredentials(ctxA, B.employee));
    await noData(["employee"], () => termsSvc.listTerms(ctxA, B.employee));
    await noData(["employee"], () => attendanceSvc.employeeHours(ctxA, B.employee, "2026-01-01", "2026-12-31"));
    await noData(["device"], () => deviceSvc.getDeviceForSimulation(ctxA, B.device));
    await noData(["location"], () => closureSvc.listClosures(ctxA, B.location));
    await noData(["period"], () => payrollSvc.getPayPeriodReport(ctxA, B.period));
    await noData(["period"], () => payrollSvc.exportPayPeriod(ctxA, B.period, "lines"));
  });

  it("refuses changes to another tenant's records", async () => {
    await denied(["employee"], () => employeeSvc.updateEmployee(ctxA, B.employee, { firstName: "Hacked" }));
    await denied(["employee"], () => employeeSvc.setEmployeeActive(ctxA, B.employee, false));
    await denied(["employee"], () => employeeSvc.generateLinkCode(ctxA, B.employee, "TELEGRAM"));
    await denied(["account"], () => employeeSvc.revokeCommunicationAccount(ctxA, B.account));
    await denied(["location"], () => locationSvc.updateLocation(ctxA, B.location, { name: "Hacked" }));
    await denied(["location"], () => locationSvc.setLocationManagers(ctxA, B.location, []));
    await denied(["qr"], () => qrSvc.regenerateQrCode(ctxA, B.qr));
    await denied(["qr"], () => qrSvc.setQrEnabled(ctxA, B.qr, false));
    await denied(["device"], () => deviceSvc.rotateDeviceKey(ctxA, B.device));
    await denied(["device"], () => deviceSvc.updateDevice(ctxA, B.device, { name: "Hacked" } as never));
    await denied(["schedule"], () => scheduleSvc.updateSchedule(ctxA, B.schedule, { name: "Hacked", graceMinutes: 5, days: [] }));
    await denied(["leave"], () => leaveSvc.decideLeave(ctxA, B.leave, { approve: true }));
    await denied(["leave"], () => leaveSvc.cancelLeave(ctxA, B.leave));
    await denied(["closure"], () => closureSvc.deleteClosure(ctxA, B.closure));
    await denied(["period"], () => payrollSvc.lockPayPeriod(ctxA, B.period, { force: true }));
    await denied(["period"], () => payrollSvc.reopenPayPeriod(ctxA, B.period, "isolation test"));
    await denied(["absence", "leaveType"], () => exceptionsSvc.resolveAbsence(ctxA, B.absence, { leaveTypeId: B.leaveType }));
    await denied(["employee"], () =>
      termsSvc.setTerms(ctxA, B.employee, { effectiveFrom: "2026-01-01", payType: "HOURLY", contractedMinutesPerWeek: 2400, daysPerWeek: 5, overtimeEligible: true }),
    );
    await denied(["user"], () => userSvc.setUserStatus(ctxA, B.user, false));
    await denied(["employee", "credential"], () => credentialSvc.revokeCredential(ctxA, B.employee, B.credential));
  });

  it("refuses another tenant's ids inside a request body", async () => {
    await deniedInBody(["location"], () =>
      employeeSvc.createEmployee(ctxA, { locationId: B.location, employeeNumber: "ISO-1", firstName: "Iso", lastName: "Test", extraLocationIds: [] } as never),
    );
    if (empA) await deniedInBody(["location"], () => employeeSvc.updateEmployee(ctxA, empA, { locationId: B.location }));
    await deniedInBody(["location"], () => qrSvc.createQrCode(ctxA, { locationId: B.location, label: "x", type: "GENERAL", mode: "STATIC", rotationSeconds: 30 }));
    await deniedInBody(["location"], () => deviceSvc.createDevice(ctxA, { locationId: B.location, kind: "RFID_READER", name: "x", serialNumber: null } as never));
    await deniedInBody(["location"], () => closureSvc.createClosure(ctxA, B.location, { startDate: "2026-12-24", endDate: "2026-12-24", paid: true, reason: "isolation" } as never));
    await deniedInBody(["employee"], () =>
      attendanceSvc.createCorrection(ctxA, { employeeId: B.employee, eventType: "CLOCK_IN", occurredAt: new Date(), note: "isolation test" }),
    );
    await deniedInBody(["employee"], () => credentialSvc.issueCredential(ctxA, B.employee, { kind: "RFID_CARD", value: "ISO123" } as never));
    if (empA) await deniedInBody(["schedule"], () => scheduleSvc.assignSchedule(ctxA, { employeeId: empA, scheduleId: B.schedule, effectiveFrom: "2026-01-01" }));
    await deniedInBody(["location"], () =>
      userSvc.createUser(ctxA, { name: "Iso Test", email: `iso${Date.now()}@example.com`, role: "MANAGER", password: "Iso-Test-12345", locationIds: [B.location] }),
    );
  });

  it("left company B's data unchanged", async () => {
    const emp = await first(db.select().from(S.employees).where(eq(S.employees.id, B.employee)));
    expect(emp?.firstName).not.toBe("Hacked");
    expect(emp?.status).toBe("ACTIVE");
    const loc = await first(db.select().from(S.locations).where(eq(S.locations.id, B.location)));
    expect(loc?.name).not.toBe("Hacked");
    if (B.device) {
      const dev = await first(db.select().from(S.clockDevices).where(eq(S.clockDevices.id, B.device)));
      expect(dev?.name).not.toBe("Hacked");
    }
  });
});
