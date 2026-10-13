import "server-only";
import { and, eq, gte, lte } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { leaveRequests, siteClosures } from "@/db/schema";
import { isPublicHoliday } from "./holidays.service";

/**
 * Everything besides clock events that decides what a day was: approved leave, public holiday,
 * site closure. Read by recomputeDay; kept free of service imports to avoid import cycles.
 */
export async function loadDayContext(
  companyId: string,
  employeeId: string,
  locationId: string,
  date: string,
  executor: Db | Tx = db,
) {
  const [leave] = await executor
    .select({ leaveTypeId: leaveRequests.leaveTypeId, dayFraction: leaveRequests.dayFraction })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, employeeId),
        eq(leaveRequests.status, "APPROVED"),
        lte(leaveRequests.startDate, date),
        gte(leaveRequests.endDate, date),
      ),
    )
    .limit(1);
  const [closure] = await executor
    .select({ paid: siteClosures.paid })
    .from(siteClosures)
    .where(
      and(
        eq(siteClosures.companyId, companyId),
        eq(siteClosures.locationId, locationId),
        lte(siteClosures.startDate, date),
        gte(siteClosures.endDate, date),
      ),
    )
    .limit(1);
  return {
    leave: leave ? { leaveTypeId: leave.leaveTypeId, fraction: Number(leave.dayFraction) } : null,
    closure: closure ?? null,
    publicHoliday: await isPublicHoliday(companyId, date, executor),
  };
}
