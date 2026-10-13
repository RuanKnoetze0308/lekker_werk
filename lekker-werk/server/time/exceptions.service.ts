import "server-only";
import { and, asc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { attendanceRecords, employees, leaveRequests, locations } from "@/db/schema";
import type { z } from "zod";
import type { resolveAbsenceSchema } from "@/lib/schemas/time";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "../services/audit.service";
import { requestLeaveAsManager } from "./leave.service";

function scope(ctx: AuthContext, column: typeof employees.locationId): SQL | undefined {
  if (ctx.locationScope === null) return undefined;
  return ctx.locationScope.length ? inArray(column, ctx.locationScope) : sql`false`;
}

/**
 * Everything a manager must sort out before hours are final, for a date range (normally the
 * open pay period): unexplained absences, forgotten clock-outs and leave waiting for a decision.
 */
export async function listExceptions(ctx: AuthContext, from: string, to: string) {
  assertCan(ctx, "attendance:read");
  const rows = (status: "ABSENT" | "INCOMPLETE") =>
    db
      .select({
        id: attendanceRecords.id,
        workDate: attendanceRecords.workDate,
        employeeId: employees.id,
        employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
        employeeNumber: employees.employeeNumber,
        locationName: locations.name,
        timezone: locations.timezone,
        scheduledMinutes: attendanceRecords.scheduledMinutes,
        firstClockIn: attendanceRecords.firstClockIn,
      })
      .from(attendanceRecords)
      .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
      .innerJoin(locations, eq(locations.id, attendanceRecords.locationId))
      .where(
        and(
          eq(attendanceRecords.companyId, ctx.companyId),
          eq(attendanceRecords.status, status),
          gte(attendanceRecords.workDate, from),
          lte(attendanceRecords.workDate, to),
          scope(ctx, employees.locationId),
        ),
      )
      .orderBy(asc(attendanceRecords.workDate), asc(employees.lastName));

  const [absences, incomplete, pendingLeave] = await Promise.all([
    rows("ABSENT"),
    rows("INCOMPLETE"),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(leaveRequests)
      .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
      .where(
        and(
          eq(leaveRequests.companyId, ctx.companyId),
          eq(leaveRequests.status, "REQUESTED"),
          lte(leaveRequests.startDate, to),
          scope(ctx, employees.locationId),
        ),
      ),
  ]);
  return { absences, incomplete, pendingLeaveCount: pendingLeave[0].count };
}

/**
 * Explains an absence after the fact (sick, family emergency, unpaid, AWOL): recorded as
 * approved leave of that type for the day, so balances and payroll stay consistent.
 */
export async function resolveAbsence(ctx: AuthContext, attendanceRecordId: string, input: z.infer<typeof resolveAbsenceSchema>) {
  assertCan(ctx, "leave:approve");
  const [rec] = await db
    .select({ employeeId: attendanceRecords.employeeId, workDate: attendanceRecords.workDate, status: attendanceRecords.status, locationId: attendanceRecords.locationId })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.id, attendanceRecordId), eq(attendanceRecords.companyId, ctx.companyId)));
  if (!rec) throw Errors.notFound("Attendance record");
  assertLocationAccess(ctx, rec.locationId);
  if (rec.status !== "ABSENT") throw Errors.conflict("This day is no longer an unexplained absence.");

  const res = await requestLeaveAsManager(ctx, {
    employeeId: rec.employeeId,
    leaveTypeId: input.leaveTypeId,
    startDate: rec.workDate,
    endDate: rec.workDate,
    dayFraction: 1,
    reason: input.note ?? "Absence explained by manager",
    documentRef: null,
    approve: true,
  });
  await audit(ctx, "absence.resolved", "attendance_record", attendanceRecordId, { leaveRequestId: res.id, leaveTypeId: input.leaveTypeId });
  return res;
}
