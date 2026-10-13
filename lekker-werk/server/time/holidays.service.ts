import "server-only";
import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { publicHolidays } from "@/db/schema";
import { southAfricanHolidays } from "@/lib/sa-holidays";

/**
 * National holidays are shared rows (company_id null), generated from the Public Holidays Act
 * rules. Idempotent: safe to run on every maintenance tick. Ad-hoc national holidays (election
 * days) are added the same way, by date.
 */
export async function ensureNationalHolidays(years: number[], executor: Db | Tx = db) {
  const rows = years.flatMap((y) => southAfricanHolidays(y)).map((h) => ({ companyId: null, holidayDate: h.date, name: h.name }));
  if (!rows.length) return 0;
  const res = await executor
    .insert(publicHolidays)
    .values(rows)
    .onConflictDoNothing()
    .returning({ id: publicHolidays.id });
  return res.length;
}

/** National + company-specific holidays in a date range, as date -> name. */
export async function holidaysBetween(companyId: string, from: string, to: string, executor: Db | Tx = db) {
  const rows = await executor
    .select({ date: publicHolidays.holidayDate, name: publicHolidays.name })
    .from(publicHolidays)
    .where(
      and(
        or(isNull(publicHolidays.companyId), eq(publicHolidays.companyId, companyId)),
        gte(publicHolidays.holidayDate, from),
        lte(publicHolidays.holidayDate, to),
      ),
    );
  return new Map(rows.map((r) => [r.date, r.name]));
}

export async function isPublicHoliday(companyId: string, date: string, executor: Db | Tx = db) {
  const [row] = await executor
    .select({ x: sql`1` })
    .from(publicHolidays)
    .where(
      and(
        or(isNull(publicHolidays.companyId), eq(publicHolidays.companyId, companyId)),
        eq(publicHolidays.holidayDate, date),
      ),
    )
    .limit(1);
  return Boolean(row);
}
