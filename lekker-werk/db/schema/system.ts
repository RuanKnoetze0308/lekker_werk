import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { notificationType, userRole } from "./enums";
import { companies, users } from "./tenancy";

/**
 * Meal break rule. AUTO_DEDUCT: when a day's work exceeds `afterMinutes` and less than the
 * required break was clocked, the shortfall is deducted (the BCEA meal interval: 60 min after
 * 5 hours, unpaid unless agreed). CLOCKED: only breaks the employee clocks count.
 */
export interface MealBreakPolicy {
  policy: "AUTO_DEDUCT" | "CLOCKED";
  /** Default break length; a schedule day's breakMinutes overrides it. */
  minutes: number;
  afterMinutes: number;
  paid: boolean;
}

export interface CompanySettingsShape {
  attendance: {
    mealBreak: MealBreakPolicy;
    gpsValidationEnabled: boolean;
    requireQrForClocking: boolean;
    allowedRadiusMeters: number;
    duplicateWindowSeconds: number;
    maxShiftHours: number;
    breaksEnabled: boolean;
    overtimeAfterMinutesPerDay: number;
    workingWeek: number[]; // ISO weekdays, Mon=1
  };
}

export const companySettings = pgTable(
  "company_settings",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    settings: jsonb("settings").$type<CompanySettingsShape>().notNull(),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("company_settings_company_uq").on(t.companyId)],
);

// Which self-service data employees may request over WhatsApp/Telegram. ON/OFF per company,
// with an optional role override column reserved for later.
export const employeeDataPermissions = pgTable(
  "employee_data_permissions",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    permissionKey: text("permission_key").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    roleOverride: userRole("role_override"),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("employee_data_permissions_uq").on(
      t.companyId,
      t.permissionKey,
      t.roleOverride,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    companyId: uuid("company_id").references(() => companies.id),
    userId: uuid("user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_company_time_idx").on(t.companyId, t.createdAt.desc()),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    // null = all admins of the company
    userId: uuid("user_id").references(() => users.id),
    type: notificationType("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_company_idx").on(t.companyId, t.readAt, t.createdAt.desc())],
);

// Fixed-window counters for rate limiting (auth, QR scans, webhooks). Swap for Redis at scale.
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [uniqueIndex("rate_limits_key_window_uq").on(t.key, t.windowStart)],
);

// Development only: every row created by scripts/demo/seed.ts is listed here so
// scripts/demo/clean.ts can remove all demo data (and nothing else) in one go.
export const demoDataRegistry = pgTable(
  "demo_data_registry",
  {
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("demo_data_registry_uq").on(t.entityType, t.entityId)],
);
