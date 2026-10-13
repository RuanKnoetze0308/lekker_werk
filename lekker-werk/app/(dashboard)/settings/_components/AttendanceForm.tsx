"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input, Select, Toggle } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

interface Values {
  mealBreak: { policy: "AUTO_DEDUCT" | "CLOCKED"; minutes: number; afterMinutes: number; paid: boolean };
  gpsValidationEnabled: boolean;
  requireQrForClocking: boolean;
  allowedRadiusMeters: number;
  duplicateWindowSeconds: number;
  maxShiftHours: number;
  breaksEnabled: boolean;
  overtimeAfterMinutesPerDay: number;
  workingWeek: number[];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function AttendanceForm({ initial }: { initial: Values }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const set = <K extends keyof Values>(k: K, val: Values[K]) => setV((p) => ({ ...p, [k]: val }));
  const setMeal = <K extends keyof Values["mealBreak"]>(k: K, val: Values["mealBreak"][K]) =>
    setV((p) => ({ ...p, mealBreak: { ...p.mealBreak, [k]: val } }));

  async function save() {
    setPending(true);
    setMsg({});
    try {
      await api("/api/settings/attendance", { method: "PUT", body: v });
      setMsg({ success: "Attendance rules saved." });
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof ApiError ? err.message : "Could not save." });
    } finally {
      setPending(false);
    }
  }

  const row = (title: string, desc: string, control: React.ReactNode) => (
    <div className="flex items-center justify-between gap-6 border-b border-border py-4 last:border-0">
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="text-xs text-muted">{desc}</p>
      </div>
      {control}
    </div>
  );

  return (
    <div className="flex flex-col">
      {row("Require QR code", "Employees must scan a workplace QR code to clock.", <Toggle checked={v.requireQrForClocking} onChange={(x) => set("requireQrForClocking", x)} label="Require QR" />)}
      {row("GPS validation", "Ask for live location and check it against the site (location settings can override).", <Toggle checked={v.gpsValidationEnabled} onChange={(x) => set("gpsValidationEnabled", x)} label="GPS validation" />)}
      {row("Allowed radius", "Meters from the location's coordinates.", <Input className="w-28" inputMode="numeric" value={v.allowedRadiusMeters} onChange={(e) => set("allowedRadiusMeters", Number(e.target.value) || 0)} />)}
      {row("Breaks", "Allow Start / End break.", <Toggle checked={v.breaksEnabled} onChange={(x) => set("breaksEnabled", x)} label="Breaks" />)}
      {row(
        "Lunch / meal break",
        "Auto-deduct takes the break off when an employee works long enough but didn't clock it. Clocked counts only breaks they clock.",
        <Select className="w-44" value={v.mealBreak.policy} onChange={(e) => setMeal("policy", e.target.value as Values["mealBreak"]["policy"])}>
          <option value="AUTO_DEDUCT">Auto-deduct</option>
          <option value="CLOCKED">Clocked breaks only</option>
        </Select>,
      )}
      {v.mealBreak.policy === "AUTO_DEDUCT" &&
        row("Break length", "Minutes deducted per day (a schedule's own break length wins).", <Input className="w-28" inputMode="numeric" value={v.mealBreak.minutes} onChange={(e) => setMeal("minutes", Number(e.target.value) || 0)} />)}
      {v.mealBreak.policy === "AUTO_DEDUCT" &&
        row("Deduct after", "Minutes worked in a day before the break applies (BCEA: 5 hours = 300).", <Input className="w-28" inputMode="numeric" value={v.mealBreak.afterMinutes} onChange={(e) => setMeal("afterMinutes", Number(e.target.value) || 0)} />)}
      {row("Paid break", "Count the break as time worked (only if your contracts say so).", <Toggle checked={v.mealBreak.paid} onChange={(x) => setMeal("paid", x)} label="Paid break" />)}
      {row("Duplicate window", "Seconds in which a repeated identical action is ignored.", <Input className="w-28" inputMode="numeric" value={v.duplicateWindowSeconds} onChange={(e) => set("duplicateWindowSeconds", Number(e.target.value) || 0)} />)}
      {row("Max shift length", "Hours before an open clock-in is treated as forgotten.", <Input className="w-28" inputMode="numeric" value={v.maxShiftHours} onChange={(e) => set("maxShiftHours", Number(e.target.value) || 1)} />)}
      {row("Overtime after", "Minutes per day (default when a schedule doesn't set it).", <Input className="w-28" inputMode="numeric" value={v.overtimeAfterMinutesPerDay} onChange={(e) => set("overtimeAfterMinutesPerDay", Number(e.target.value) || 0)} />)}
      <Field label="Working week" className="pt-4">
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d, i) => {
            const on = v.workingWeek.includes(i + 1);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => set("workingWeek", on ? v.workingWeek.filter((x) => x !== i + 1) : [...v.workingWeek, i + 1].sort())}
                className={`rounded-[10px] border px-3 py-1.5 text-sm font-medium ${on ? "border-dark-green bg-pale-green text-ink" : "border-border text-muted"}`}
              >
                {d}
              </button>
            );
          })}
        </div>
      </Field>
      <div className="mt-5 flex flex-col gap-3">
        <FormMessage error={msg.error} success={msg.success} />
        <Button onClick={save} disabled={pending || v.workingWeek.length === 0} className="w-fit">{pending ? "Saving…" : "Save rules"}</Button>
      </div>
    </div>
  );
}
