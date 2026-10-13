"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

interface Values {
  frequency: "MONTHLY" | "FORTNIGHTLY" | "WEEKLY";
  monthStartDay: number;
  anchorDate: string;
  defaultWeeklyMinutes: number;
  defaultDaysPerWeek: number;
}

export function PayrollSettingsForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [hours, setHours] = useState(String(initial.defaultWeeklyMinutes / 60));
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val }));

  async function save() {
    setPending(true);
    setMsg({});
    try {
      await api("/api/settings/payroll", { method: "PUT", body: { ...v, defaultWeeklyMinutes: Math.round(Number(hours) * 60) } });
      setMsg({ success: "Saved. New periods follow these settings; locked periods don't change." });
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof ApiError ? (Object.values(err.fieldErrors)[0] ?? err.message) : "Could not save." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pay frequency">
          <Select value={v.frequency} onChange={(e) => set("frequency", e.target.value as Values["frequency"])}>
            <option value="MONTHLY">Monthly</option>
            <option value="FORTNIGHTLY">Fortnightly</option>
            <option value="WEEKLY">Weekly</option>
          </Select>
        </Field>
        {v.frequency === "MONTHLY" ? (
          <Field label="Period starts on day" hint="1 = calendar month. 26 = 26th to 25th (common cut-off).">
            <Input inputMode="numeric" value={v.monthStartDay} onChange={(e) => set("monthStartDay", Number(e.target.value) || 1)} />
          </Field>
        ) : (
          <Field label="A period start date" hint="Any past start date; later periods follow on from it.">
            <Input type="date" value={v.anchorDate} onChange={(e) => set("anchorDate", e.target.value)} />
          </Field>
        )}
        <Field label="Normal hours per week" hint="Default when an employee has no working hours set (BCEA max 45).">
          <Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
        <Field label="Working days per week">
          <Input inputMode="numeric" value={v.defaultDaysPerWeek} onChange={(e) => set("defaultDaysPerWeek", Number(e.target.value) || 5)} />
        </Field>
      </div>
      <FormMessage error={msg.error} success={msg.success} />
      <Button onClick={save} disabled={pending} className="w-fit">{pending ? "Saving…" : "Save"}</Button>
    </div>
  );
}
