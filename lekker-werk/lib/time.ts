// All instants are stored in UTC. These helpers convert to/from a company or location timezone.

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function offsetMs(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Local calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minutes since local midnight. */
export function localMinutes(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** ISO weekday (Mon=1..Sun=7) of a YYYY-MM-DD date. */
export function isoWeekday(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** UTC instant of local midnight at the start of `dateStr` in `timeZone`. */
export function startOfLocalDay(dateStr: string, timeZone: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let result = guess - offsetMs(new Date(guess), timeZone);
  result = guess - offsetMs(new Date(result), timeZone);
  return new Date(result);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** [start, end) UTC range covering the local day. */
export function dayRangeUtc(dateStr: string, timeZone: string): [Date, Date] {
  return [startOfLocalDay(dateStr, timeZone), startOfLocalDay(addDays(dateStr, 1), timeZone)];
}

export function parseHHmm(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function formatMinutes(total: number): string {
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(Math.round(total));
  return `${sign}${Math.floor(abs / 60)}h ${String(abs % 60).padStart(2, "0")}m`;
}

export function formatDateTime(date: Date | string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export function formatTime(date: Date | string | null, timeZone: string): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-ZA", { timeZone, timeStyle: "short" }).format(new Date(date));
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}
