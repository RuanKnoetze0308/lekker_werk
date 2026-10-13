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
import { channelType } from "./enums";
import { companies } from "./tenancy";
import { employees } from "./people";

// One row per company per channel: bot token / WhatsApp credentials (encrypted) + webhook secret.
export const communicationChannels = pgTable(
  "communication_channels",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    channel: channelType("channel").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    enabled: boolean("enabled").notNull().default(false),
    // Public identifier: Telegram bot username, WhatsApp phone number id / display number.
    publicHandle: text("public_handle"),
    // AES-256-GCM encrypted JSON (bot token, access token, ...). Never sent to the browser.
    encryptedCredentials: text("encrypted_credentials"),
    // Random secret used in this company's webhook URL / header validation.
    webhookSecret: text("webhook_secret").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("communication_channels_company_channel_uq").on(t.companyId, t.channel),
    uniqueIndex("communication_channels_secret_uq").on(t.webhookSecret),
  ],
);

// Links an employee to a Telegram chat / WhatsApp number once verified.
export const communicationAccounts = pgTable(
  "communication_accounts",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    channel: channelType("channel").notNull(),
    // Telegram chat id or WhatsApp wa_id (E.164 digits).
    externalId: text("external_id").notNull(),
    displayName: text("display_name"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // One external identity maps to exactly one employee per company/channel.
    uniqueIndex("communication_accounts_identity_uq").on(
      t.companyId,
      t.channel,
      t.externalId,
    ),
    index("communication_accounts_employee_idx").on(t.employeeId),
  ],
);

// Short-lived one-time codes an employee sends to the bot to link their account.
export const linkCodes = pgTable(
  "link_codes",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeId: uuid("employee_id").notNull().references(() => employees.id),
    channel: channelType("channel").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("link_codes_hash_uq").on(t.codeHash)],
);

// Per chat conversation state for multi-step flows (e.g. waiting for a location share).
export const conversationStates = pgTable(
  "conversation_states",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    channel: channelType("channel").notNull(),
    externalId: text("external_id").notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("conversation_states_identity_uq").on(t.companyId, t.channel, t.externalId),
  ],
);
