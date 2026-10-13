import { PAST_DUE_GRACE_DAYS, TRIAL_PLAN, type PlanId } from "@/lib/pricing";

export type AccessState = "TRIALING" | "ACTIVE" | "GRACE" | "LOCKED";
export type LockReason = "trial_expired" | "payment_overdue" | "cancelled" | "expired";

export interface SubscriptionLike {
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  plan: PlanId | null;
  interval: "MONTHLY" | "YEARLY" | null;
  whatsappAddon: boolean;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export interface BillingAccess {
  state: AccessState;
  locked: boolean;
  reason: LockReason | null;
  /** Plan whose limits apply right now (trial = Growth). */
  effectivePlan: PlanId;
  whatsappAllowed: boolean;
  /** Whole days remaining in the trial or current period (null when locked). */
  daysLeft: number | null;
  trialEndsAt: Date;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

const DAY = 86_400_000;
const days = (ms: number) => Math.max(0, Math.ceil(ms / DAY));

/** Pure function: given a subscription row and "now", what may the company do? */
export function computeAccess(sub: SubscriptionLike, now = new Date()): BillingAccess {
  const base = {
    trialEndsAt: sub.trialEndsAt,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  };
  const locked = (reason: LockReason): BillingAccess => ({
    ...base, state: "LOCKED", locked: true, reason, effectivePlan: sub.plan ?? TRIAL_PLAN,
    whatsappAllowed: false, daysLeft: null,
  });
  const open = (state: AccessState, daysLeft: number): BillingAccess => ({
    ...base, state, locked: false, reason: null,
    effectivePlan: state === "TRIALING" ? TRIAL_PLAN : (sub.plan ?? TRIAL_PLAN),
    whatsappAllowed: state === "TRIALING" ? true : sub.whatsappAddon,
    daysLeft,
  });

  switch (sub.status) {
    case "TRIALING":
      return now < sub.trialEndsAt ? open("TRIALING", days(sub.trialEndsAt.getTime() - now.getTime())) : locked("trial_expired");
    case "ACTIVE":
    case "PAST_DUE":
    case "CANCELLED": {
      const end = sub.currentPeriodEnd;
      if (!end) return locked("expired");
      if (now <= end) {
        // A cancelled subscription keeps working until the period it already paid for ends.
        return open("ACTIVE", days(end.getTime() - now.getTime()));
      }
      if (sub.status !== "CANCELLED" && now.getTime() <= end.getTime() + PAST_DUE_GRACE_DAYS * DAY) {
        return open("GRACE", days(end.getTime() + PAST_DUE_GRACE_DAYS * DAY - now.getTime()));
      }
      return locked(sub.status === "CANCELLED" ? "cancelled" : "payment_overdue");
    }
    default:
      return locked("expired");
  }
}

export function addPeriod(from: Date, interval: "MONTHLY" | "YEARLY"): Date {
  const d = new Date(from);
  if (interval === "MONTHLY") d.setUTCMonth(d.getUTCMonth() + 1);
  else d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d;
}
