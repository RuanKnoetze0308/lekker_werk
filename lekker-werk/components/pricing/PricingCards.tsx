"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import {
  PLAN_ORDER,
  PLANS,
  TRIAL_DAYS,
  YEARLY_MONTHS_CHARGED,
  formatZAR,
  priceFor,
  type BillingInterval,
  type ChannelChoice,
  type PlanId,
} from "@/lib/pricing";

interface Props {
  /** Omit on the marketing page: the buttons open the signup modal instead. */
  onSelect?: (plan: PlanId, interval: BillingInterval, channel: ChannelChoice) => void;
  ctaLabel?: string;
  /** Billing page: highlight what the company is on right now. */
  current?: { plan: PlanId; interval: BillingInterval; channel: ChannelChoice } | null;
  disabledPlans?: Partial<Record<PlanId, string>>;
  busyPlan?: PlanId | null;
  defaultChannel?: ChannelChoice;
  defaultInterval?: BillingInterval;
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; badge?: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-border bg-white p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${value === o.value ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
        >
          {o.label}
          {o.badge && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${value === o.value ? "bg-brand-green text-ink" : "bg-pale-green text-dark-green"}`}>
              {o.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function PricingCards({
  onSelect,
  ctaLabel,
  current,
  disabledPlans = {},
  busyPlan = null,
  defaultChannel = "TELEGRAM",
  defaultInterval = "MONTHLY",
}: Props) {
  const [interval, setInterval] = useState<BillingInterval>(current?.interval ?? defaultInterval);
  const [channel, setChannel] = useState<ChannelChoice>(current?.channel ?? defaultChannel);

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <Segmented
          label="Billing period"
          value={interval}
          onChange={setInterval}
          options={[
            { value: "MONTHLY", label: "Monthly" },
            { value: "YEARLY", label: "Yearly", badge: `${12 - YEARLY_MONTHS_CHARGED} months free` },
          ]}
        />
        <Segmented
          label="Messaging channel"
          value={channel}
          onChange={setChannel}
          options={[
            { value: "TELEGRAM", label: "Telegram" },
            { value: "WHATSAPP", label: "WhatsApp" },
          ]}
        />
      </div>
      <p className="max-w-xl text-center text-sm text-muted">
        {channel === "TELEGRAM"
          ? "Telegram bots are free to run, so there are no API fees: you only pay for LekkerWerk."
          : "WhatsApp needs the WhatsApp Business API, so each plan adds a WhatsApp fee that covers API access, number set-up and Meta's message fees."}
      </p>

      <div className="grid w-full gap-5 lg:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const plan = PLANS[id];
          const price = priceFor(id, interval, channel);
          const isCurrent = current?.plan === id && current.interval === interval && current.channel === channel;
          const disabledReason = disabledPlans[id];
          return (
            <article
              key={id}
              className={`relative flex flex-col rounded-[24px] border bg-white p-7 text-left ${plan.highlight ? "border-dark-green shadow-[0_12px_40px_-16px_rgba(22,163,74,0.45)]" : "border-border"}`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand-green px-3 py-1 text-[11px] font-bold tracking-wide text-ink">
                  MOST POPULAR
                </span>
              )}
              <h3 className="font-display text-2xl font-bold text-ink">{plan.name}</h3>
              <p className="mt-1 text-sm text-muted">{plan.tagline}</p>

              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="font-display text-[44px] font-bold leading-none text-ink">{formatZAR(Math.round(price.perMonth))}</span>
                <span className="text-sm text-muted">/ month</span>
              </p>
              <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted">
                {interval === "YEARLY" ? (
                  <>Billed {formatZAR(price.charge)} per year. You save {formatZAR(price.yearlySaving)} vs monthly.</>
                ) : (
                  <>Billed monthly. Pay yearly and get {12 - YEARLY_MONTHS_CHARGED} months free.</>
                )}
                {channel === "WHATSAPP" && (
                  <>
                    {" "}
                    <span className="text-ink/70">
                      Includes {formatZAR(plan.monthly)} plan + {formatZAR(plan.whatsappAddon)} WhatsApp API per month.
                    </span>
                  </>
                )}
              </p>

              <ul className="mt-6 flex flex-col gap-2.5 border-t border-border pt-6 text-sm text-ink">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-dark-green" aria-hidden />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex-1" />
              {onSelect ? (
                <button
                  type="button"
                  disabled={isCurrent || !!disabledReason || busyPlan === id}
                  onClick={() => onSelect(id, interval, channel)}
                  className={`rounded-[13px] px-5 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${plan.highlight ? "bg-brand-green text-ink hover:bg-dark-green hover:text-white" : "bg-ink text-white hover:bg-ink/85"}`}
                >
                  {isCurrent ? "Current plan" : busyPlan === id ? "Redirecting to PayFast…" : (ctaLabel ?? "Choose plan")}
                </button>
              ) : (
                <a
                  href="#signup"
                  className={`rounded-[13px] px-5 py-3 text-center text-sm font-semibold transition-colors ${plan.highlight ? "bg-brand-green text-ink hover:bg-dark-green hover:text-white" : "bg-ink text-white hover:bg-ink/85"}`}
                >
                  Start {TRIAL_DAYS}-day free trial
                </a>
              )}
              {disabledReason && <p className="mt-2 text-center text-xs text-red-600">{disabledReason}</p>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
