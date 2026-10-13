import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { payPeriods } from "@/db/schema";
import { AppError } from "../errors";

/**
 * Once a pay period is locked its hours are final: nothing may change attendance on those days
 * (clock punches, corrections, leave decisions, closures) until an admin reopens it.
 */
export async function findLockedPeriod(companyId: string, from: string, to: string, executor: Db | Tx = db) {
  const [row] = await executor
    .select({ id: payPeriods.id, startDate: payPeriods.startDate, endDate: payPeriods.endDate })
    .from(payPeriods)
    .where(
      and(
        eq(payPeriods.companyId, companyId),
        inArray(payPeriods.status, ["LOCKED", "EXPORTED"]),
        lte(payPeriods.startDate, to),
        gte(payPeriods.endDate, from),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function assertDatesOpen(companyId: string, from: string, to: string = from, executor: Db | Tx = db) {
  const locked = await findLockedPeriod(companyId, from, to, executor);
  if (locked) {
    throw new AppError(
      409,
      "PERIOD_LOCKED",
      `The pay period ${locked.startDate} to ${locked.endDate} is locked. Reopen it under Payroll to change these days.`,
    );
  }
}
