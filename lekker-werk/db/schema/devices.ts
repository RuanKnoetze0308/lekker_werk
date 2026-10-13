import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { clockEventType, credentialKind, deviceKind } from "./enums";
import { companies, locations, users } from "./tenancy";
import { employees } from "./people";

// A terminal fixed at one location (RFID reader, biometric scanner, kiosk tablet...).
// Devices authenticate to the device API with their own key, so a stolen key only lets someone
// punch at that one location, and it can be rotated or disabled without touching anything else.
export const clockDevices = pgTable(
  "clock_devices",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    locationId: uuid("location_id").notNull().references(() => locations.id),
    kind: deviceKind("kind").notNull(),
    name: text("name").notNull(),
    serialNumber: text("serial_number"),
    // sha256 of the device API key. The raw key is shown once, when created or rotated.
    keyHash: text("key_hash").notNull(),
    keyHint: text("key_hint").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    // null = toggle (a tap clocks in when out, out when in). Set for "in-only" / "out-only" doors.
    fixedAction: clockEventType("fixed_action"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastIp: text("last_ip"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("clock_devices_key_uq").on(t.keyHash),
    index("clock_devices_company_location_idx").on(t.companyId, t.locationId),
  ],
);

// Card UIDs, tag ids, PINs, biometric template ids. Values are stored as a keyed HMAC
// (see server/devices/credential-hash.ts), never in plain text, but stay exact-match searchable.
export const employeeCredentials = pgTable(
  "employee_credentials",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    kind: credentialKind("kind").notNull(),
    valueHash: text("value_hash").notNull(),
    // Last few characters for admins to recognise a card. Empty for PINs.
    valueHint: text("value_hint").notNull().default(""),
    label: text("label"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    // A live card/PIN identifies exactly one employee per company. Revoked ones can be re-issued.
    uniqueIndex("employee_credentials_live_uq")
      .on(t.companyId, t.kind, t.valueHash)
      .where(sql`${t.revokedAt} is null`),
    index("employee_credentials_employee_idx").on(t.employeeId),
  ],
);
