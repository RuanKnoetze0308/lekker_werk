/**
 * The whole contract between LekkerWerk and an external system. A connector implements
 * `testConnection` plus one or both directions. See docs/INTEGRATIONS.md for a walkthrough.
 */

/** Hours coming IN from an ERP, in our own shape regardless of the system. */
export interface NormalizedHours {
  /** The other system's id for this row. Re-importing the same id updates the row (no duplicates). */
  externalRecordId: string;
  /** Matched against employees.employee_number */
  externalEmployeeRef: string;
  workDate: string; // YYYY-MM-DD
  hours: number;
  raw?: Record<string, unknown>;
}

/** One payroll line going OUT: an employee's total for one pay code in a locked pay period. */
export interface PayrollLine {
  employeeNumber: string;
  employeeName: string;
  /** NORMAL, OVERTIME, SUNDAY, PUBLIC_HOLIDAY_WORKED, PUBLIC_HOLIDAY, LEAVE_<code>, ABSENT, ... (server/attendance/paycodes.ts) */
  payCode: string;
  /** Decimal hours: 7.5 = 7h30m. */
  hours: number;
  /** Days, for leave / holiday / absence codes; 0 otherwise. */
  days: number;
}

/** A locked pay period, ready to hand to a payroll or accounting system. */
export interface HoursExport {
  /** Stable id of the pay period. Use it as the idempotency key on the other side. */
  periodId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  company: { id: string; name: string };
  lines: PayrollLine[];
}

export interface PushResult {
  /** How many lines the other system accepted. */
  accepted: number;
  /** The other system's batch / journal / pay-run reference, if it gives one. */
  reference?: string;
}

/** What the customer typed into the connect form. `credentials` are decrypted just for this call. */
export interface ProviderSettings {
  config: Record<string, string>;
  credentials: Record<string, string>;
}

export interface IntegrationProviderImpl {
  /** Throw (AppError with a clear message) when the settings don't work. Return = connected. */
  testConnection(s: ProviderSettings): Promise<void>;
  /** IMPORT: hours recorded in the other system, pulled on a schedule by the sync job. */
  fetchHours?(s: ProviderSettings, range: { from: Date; to: Date }): Promise<NormalizedHours[]>;
  /** EXPORT: a locked pay period pushed to the other system (Payroll → "Send to ..."). Must be idempotent per periodId. */
  pushHours?(s: ProviderSettings, payload: HoursExport): Promise<PushResult>;
}
