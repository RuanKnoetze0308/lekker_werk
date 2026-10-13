import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import {
  leaveAccrual,
  leaveLedgerKind,
  leaveRequestStatus,
  leaveSource,
  payPeriodStatus,
  payType,
} from "./enums";
import { companies, locations, users } from "./tenancy";
import { employees } from "./people";

// What counts as a normal week for this employee. Effective-dated so history stays correct when
// a contract changes. Pay rates deliberately live in the payroll system, not here.
export const employmentTerms = pgTable(
  "employment_terms",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    payType: payType("pay_type").notNull().default("HOURLY"),
    contractedMinutesPerWeek: integer("contracted_minutes_per_week").notNull(),
    daysPerWeek: integer("days_per_week").notNull(),
    // Salaried staff without overtime: everything worked is reported as normal time.
    overtimeEligible: boolean("overtime_eligible").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("employment_terms_employee_idx").on(t.employeeId, t.effectiveFrom.desc())],
);

// Per-company leave types, seeded with South African BCEA defaults and editable.
export const leaveTypes = pgTable(
  "leave_types",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // Stable code used in payroll exports: ANNUAL, SICK, FAMILY, MATERNITY, PARENTAL, UNPAID, AWOL, or custom.
    code: text("code").notNull(),
    name: text("name").notNull(),
    paid: boolean("paid").notNull(),
    accrual: leaveAccrual("accrual").notNull().default("NONE"),
    // Days granted per cycle (MONTHLY spreads them over the cycle; CYCLE_UPFRONT grants them at its start).
    entitlementDays: numeric("entitlement_days", { precision: 6, scale: 2 }).notNull().default("0"),
    cycleMonths: integer("cycle_months").notNull().default(12),
    // A supporting document (e.g. sick note) is needed when the absence runs longer than this many days.
    documentAfterDays: integer("document_after_days"),
    // Employees may request it themselves (via chat or web); otherwise managers record it.
    employeeRequestable: boolean("employee_requestable").notNull().default(true),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("leave_types_company_code_uq").on(t.companyId, t.code)],
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    leaveTypeId: uuid("leave_type_id").notNull().references(() => leaveTypes.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // 1 = full days, 0.5 = half days.
    dayFraction: numeric("day_fraction", { precision: 3, scale: 2 }).notNull().default("1"),
    // Working days the request covers (scheduled days, excluding public holidays) x day_fraction.
    days: numeric("days", { precision: 6, scale: 2 }).notNull(),
    status: leaveRequestStatus("status").notNull().default("REQUESTED"),
    source: leaveSource("source").notNull(),
    reason: text("reason"),
    // Supporting document (sick note) once file storage is wired; for now a reference/description.
    documentRef: text("document_ref"),
    requestedBy: uuid("requested_by").references(() => users.id),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("leave_requests_company_status_idx").on(t.companyId, t.status, t.startDate),
    index("leave_requests_employee_dates_idx").on(t.employeeId, t.startDate, t.endDate),
  ],
);

// Append-only balance ledger: balance = sum(days). Accruals, usage, reversals and expiries are
// separate rows so every balance can be explained line by line.
export const leaveLedger = pgTable(
  "leave_ledger",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    leaveTypeId: uuid("leave_type_id").notNull().references(() => leaveTypes.id),
    entryDate: date("entry_date").notNull(),
    kind: leaveLedgerKind("kind").notNull(),
    days: numeric("days", { precision: 7, scale: 2 }).notNull(),
    leaveRequestId: uuid("leave_request_id").references(() => leaveRequests.id),
    // Makes accrual runs idempotent: e.g. "ACCRUAL:2026-10" or "CYCLE:3".
    idempotencyKey: text("idempotency_key"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index("leave_ledger_balance_idx").on(t.employeeId, t.leaveTypeId),
    uniqueIndex("leave_ledger_idem_uq")
      .on(t.employeeId, t.leaveTypeId, t.idempotencyKey)
      .where(sql`${t.idempotencyKey} is not null`),
  ],
);

// Load-shedding, a strike, a burst pipe: the site can't operate, so scheduled time isn't absence.
export const siteClosures = pgTable(
  "site_closures",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    locationId: uuid("location_id").notNull().references(() => locations.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    // Paid stand-down vs unpaid; payroll decides the rate, we report the minutes.
    paid: boolean("paid").notNull(),
    reason: text("reason").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("site_closures_location_dates_idx").on(t.locationId, t.startDate, t.endDate)],
);

export const payPeriods = pgTable(
  "pay_periods",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: payPeriodStatus("status").notNull().default("OPEN"),
    lockedBy: uuid("locked_by").references(() => users.id),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockNote: text("lock_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("pay_periods_company_start_uq").on(t.companyId, t.startDate),
    index("pay_periods_company_dates_idx").on(t.companyId, t.startDate, t.endDate),
  ],
);

// Frozen totals per employee per pay code, written when a period is locked. Reports over long
// ranges read these, so they never change when rules or corrections change later.
export const payPeriodLines = pgTable(
  "pay_period_lines",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    payPeriodId: uuid("pay_period_id").notNull().references(() => payPeriods.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    payCode: text("pay_code").notNull(),
    minutes: integer("minutes").notNull().default(0),
    days: numeric("days", { precision: 6, scale: 2 }).notNull().default("0"),
  },
  (t) => [
    uniqueIndex("pay_period_lines_uq").on(t.payPeriodId, t.employeeId, t.payCode),
    index("pay_period_lines_employee_idx").on(t.employeeId),
  ],
);

export const payExports = pgTable(
  "pay_exports",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    payPeriodId: uuid("pay_period_id").notNull().references(() => payPeriods.id),
    // CSV_LINES, CSV_WIDE, or an integration provider once connectors push directly.
    target: text("target").notNull(),
    integrationId: uuid("integration_id"),
    rowCount: integer("row_count").notNull(),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("pay_exports_period_idx").on(t.payPeriodId, t.createdAt.desc())],
);
