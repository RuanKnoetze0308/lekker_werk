"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Toggle } from "@/components/ui/form";
import { Badge } from "@/components/dashboard/ui";
import { api, ApiError } from "@/lib/api-client";

interface Closure {
  id: string;
  startDate: string;
  endDate: string;
  paid: boolean;
  reason: string;
}

/** Load-shedding, strikes, flooding: scheduled time at the site isn't counted as absence. */
export function ClosuresPanel({ locationId, closures, canManage }: { locationId: string; closures: Closure[]; canManage: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ startDate: today, endDate: today, paid: true, reason: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      await api(`/api/locations/${locationId}/closures`, { body: f });
      setOpen(false);
      setF((p) => ({ ...p, reason: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fieldErrors)[0] ?? err.message) : "Could not save.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this closure? Those days will count as normal working days again.")) return;
    try {
      await api(`/api/closures/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not remove.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {closures.length === 0 ? (
        <p className="text-sm text-muted">No closures recorded.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {closures.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2">
              <span>
                {c.startDate === c.endDate ? c.startDate : `${c.startDate} → ${c.endDate}`}
                <span className="block text-xs text-muted">{c.reason}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone={c.paid ? "green" : "gray"}>{c.paid ? "paid" : "unpaid"}</Badge>
                {canManage && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => remove(c.id)}>Remove</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canManage && <Button size="sm" variant="secondary-light" className="w-fit" onClick={() => setOpen(true)}>Record a closure</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title="Site closure">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From"><Input type="date" value={f.startDate} onChange={(e) => setF((p) => ({ ...p, startDate: e.target.value, endDate: e.target.value > p.endDate ? e.target.value : p.endDate }))} /></Field>
            <Field label="To"><Input type="date" value={f.endDate} min={f.startDate} onChange={(e) => setF((p) => ({ ...p, endDate: e.target.value }))} /></Field>
          </div>
          <Field label="Reason"><Input value={f.reason} onChange={(e) => setF((p) => ({ ...p, reason: e.target.value }))} placeholder="Load-shedding stage 6, no generator" /></Field>
          <div className="flex items-center justify-between rounded-[14px] border border-border p-3 text-sm">
            <span>Staff are paid for this time</span>
            <Toggle checked={f.paid} onChange={(v) => setF((p) => ({ ...p, paid: v }))} label="Paid" />
          </div>
          <p className="text-xs text-muted">Anyone who did work is still paid for the hours they clocked; the closure covers the rest of their scheduled time.</p>
          <FormMessage error={error} />
          <Button onClick={save} disabled={pending || f.reason.trim().length < 3}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </Modal>
    </div>
  );
}
