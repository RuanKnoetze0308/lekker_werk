import {
  boolean,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { companies } from "./tenancy";

export const planTier = pgEnum("plan_tier", ["STARTER", "GROWTH", "BUSINESS"]);
export const billingInterval = pgEnum("billing_interval", ["MONTHLY", "YEARLY"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "EXPIRED",
]);
export const paymentStatus = pgEnum("payment_status", [
  "PENDING",
  "COMPLETE",
  "FAILED",
  "CANCELLED",
]);

// One row per company. The trial dates live here so the system can track and enforce them.
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    status: subscriptionStatus("status").notNull().default("TRIALING"),
    // null until the first successful payment
    plan: planTier("plan"),
    interval: billingInterval("interval"),
    whatsappAddon: boolean("whatsapp_addon").notNull().default(false),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }).notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }).notNull(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    // PayFast recurring-billing token (needed to cancel / identify renewals)
    payfastToken: text("payfast_token"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("subscriptions_company_uq").on(t.companyId),
    index("subscriptions_status_idx").on(t.status, t.trialEndsAt),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    // Our reference sent to PayFast as m_payment_id
    mPaymentId: text("m_payment_id").notNull(),
    // PayFast's id; unique so a replayed ITN can never be applied twice
    pfPaymentId: text("pf_payment_id"),
    plan: planTier("plan").notNull(),
    interval: billingInterval("interval").notNull(),
    whatsappAddon: boolean("whatsapp_addon").notNull().default(false),
    amountGross: numeric("amount_gross", { precision: 10, scale: 2 }).notNull(),
    amountFee: numeric("amount_fee", { precision: 10, scale: 2 }),
    amountNet: numeric("amount_net", { precision: 10, scale: 2 }),
    status: paymentStatus("status").notNull().default("PENDING"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    itn: jsonb("itn").$type<Record<string, string>>(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_m_payment_uq").on(t.mPaymentId),
    uniqueIndex("payments_pf_payment_uq").on(t.pfPaymentId),
    index("payments_company_idx").on(t.companyId, t.createdAt.desc()),
  ],
);
