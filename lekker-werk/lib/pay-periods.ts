// Pay period boundaries from a company's payroll settings. Pure, no I/O.
import type { PayrollSettings } from "@/db/schema/system";
import { addDays } from "./time";

export interface PeriodBounds {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function ymd(y: number, m: number, d: number) {
  // Normalises month overflow (m = 13 -> January next year).
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

/** The pay period that contains `date`. */
export function periodContaining(date: string, s: Pick<PayrollSettings, "frequency" | "monthStartDay" | "anchorDate">): PeriodBounds {
  if (s.frequency === "MONTHLY") {
    const [y, m, d] = date.split("-").map(Number);
    // With start day 26: 26 Sep - 25 Oct contains 10 Oct; 26 Oct - 25 Nov contains 28 Oct.
    const startMonth = d >= s.monthStartDay ? m : m - 1;
    const start = ymd(y, startMonth, s.monthStartDay);
    const end = addDays(ymd(y, startMonth + 1, s.monthStartDay), -1);
    return { start, end };
  }
  const length = s.frequency === "WEEKLY" ? 7 : 14;
  const offset = daysBetween(s.anchorDate, date);
  const index = Math.floor(offset / length); // works before the anchor too (negative index)
  const start = addDays(s.anchorDate, index * length);
  return { start, end: addDays(start, length - 1) };
}

export function previousPeriod(p: PeriodBounds, s: Parameters<typeof periodContaining>[1]): PeriodBounds {
  return periodContaining(addDays(p.start, -1), s);
}
