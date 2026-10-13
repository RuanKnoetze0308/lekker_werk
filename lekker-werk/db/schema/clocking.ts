import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import {
  attendanceStatus,
  clockEventType,
  clockSource,
  qrType,
  rejectionReason,
  validationStatus,
} from "./enums";
import { companies, locations, users } from "./tenancy";
import { employees } from "./people";
import { communicationAccounts } from "./channels";
import { clockDevices, employeeCredentials } from "./devices";

export const qrCodes = pgTable(
  "qr_codes",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    locationId: uuid("location_id").notNull().references(() => locations.id),
    label: text("label").notNull(),
    type: qrType("type").notNull().default("GENERAL"),
    // Opaque random token embedded in the QR. Resolved server-side; carries no data itself.
    tokenHash: text("token_hash").notNull(),
    // AES-GCM encrypted raw token so authorised admins can re-download / print the QR later.
    encryptedToken: text("encrypted_token").notNull(),
    // Short display prefix for admins (first chars of the token), never enough to use it.
    tokenHint: text("token_hint").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    regeneratedFromId: uuid("regenerated_from_id"),
    createdBy: uuid("created_by").references(() => users.id),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("qr_codes_token_uq").on(t.tokenHash),
    index("qr_codes_company_location_idx").on(t.companyId, t.locationId, t.enabled),
  ],
);

// Immutable audit trail. Rows are inserted, never updated or deleted
// (enforced by trigger in db/sql/001_immutable_clock_events.sql).
// Attendance is *derived* from these rows.
export const clockEvents = pgTable(
  "clock_events",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    locationId: uuid("location_id").notNull().references(() => locations.id),
    eventType: clockEventType("event_type").notNull(),
    // UTC instant of the event.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    source: clockSource("source").notNull(),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    distanceMeters: doublePrecision("distance_meters"),
    qrCodeId: uuid("qr_code_id").references(() => qrCodes.id),
    communicationAccountId: uuid("communication_account_id").references(
      () => communicationAccounts.id,
    ),
    // Hardware punches: which terminal and which card/PIN/fingerprint identified the employee.
    deviceId: uuid("device_id").references(() => clockDevices.id),
    credentialId: uuid("credential_id").references(() => employeeCredentials.id),
    // Set when a manager corrects a record: new event points at the one it supersedes.
    correctsEventId: uuid("corrects_event_id"),
    correctedBy: uuid("corrected_by").references(() => users.id),
    note: text("note"),
    validationStatus: validationStatus("validation_status").notNull().default("ACCEPTED"),
    createdAt: createdAt(),
  },
  (t) => [
    // Query-pattern driven: dashboard (company+time), employee history, location drill-down.
    index("clock_events_company_time_idx").on(t.companyId, t.occurredAt.desc()),
    index("clock_events_employee_time_idx").on(t.employeeId, t.occurredAt.desc()),
    index("clock_events_location_time_idx").on(t.locationId, t.occurredAt.desc()),
    index("clock_events_device_time_idx").on(t.deviceId, t.occurredAt.desc()),
  ],
);

// Every attempt, including failed ones. Separate from clock_events so the events table
// stays a clean, accepted-only ledger and rejected noise can be pruned independently.
export const clockAttempts = pgTable(
  "clock_attempts",
  {
    id: id(),
    companyId: uuid("company_id").references(() => companies.id),
    employeeId: uuid("employee_id").references(() => employees.id),
    locationId: uuid("location_id").references(() => locations.id),
    qrCodeId: uuid("qr_code_id").references(() => qrCodes.id),
    deviceId: uuid("device_id").references(() => clockDevices.id),
    credentialId: uuid("credential_id").references(() => employeeCredentials.id),
    requestedAction: clockEventType("requested_action").notNull(),
    source: clockSource("source").notNull(),
    status: validationStatus("status").notNull(),
    rejectionReason: rejectionReason("rejection_reason"),
    clockEventId: uuid("clock_event_id").references(() => clockEvents.id),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    externalId: text("external_id"),
    idempotencyKey: text("idempotency_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("clock_attempts_company_time_idx").on(t.companyId, t.createdAt.desc()),
    index("clock_attempts_employee_time_idx").on(t.employeeId, t.createdAt.desc()),
    index("clock_attempts_idem_idx").on(t.idempotencyKey),
  ],
);

// One row per employee per local work day, recomputed from clock_events.
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    locationId: uuid("location_id").notNull().references(() => locations.id),
    // Local calendar day in the location's timezone.
    workDate: date("work_date").notNull(),
    firstClockIn: timestamp("first_clock_in", { withTimezone: true }),
    lastClockOut: timestamp("last_clock_out", { withTimezone: true }),
    workedMinutes: integer("worked_minutes").notNull().default(0),
    breakMinutes: integer("break_minutes").notNull().default(0),
    // Part of break_minutes that the meal-break rule deducted because it wasn't clocked.
    autoBreakMinutes: integer("auto_break_minutes").notNull().default(0),
    scheduledMinutes: integer("scheduled_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    lateMinutes: integer("late_minutes").notNull().default(0),
    earlyDepartureMinutes: integer("early_departure_minutes").notNull().default(0),
    status: attendanceStatus("status").notNull().default("PRESENT"),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("attendance_employee_day_uq").on(t.employeeId, t.workDate),
    index("attendance_company_day_idx").on(t.companyId, t.workDate),
    index("attendance_location_day_idx").on(t.locationId, t.workDate),
  ],
);

export const breakRecords = pgTable(
  "break_records",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    attendanceRecordId: uuid("attendance_record_id").references(() => attendanceRecords.id),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    startEventId: uuid("start_event_id").references(() => clockEvents.id),
    endEventId: uuid("end_event_id").references(() => clockEvents.id),
  },
  (t) => [
    index("break_records_employee_idx").on(t.employeeId, t.startedAt.desc()),
    index("break_records_attendance_idx").on(t.attendanceRecordId),
  ],
);

// Schedules are templates; no one is assumed to work 08:00-17:00.
export const workSchedules = pgTable(
  "work_schedules",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    locationId: uuid("location_id").references(() => locations.id),
    name: text("name").notNull(),
    // [{ day: 1..7 (ISO, Mon=1), start: "08:00", end: "17:00", breakMinutes: 60 }]
    days: jsonb("days")
      .$type<{ day: number; start: string; end: string; breakMinutes?: number }[]>()
      .notNull()
      .default([]),
    overtimeAfterMinutesPerDay: integer("overtime_after_minutes_per_day"),
    graceMinutes: integer("grace_minutes").notNull().default(5),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("work_schedules_company_idx").on(t.companyId)],
);

export const employeeSchedules = pgTable(
  "employee_schedules",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    scheduleId: uuid("schedule_id").notNull().references(() => workSchedules.id),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
  },
  (t) => [index("employee_schedules_employee_idx").on(t.employeeId, t.effectiveFrom.desc())],
);

export const publicHolidays = pgTable(
  "public_holidays",
  {
    id: id(),
    companyId: uuid("company_id").references(() => companies.id),
    holidayDate: date("holiday_date").notNull(),
    name: text("name").notNull(),
    startsAt: time("starts_at"),
  },
  (t) => [index("public_holidays_date_idx").on(t.companyId, t.holidayDate)],
);
