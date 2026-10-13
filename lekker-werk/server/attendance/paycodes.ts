// Turns derived attendance days into payroll totals per pay code. Pure, no I/O.
//
// LekkerWerk reports *time* by category; the payroll system applies the rates (1.5x, 2x...)
// from the employee's contract. Codes:
//   NORMAL                   ordinary hours
//   OVERTIME                 over the daily threshold, or over contracted weekly hours
//   SUNDAY                   all hours worked on a Sunday
//   PUBLIC_HOLIDAY_WORKED    hours worked on a public holiday
//   PUBLIC_HOLIDAY           paid holiday on a scheduled day that wasn't worked
//   LEAVE_<CODE>             approved leave by type (minutes and days)
//   ABSENT                   unexplained absence (scheduled minutes, normally unpaid)
//   CLOSURE_PAID / CLOSURE_UNPAID   site closure stand-down

export interface PayDay {
  workDate: string;
  status: string;
  workedMinutes: number;
  overtimeMinutes: number;
  scheduledMinutes: number;
  leaveMinutes: number;
  leaveCode: string | null;
  publicHoliday: boolean;
  closureMinutes: number;
  closurePaid: boolean;
}

export interface PayTerms {
  contractedMinutesPerWeek: number;
  overtimeEligible: boolean;
}

export type PayLines = Record<string, { minutes: number; days: number }>;

function isoWeekKey(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() - day + 1); // Monday of that week
  return d.toISOString().slice(0, 10);
}

export function computePayLines(days: PayDay[], terms: PayTerms): PayLines {
  const lines: PayLines = {};
  const add = (code: string, minutes: number, days = 0) => {
    if (!minutes && !days) return;
    const l = (lines[code] ??= { minutes: 0, days: 0 });
    l.minutes += minutes;
    l.days = Math.round((l.days + days) * 100) / 100;
  };

  const normalByWeek = new Map<string, number>();
  for (const d of days) {
    const sunday = new Date(`${d.workDate}T00:00:00Z`).getUTCDay() === 0;
    if (d.workedMinutes > 0) {
      if (d.publicHoliday) add("PUBLIC_HOLIDAY_WORKED", d.workedMinutes);
      else if (sunday) add("SUNDAY", d.workedMinutes);
      else {
        const overtime = Math.min(d.overtimeMinutes, d.workedMinutes);
        add("NORMAL", d.workedMinutes - overtime);
        add("OVERTIME", overtime);
        const wk = isoWeekKey(d.workDate);
        normalByWeek.set(wk, (normalByWeek.get(wk) ?? 0) + d.workedMinutes - overtime);
      }
    }
    if (d.status === "PUBLIC_HOLIDAY") add("PUBLIC_HOLIDAY", d.scheduledMinutes, 1);
    if (d.leaveMinutes > 0 && d.leaveCode) {
      add(`LEAVE_${d.leaveCode}`, d.leaveMinutes, d.scheduledMinutes ? d.leaveMinutes / d.scheduledMinutes : 1);
    }
    if (d.status === "ABSENT") add("ABSENT", d.scheduledMinutes, 1);
    if (d.closureMinutes > 0) add(d.closurePaid ? "CLOSURE_PAID" : "CLOSURE_UNPAID", d.closureMinutes);
  }

  // Ordinary time above the contracted week is overtime even if no single day crossed the line.
  for (const normal of normalByWeek.values()) {
    const excess = normal - terms.contractedMinutesPerWeek;
    if (excess > 0) {
      add("NORMAL", -excess);
      add("OVERTIME", excess);
    }
  }

  // No overtime in the contract: everything worked on ordinary days is normal time.
  if (!terms.overtimeEligible && lines.OVERTIME) {
    add("NORMAL", lines.OVERTIME.minutes);
    delete lines.OVERTIME;
  }
  for (const [code, l] of Object.entries(lines)) if (!l.minutes && !l.days) delete lines[code];
  return lines;
}
