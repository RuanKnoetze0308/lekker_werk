import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { companies, employees, integrations, locations, payments, subscriptions } from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import {
  PLANS,
  TRIAL_DAYS,
  priceFor,
  type BillingInterval,
  type ChannelChoice,
  type PlanId,
} from "@/lib/pricing";
import { assertCan, type AuthContext } from "../auth/context";
import { AppError, Errors } from "../errors";
import { audit } from "../services/audit.service";
import { notify } from "../services/notification.service";
import { addPeriod, computeAccess, type BillingAccess } from "./access";
import {
  buildCheckout,
  cancelRemoteSubscription,
  verifyItn,
} from "./payfast";

const DAY = 86_400_000;

// ---- Trial / subscription lifecycle ------------------------------------------------------

export async function createTrial(executor: Db | Tx, companyId: string, startedAt = new Date()) {
  await executor
    .insert(subscriptions)
    .values({
      companyId,
      status: "TRIALING",
      trialStartedAt: startedAt,
      trialEndsAt: new Date(startedAt.getTime() + TRIAL_DAYS * DAY),
    })
    .onConflictDoNothing({ target: subscriptions.companyId });
}

/** Companies created before billing existed get a trial counted from their signup date. */
export async function ensureSubscription(companyId: string) {
  const find = () => db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId));
  let [sub] = await find();
  if (!sub) {
    const [company] = await db.select({ createdAt: companies.createdAt }).from(companies).where(eq(companies.id, companyId));
    if (!company) throw Errors.notFound("Company");
    await createTrial(db, companyId, company.createdAt);
    [sub] = await find();
  }
  return sub;
}

export async function getBillingAccess(companyId: string): Promise<BillingAccess> {
  return computeAccess(await ensureSubscription(companyId));
}

// ---- Plan limits ---------------------------------------------------------------------------

export type LimitKind = "employees" | "locations" | "integrations";

async function usage(companyId: string, kind: LimitKind): Promise<number> {
  const [row] =
    kind === "employees"
      ? await db.select({ n: count() }).from(employees).where(and(eq(employees.companyId, companyId), eq(employees.status, "ACTIVE")))
      : kind === "locations"
        ? await db.select({ n: count() }).from(locations).where(and(eq(locations.companyId, companyId), eq(locations.status, "ACTIVE")))
        : await db.select({ n: count() }).from(integrations).where(and(eq(integrations.companyId, companyId), eq(integrations.enabled, true)));
  return row.n;
}

/** Call before adding one more of `kind`. */
export async function assertWithinPlan(companyId: string, kind: LimitKind) {
  const access = await getBillingAccess(companyId);
  const limit = PLANS[access.effectivePlan].limits[kind];
  if ((await usage(companyId, kind)) >= limit) {
    throw new AppError(
      402,
      "PLAN_LIMIT",
      limit === 0
        ? `Your ${PLANS[access.effectivePlan].name} plan doesn't include ${kind}. Upgrade under Billing.`
        : `Your ${PLANS[access.effectivePlan].name} plan allows ${limit} ${kind}. Upgrade under Billing to add more.`,
    );
  }
}

export async function assertWhatsappAllowed(companyId: string) {
  const access = await getBillingAccess(companyId);
  if (!access.whatsappAllowed) {
    throw new AppError(402, "PLAN_LIMIT", "WhatsApp isn't part of your current plan. Choose a WhatsApp plan under Billing.");
  }
}

// ---- Overview for the billing page -----------------------------------------------------------

export async function getBillingOverview(ctx: AuthContext) {
  assertCan(ctx, "settings:manage");
  const sub = await ensureSubscription(ctx.companyId);
  const history = await db
    .select()
    .from(payments)
    .where(and(eq(payments.companyId, ctx.companyId), eq(payments.status, "COMPLETE")))
    .orderBy(desc(payments.paidAt))
    .limit(24);
  const [emps, locs, ints] = await Promise.all([
    usage(ctx.companyId, "employees"),
    usage(ctx.companyId, "locations"),
    usage(ctx.companyId, "integrations"),
  ]);
  return { sub, access: computeAccess(sub), payments: history, usage: { employees: emps, locations: locs, integrations: ints } };
}

