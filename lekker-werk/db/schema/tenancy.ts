import {
  boolean,
  doublePrecision,
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
import { channelType, recordStatus, userRole } from "./enums";

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  registrationNumber: text("registration_number"),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  preferredChannel: channelType("preferred_channel").notNull(),
  hasMultipleLocations: boolean("has_multiple_locations").notNull().default(false),
  timezone: text("timezone").notNull().default("Africa/Johannesburg"),
  status: recordStatus("status").notNull().default("ACTIVE"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const locations = pgTable(
  "locations",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    address: text("address"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    timezone: text("timezone").notNull().default("Africa/Johannesburg"),
    // Location-specific clock-in configuration. Falls back to company settings when null.
    gpsValidationEnabled: boolean("gps_validation_enabled"),
    allowedRadiusMeters: integer("allowed_radius_meters"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    status: recordStatus("status").notNull().default("ACTIVE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("locations_company_idx").on(t.companyId, t.status),
    uniqueIndex("locations_company_name_uq").on(t.companyId, t.name),
  ],
);

export const users = pgTable(
  "users",
  {
    id: id(),
    // null only for platform super admins
    companyId: uuid("company_id").references(() => companies.id),
    email: text("email").notNull(),
    username: text("username"),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull(),
    status: recordStatus("status").notNull().default("ACTIVE"),
    failedLoginCount: integer("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_uq").on(t.email),
    uniqueIndex("users_username_uq").on(t.username),
    index("users_company_role_idx").on(t.companyId, t.role),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // sha256 of the cookie token; the raw token is never stored.
    tokenHash: text("token_hash").notNull(),
    csrfToken: text("csrf_token").notNull(),
    userAgent: text("user_agent"),
    ip: text("ip"),
    // SUPER_ADMIN only: the tenant this session is currently viewing (System portal).
    // null = the user's own company.
    actingCompanyId: uuid("acting_company_id").references(() => companies.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_uq").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expiry_idx").on(t.expiresAt),
  ],
);

export const passwordResets = pgTable(
  "password_resets",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("password_resets_token_uq").on(t.tokenHash)],
);
