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
  integrationCategory,
  integrationProvider,
  integrationRequestStatus,
  syncStatus,
} from "./enums";
import { companies, users } from "./tenancy";
import { employees } from "./people";

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    provider: integrationProvider("provider").notNull(),
    category: integrationCategory("category").notNull(),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    // Non-secret settings: API URL, company/database, tenant, username, mapping options.
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    // AES-256-GCM encrypted JSON (API key, password, tokens). Never returned to the frontend.
    encryptedCredentials: text("encrypted_credentials"),
    syncFrequencyMinutes: integer("sync_frequency_minutes").notNull().default(60),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
    lastFailedSyncAt: timestamp("last_failed_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    nextSyncAt: timestamp("next_sync_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("integrations_company_idx").on(t.companyId),
    // Drives the background scheduler: "which enabled integrations are due?"
    index("integrations_due_idx").on(t.enabled, t.nextSyncAt),
  ],
);

export const integrationSyncs = pgTable(
  "integration_syncs",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    integrationId: uuid("integration_id").notNull().references(() => integrations.id),
    status: syncStatus("status").notNull().default("QUEUED"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    recordsImported: integer("records_imported").notNull().default(0),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (t) => [
    index("integration_syncs_integration_idx").on(t.integrationId, t.createdAt.desc()),
    index("integration_syncs_queue_idx").on(t.status, t.createdAt),
  ],
);

// Normalised external hours. Kept separate from clock_events so the dashboard can
// distinguish "generated here" from "imported", and reconcile the two.
export const importedHours = pgTable(
  "imported_hours",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    integrationId: uuid("integration_id").notNull().references(() => integrations.id),
    employeeId: uuid("employee_id").references(() => employees.id),
    externalEmployeeRef: text("external_employee_ref").notNull(),
    workDate: date("work_date").notNull(),
    hours: numeric("hours", { precision: 8, scale: 2 }).notNull(),
    externalRecordId: text("external_record_id").notNull(),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("imported_hours_external_uq").on(t.integrationId, t.externalRecordId),
    index("imported_hours_company_day_idx").on(t.companyId, t.workDate),
    index("imported_hours_employee_day_idx").on(t.employeeId, t.workDate),
  ],
);

// "My system isn't listed": a customer asks us to build a connector. Lets us quote and bill the
// work, and tells us which connectors to build next.
export const integrationRequests = pgTable(
  "integration_requests",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    requestedBy: uuid("requested_by").references(() => users.id),
    systemName: text("system_name").notNull(),
    category: integrationCategory("category").notNull(),
    website: text("website"),
    contactEmail: text("contact_email").notNull(),
    notes: text("notes"),
    // Hours to payroll, hours from ERP, employees both ways... free text from the customer.
    dataNeeded: text("data_needed"),
    status: integrationRequestStatus("status").notNull().default("SUBMITTED"),
    // ZAR excl. VAT, set by us once scoped.
    quotedAmount: numeric("quoted_amount", { precision: 10, scale: 2 }),
    internalNotes: text("internal_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("integration_requests_company_idx").on(t.companyId, t.createdAt.desc()),
    index("integration_requests_status_idx").on(t.status, t.createdAt),
  ],
);
