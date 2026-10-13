"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PricingCards } from "@/components/pricing/PricingCards";
import { Button } from "@/components/ui/Button";
import { FormMessage } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";
import type { BillingInterval, ChannelChoice, PlanId } from "@/lib/pricing";

interface Checkout {
  action: string;
  fields: [string, string][];
}

export function PlanPicker({
  current,
  disabledPlans,
  defaultChannel,
}: {
  current: { plan: PlanId; interval: BillingInterval; channel: ChannelChoice } | null;
  disabledPlans: Partial<Record<PlanId, string>>;
  defaultChannel: ChannelChoice;
}) {
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(plan: PlanId, interval: BillingInterval, channel: ChannelChoice) {
    setBusy(plan);
    setError(null);
    try {
      const co = await api<Checkout>("/api/billing/checkout", { body: { plan, interval, channel } });
      // PayFast needs a normal browser form POST with the signed fields.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = co.action;
      for (const [name, value] of co.fields) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start checkout.");
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <FormMessage error={error} />
      <PricingCards
        onSelect={choose}
        ctaLabel="Pay with PayFast"
        current={current}
        disabledPlans={disabledPlans}
        busyPlan={busy}
        defaultChannel={defaultChannel}
      />
      <p className="text-center text-xs text-muted">You&rsquo;ll be taken to PayFast to pay by card, instant EFT and more. We never see your card details.</p>
    </div>
  );
}

export function CancelButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!confirm("Cancel your subscription? You keep access until the end of the period you've paid for, and you won't be charged again.")) return;
    setPending(true);
    setError(null);
    try {
      await api("/api/billing/cancel", { body: {} });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not cancel.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button variant="danger" size="sm" onClick={cancel} disabled={pending} className="w-fit">
        {pending ? "Cancelling…" : "Cancel subscription"}
      </Button>
      <FormMessage error={error} />
    </div>
  );
}
