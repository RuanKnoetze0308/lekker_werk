"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select, Toggle } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

interface Terms {
  payType: "HOURLY" | "SALARIED";
  contractedMinutesPerWeek: number;
  daysPerWeek: number;
  overtimeEligible: boolean;
  recorded: boolean;
  effectiveFrom: string | null;
}

/** Contracted hours: what counts as a normal week, so payroll can tell normal time from overtime. */
export function TermsPanel({ employeeId, terms, scheduleName, canManage }: { employeeId: string; terms: Terms; scheduleName: string | null; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    effectiveFrom: new Date().toISOString().slice(0, 10),
    payType: terms.payType,
    hours: String(terms.contractedMinutesPerWeek / 60),
    daysPerWeek: String(terms.daysPerWeek),
    overtimeEligible: terms.overtimeEligible,
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await api(`/api/employees/${employeeId}/terms`, {
        body: {
          effectiveFrom: f.effectiveFrom,
          payType: f.payType,
          contractedMinutesPerWeek: Math.round(Number(f.hours) * 60),
          daysPerWeek: Number(f.daysPerWeek),
          overtimeEligible: f.overtimeEligible,
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fieldErrors)[0] ?? err.message) : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {row("Normal week", `${terms.contractedMinutesPerWeek / 60} h over ${terms.daysPerWeek} days`)}
      {row("Pay type", `${terms.payType === "HOURLY" ? "Hourly" : "Salaried"}${terms.overtimeEligible ? ", overtime paid" : ", no overtime"}`)}
      {row("Schedule", scheduleName ?? "Company default")}
      <p className="text-xs text-muted">
        {terms.recorded ? `Since ${terms.effectiveFrom}.` : "Company defaults: set this employee's contract to be exact."}
      </p>
      {canManage && (
        <Button size="sm" variant="secondary-light" className="mt-1 w-fit" onClick={() => setOpen(true)}>Change working hours</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Working hours">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From date"><Input type="date" value={f.effectiveFrom} onChange={(e) => setF((p) => ({ ...p, effectiveFrom: e.target.value }))} /></Field>
            <Field label="Pay type">
              <Select value={f.payType} onChange={(e) => setF((p) => ({ ...p, payType: e.target.value as Terms["payType"] }))}>
                <option value="HOURLY">Hourly</option>
                <option value="SALARIED">Salaried</option>
              </Select>
            </Field>
            <Field label="Hours per week"><Input inputMode="decimal" value={f.hours} onChange={(e) => setF((p) => ({ ...p, hours: e.target.value }))} /></Field>
            <Field label="Days per week"><Input inputMode="numeric" value={f.daysPerWeek} onChange={(e) => setF((p) => ({ ...p, daysPerWeek: e.target.value }))} /></Field>
          </div>
          <div className="flex items-center justify-between rounded-[14px] border border-border p-3 text-sm">
            <span>Overtime is paid</span>
            <Toggle checked={f.overtimeEligible} onChange={(v) => setF((p) => ({ ...p, overtimeEligible: v }))} label="Overtime is paid" />
          </div>
          <p className="text-xs text-muted">Earlier periods keep the old terms. When they work is set by their schedule.</p>
          <FormMessage error={error} />
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </Modal>
    </div>
  );
}
