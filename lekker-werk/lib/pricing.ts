// Single source of truth for plans and prices. Used by the homepage, billing page and server.
// Amounts are ZAR, excluding VAT. Change a number here and everything (UI + PayFast amounts) follows.

export type PlanId = "STARTER" | "GROWTH" | "BUSINESS";
export type BillingInterval = "MONTHLY" | "YEARLY";
export type ChannelChoice = "TELEGRAM" | "WHATSAPP";

export const TRIAL_DAYS = 7;
/** Yearly = 10 monthly payments (2 months free, ~17% off). */
export const YEARLY_MONTHS_CHARGED = 10;
/** Past-due subscriptions keep working this long while PayFast retries / the customer fixes payment. */
export const PAST_DUE_GRACE_DAYS = 3;
/** The trial gives full access at this tier's limits. */
export const TRIAL_PLAN: PlanId = "GROWTH";

export interface PlanDef {
  id: PlanId;
  name: string;
  tagline: string;
  /** Telegram price per month (no API fees). */
  monthly: number;
  /** Extra per month for WhatsApp: covers WhatsApp Business API access, number set-up and Meta message fees. */
  whatsappAddon: number;
  limits: { employees: number; locations: number; integrations: number };
  highlight?: boolean;
  features: string[];
}

export const PLANS: Record<PlanId, PlanDef> = {
  STARTER: {
    id: "STARTER",
    name: "Starter",
    tagline: "One site, a small team.",
    monthly: 199,
    whatsappAddon: 150,
    limits: { employees: 15, locations: 1, integrations: 0 },
    features: [
      "Up to 15 employees",
      "1 location",
      "QR clock-in via Telegram or WhatsApp",
      "Daily attendance & hours",
      "CSV reports",
    ],
  },
  GROWTH: {
    id: "GROWTH",
    name: "Growth",
    tagline: "Several sites, real scheduling.",
    monthly: 499,
    whatsappAddon: 300,
    highlight: true,
    limits: { employees: 75, locations: 5, integrations: 1 },
    features: [
      "Up to 75 employees",
      "Up to 5 locations",
      "Manager roles per location",
      "Schedules, overtime & GPS validation",
      "1 ERP / payroll integration",
    ],
  },
  BUSINESS: {
    id: "BUSINESS",
    name: "Business",
    tagline: "Big teams, full control.",
    monthly: 999,
    whatsappAddon: 600,
    limits: { employees: 300, locations: 1000, integrations: 20 },
    features: [
      "Up to 300 employees",
      "Unlimited locations",
      "Unlimited integrations (Odoo, custom API…)",
      "ERP hours reconciliation",
      "Audit log & priority support",
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ["STARTER", "GROWTH", "BUSINESS"];

export interface Price {
  /** What is charged per billing period (month or year). */
  charge: number;
  /** Per-month equivalent, for display. */
  perMonth: number;
  /** Monthly price if paid monthly (for the "save" calculation). */
  monthlyEquivalentIfMonthly: number;
  /** Yearly saving vs 12 monthly payments (0 for monthly). */
  yearlySaving: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function priceFor(plan: PlanId, interval: BillingInterval, channel: ChannelChoice): Price {
  const def = PLANS[plan];
  const monthly = def.monthly + (channel === "WHATSAPP" ? def.whatsappAddon : 0);
  if (interval === "MONTHLY") {
    return { charge: monthly, perMonth: monthly, monthlyEquivalentIfMonthly: monthly, yearlySaving: 0 };
  }
  const charge = monthly * YEARLY_MONTHS_CHARGED;
  return {
    charge,
    perMonth: round2(charge / 12),
    monthlyEquivalentIfMonthly: monthly,
    yearlySaving: monthly * 12 - charge,
  };
}

export function formatZAR(amount: number, opts: { cents?: boolean } = {}) {
  const hasCents = opts.cents ?? !Number.isInteger(amount);
  return `R${amount.toLocaleString("en-ZA", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}
