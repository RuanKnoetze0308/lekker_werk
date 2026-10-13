import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/dashboard/ui";
import { PLANS, TRIAL_DAYS, formatZAR, type PlanId } from "@/lib/pricing";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { formatDateTime } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { getBillingOverview } from "@/server/billing/billing.service";
import { getCompany } from "@/server/services/company.service";
import { CancelButton, PlanPicker } from "./_components/PlanPicker";

export const metadata = { title: "Billing · LekkerWerk" };

const REASON_TEXT = {
  trial_expired: `Your ${TRIAL_DAYS}-day free trial has ended. Choose a plan to keep clocking and managing your team.`,
  payment_overdue: "Your last payment didn't go through. Choose a plan to restore access.",
  cancelled: "Your subscription was cancelled and the paid period has ended.",
  expired: "Your subscription has ended.",
} as const;

export default async function BillingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext("settings:manage");
  const p = await readParams(searchParams);
  const [o, company] = await Promise.all([getBillingOverview(ctx), getCompany(ctx)]);
  const { sub, access } = o;
  const tz = company.timezone;
  const date = (d: Date | null) => (d ? formatDateTime(d, tz).split(",").slice(0, 2).join(",") : "—");

  const disabledPlans: Partial<Record<PlanId, string>> = {};
  for (const [id, def] of Object.entries(PLANS) as [PlanId, (typeof PLANS)[PlanId]][]) {
    if (o.usage.employees > def.limits.employees) disabledPlans[id] = `You have ${o.usage.employees} employees; this plan allows ${def.limits.employees}.`;
    else if (o.usage.locations > def.limits.locations) disabledPlans[id] = `You have ${o.usage.locations} locations; this plan allows ${def.limits.locations}.`;
  }

  const paid = sub.plan && (sub.status === "ACTIVE" || sub.status === "CANCELLED" || sub.status === "PAST_DUE");
  const current = paid && sub.interval ? { plan: sub.plan!, interval: sub.interval, channel: sub.whatsappAddon ? ("WHATSAPP" as const) : ("TELEGRAM" as const) } : null;

  return (
    <>
      <PageHeader title="Billing" description="Your plan, free trial and payment history. Payments are processed securely by PayFast." />

      {p.get("status") === "success" && (
        <p className="mb-6 rounded-[14px] bg-pale-green px-4 py-3 text-sm text-ink">
          Thanks! PayFast is confirming your payment. This page updates as soon as it arrives (usually within a minute). Refresh if it still says trial.
        </p>
      )}
      {p.get("status") === "cancelled" && (
        <p className="mb-6 rounded-[14px] bg-amber-50 px-4 py-3 text-sm text-amber-900">Payment cancelled. You haven&rsquo;t been charged.</p>
      )}

      <Card title="Your subscription" className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex flex-col gap-1.5 text-sm">
            {access.locked ? (
              <>
                <Badge tone="red">Inactive</Badge>
                <p className="mt-1 max-w-xl text-ink">{REASON_TEXT[access.reason ?? "expired"]}</p>
              </>
            ) : access.state === "TRIALING" ? (
              <>
                <Badge tone="green">Free trial</Badge>
                <p className="mt-1 text-ink">
                  {access.daysLeft} day{access.daysLeft === 1 ? "" : "s"} left. Started {date(sub.trialStartedAt)}, ends {date(sub.trialEndsAt)}.
                </p>
                <p className="text-muted">The trial includes everything in the {PLANS.GROWTH.name} plan.</p>
              </>
            ) : (
              <>
                <Badge tone={access.state === "GRACE" ? "amber" : "green"}>{access.state === "GRACE" ? "Payment overdue" : sub.cancelAtPeriodEnd ? "Cancelled" : "Active"}</Badge>
                <p className="mt-1 text-ink">
                  {PLANS[sub.plan!].name} · {sub.interval === "YEARLY" ? "Yearly" : "Monthly"} · {sub.whatsappAddon ? "WhatsApp" : "Telegram"}
                </p>
                <p className="text-muted">
                  {sub.cancelAtPeriodEnd ? "Access ends" : "Renews"} {date(sub.currentPeriodEnd)}
                </p>
              </>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-6 text-sm">
            {(
              [
                ["Employees", o.usage.employees, PLANS[access.effectivePlan].limits.employees],
                ["Locations", o.usage.locations, PLANS[access.effectivePlan].limits.locations],
                ["Integrations", o.usage.integrations, PLANS[access.effectivePlan].limits.integrations],
              ] as const
            ).map(([label, used, max]) => (
              <div key={label}>
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-semibold text-ink">{used} / {max >= 1000 ? "∞" : max}</dd>
              </div>
            ))}
          </dl>
        </div>
        {paid && !sub.cancelAtPeriodEnd && (
          <div className="mt-5 border-t border-border pt-4">
            <CancelButton />
          </div>
        )}
      </Card>

      <h2 className="mb-4 font-display text-xl font-bold text-ink">{paid ? "Change plan" : "Choose a plan"}</h2>
      <PlanPicker
        current={current}
        disabledPlans={disabledPlans}
        defaultChannel={company.preferredChannel === "WHATSAPP" ? "WHATSAPP" : "TELEGRAM"}
      />

      <Card title="Payment history" className="mt-10" flush>
        {o.payments.length === 0 ? (
          <p className="p-5 text-sm text-muted">No payments yet.</p>
        ) : (
          <Table>
            <thead><tr><Th>Date</Th><Th>Plan</Th><Th>Period</Th><Th className="text-right">Amount</Th><Th>Reference</Th></tr></thead>
            <tbody>
              {o.payments.map((pay) => (
                <tr key={pay.id}>
                  <Td>{date(pay.paidAt)}</Td>
                  <Td>{PLANS[pay.plan].name} · {pay.whatsappAddon ? "WhatsApp" : "Telegram"}</Td>
                  <Td>{pay.interval === "YEARLY" ? "Yearly" : "Monthly"}</Td>
                  <Td className="text-right">{formatZAR(Number(pay.amountGross), { cents: true })}</Td>
                  <Td className="text-xs text-muted">{pay.pfPaymentId}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