// ---- Checkout ------------------------------------------------------------------------------------

export interface CheckoutRequest {
  plan: PlanId;
  interval: BillingInterval;
  channel: ChannelChoice;
}

export function assertCheckoutAllowed() {
  const pf = env.payfast;
  if (!pf.merchantId || !pf.merchantKey) throw new AppError(503, "PAYFAST_NOT_CONFIGURED", "Payments are not configured yet.");
  const url = new URL(env.appUrl);
  const publicHttps = url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname);
  // PayFast can't call back to localhost, so a live payment would succeed but never be recorded.
  if (pf.mode === "live" && !publicHttps && !pf.allowLocalLive) {
    throw new AppError(
      503,
      "PAYFAST_LOCAL_LIVE_BLOCKED",
      "Live PayFast checkout is disabled until APP_URL is a public https address (PayFast must be able to reach /api/billing/payfast/itn).",
    );
  }
}

export async function startCheckout(ctx: AuthContext, req: CheckoutRequest) {
  assertCan(ctx, "settings:manage");
  assertCheckoutAllowed();

  // Don't let someone buy a plan their current usage doesn't fit.
  const limits = PLANS[req.plan].limits;
  for (const kind of ["employees", "locations"] as const) {
    const used = await usage(ctx.companyId, kind);
    if (used > limits[kind]) {
      throw Errors.invalid(`You currently have ${used} ${kind}; the ${PLANS[req.plan].name} plan allows ${limits[kind]}. Pick a larger plan.`);
    }
  }

  const sub = await ensureSubscription(ctx.companyId);
  const price = priceFor(req.plan, req.interval, req.channel);
  const mPaymentId = `lw_${randomToken(12)}`;
  await db.insert(payments).values({
    companyId: ctx.companyId,
    subscriptionId: sub.id,
    mPaymentId,
    plan: req.plan,
    interval: req.interval,
    whatsappAddon: req.channel === "WHATSAPP",
    amountGross: price.charge.toFixed(2),
  });

  const [first, ...rest] = ctx.name.trim().split(/\s+/);
  const label = `${PLANS[req.plan].name} · ${req.interval === "YEARLY" ? "Yearly" : "Monthly"} · ${req.channel === "WHATSAPP" ? "WhatsApp" : "Telegram"}`;
  return buildCheckout({
    returnUrl: `${env.appUrl}/billing?status=success`,
    cancelUrl: `${env.appUrl}/billing?status=cancelled`,
    notifyUrl: `${env.appUrl}/api/billing/payfast/itn`,
    nameFirst: first ?? "",
    nameLast: rest.join(" "),
    email: ctx.email,
    mPaymentId,
    amount: price.charge,
    itemName: `LekkerWerk ${label}`,
    itemDescription: `LekkerWerk subscription (${label})`,
    companyId: ctx.companyId,
    frequency: req.interval === "YEARLY" ? 6 : 3,
  });
}

// ---- PayFast ITN (instant transaction notification) ---------------------------------------------------

/**
 * Called by PayFast's servers. Nothing here trusts the browser: signature, source IP, a server-side
 * confirmation round trip and the expected amount are all checked before a subscription is activated.
 */
