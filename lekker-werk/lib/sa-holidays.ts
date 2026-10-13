// South African public holidays (Public Holidays Act 36 of 1994). Pure, no I/O.

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Western Easter Sunday (Anonymous Gregorian algorithm). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * All public holidays for a year, including the Act's rule that a holiday falling on a Sunday
 * is observed on the Monday after. Ad-hoc holidays (elections, special declarations) are added
 * per year in the database by an admin.
 */
export function southAfricanHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const easterDate = iso(year, easter.month, easter.day);
  const fixed: Holiday[] = [
    { date: iso(year, 1, 1), name: "New Year's Day" },
    { date: iso(year, 3, 21), name: "Human Rights Day" },
    { date: shift(easterDate, -2), name: "Good Friday" },
    { date: shift(easterDate, 1), name: "Family Day" },
    { date: iso(year, 4, 27), name: "Freedom Day" },
    { date: iso(year, 5, 1), name: "Workers' Day" },
    { date: iso(year, 6, 16), name: "Youth Day" },
    { date: iso(year, 8, 9), name: "National Women's Day" },
    { date: iso(year, 9, 24), name: "Heritage Day" },
    { date: iso(year, 12, 16), name: "Day of Reconciliation" },
    { date: iso(year, 12, 25), name: "Christmas Day" },
    { date: iso(year, 12, 26), name: "Day of Goodwill" },
  ];
  const taken = new Set(fixed.map((h) => h.date));
  const observed: Holiday[] = [];
  for (const h of fixed) {
    if (new Date(`${h.date}T00:00:00Z`).getUTCDay() !== 0) continue;
    let monday = shift(h.date, 1);
    while (taken.has(monday)) monday = shift(monday, 1); // e.g. 25 Dec on Sunday, 26 Dec on Monday
    taken.add(monday);
    observed.push({ date: monday, name: `${h.name} (observed)` });
  }
  return [...fixed, ...observed].sort((a, b) => a.date.localeCompare(b.date));
}