export async function handleItn(rawBody: string, ip: string) {
  const { pairs, get } = await verifyItn(rawBody, ip);

  const mPaymentId = get("m_payment_id");
  const pfPaymentId = get("pf_payment_id");
  const status = get("payment_status");
  const token = get("token");
  const gross = Number(get("amount_gross"));

  const [original] = await db.select().from(payments).where(eq(payments.mPaymentId, mPaymentId));
  if (!original) return { ignored: true }; // not one of ours; acknowledge so PayFast stops retrying

  const itn = Object.fromEntries(pairs);
  const now = new Date();

  if (status !== "COMPLETE") {
    await db.transaction(async (tx) => {
      if (original.status === "PENDING") {
        await tx.update(payments).set({ status: status === "CANCELLED" ? "CANCELLED" : "FAILED", itn }).where(eq(payments.id, original.id));
      }
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.companyId, original.companyId));
      if (sub && token && sub.payfastToken === token) {
        if (status === "CANCELLED") {
          await tx.update(subscriptions).set({ cancelAtPeriodEnd: true, cancelledAt: now, status: "CANCELLED" }).where(eq(subscriptions.id, sub.id));
        } else if (sub.status === "ACTIVE") {
          await tx.update(subscriptions).set({ status: "PAST_DUE" }).where(eq(subscriptions.id, sub.id));
          await notify({ companyId: sub.companyId, type: "PAYMENT_FAILED", title: "Subscription payment failed", body: "Update your payment details on the Billing page to avoid interruption." }, tx);
        }
      }
    });
    return { status };
  }

  // COMPLETE ---------------------------------------------------------------------------------------------
  const [dupe] = await db.select({ id: payments.id }).from(payments).where(eq(payments.pfPaymentId, pfPaymentId));
  if (dupe) return { duplicate: true }; // replayed notification: already applied

  const firstPayment = original.status === "PENDING";
  const [subRow] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, original.companyId));
  const expected = Number(original.amountGross);
  if (Math.abs(gross - expected) > 0.01) throw new AppError(400, "AMOUNT_MISMATCH", "Amount does not match the order");

  let previousToken: string | null = null;
  await db.transaction(async (tx) => {
    const fields = {
      pfPaymentId,
      amountFee: get("amount_fee") || null,
      amountNet: get("amount_net") || null,
      status: "COMPLETE" as const,
      paidAt: now,
      itn,
    };
    let paymentRow = original;
    if (firstPayment) {
      await tx.update(payments).set(fields).where(eq(payments.id, original.id));
    } else {
      // Recurring renewal: a fresh ledger row, same plan as the original order.
      const [row] = await tx
        .insert(payments)
        .values({
          companyId: original.companyId,
          subscriptionId: original.subscriptionId,
          mPaymentId: `${original.mPaymentId}:${pfPaymentId}`,
          plan: original.plan,
          interval: original.interval,
          whatsappAddon: original.whatsappAddon,
          amountGross: gross.toFixed(2),
          ...fields,
        })
        .returning();
      paymentRow = row;
    }

    const stillRunning = subRow?.currentPeriodEnd && subRow.currentPeriodEnd > now && subRow.status !== "EXPIRED";
    const start = firstPayment || !stillRunning ? now : subRow!.currentPeriodEnd!;
    const end = addPeriod(start, paymentRow.interval);
    previousToken = subRow?.payfastToken && token && subRow.payfastToken !== token ? subRow.payfastToken : null;

    await tx
      .update(subscriptions)
      .set({
        status: "ACTIVE",
        plan: paymentRow.plan,
        interval: paymentRow.interval,
        whatsappAddon: paymentRow.whatsappAddon,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        payfastToken: token || subRow?.payfastToken || null,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
      })
      .where(eq(subscriptions.companyId, original.companyId));

    await audit({ userId: null, companyId: original.companyId }, "settings.changed", "subscription", subRow?.id ?? null, {
      event: firstPayment ? "payment_complete" : "renewal_complete",
      plan: paymentRow.plan,
      interval: paymentRow.interval,
      amount: gross,
    }, tx);
  });

  // A plan change makes a new PayFast subscription; stop the old one so they aren't billed twice.
  if (previousToken) await cancelRemoteSubscription(previousToken).catch((e) => console.error("Could not cancel old PayFast subscription", e));
  return { status: "COMPLETE" };
}

// ---- Cancel -----------------------------------------------------------------------------------------------

/** Stops future charges. The company keeps access until the period it already paid for ends. */
export async function cancelSubscription(ctx: AuthContext) {
  assertCan(ctx, "settings:manage");
  const sub = await ensureSubscription(ctx.companyId);
  if (sub.status !== "ACTIVE" && sub.status !== "PAST_DUE") throw Errors.invalid("There is no active subscription to cancel.");
  if (sub.payfastToken) await cancelRemoteSubscription(sub.payfastToken);
  await db
    .update(subscriptions)
    .set({ cancelAtPeriodEnd: true, cancelledAt: new Date(), status: "CANCELLED" })
    .where(eq(subscriptions.id, sub.id));
  await audit(ctx, "settings.changed", "subscription", sub.id, { event: "cancelled" });
}
