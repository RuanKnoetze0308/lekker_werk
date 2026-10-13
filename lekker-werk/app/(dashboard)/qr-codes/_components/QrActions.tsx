"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Printer, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

export function QrCreateButton({ locations }: { locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState("GENERAL");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/api/qr", {
        body: {
          locationId: f.get("locationId"),
          label: f.get("label"),
          type,
          expiresAt: type === "TEMPORARY" && f.get("expiresAt") ? new Date(String(f.get("expiresAt"))).toISOString() : null,
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create the QR code.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New QR code</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New QR code">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Location">
            <Select name="locationId" required>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
          </Field>
          <Field label="Label" hint="e.g. Front door, Staff room"><Input name="label" required maxLength={120} /></Field>
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="GENERAL">General clocking</option>
              <option value="CLOCK_IN">Clock in only</option>
              <option value="CLOCK_OUT">Clock out only</option>
              <option value="TEMPORARY">Temporary</option>
            </Select>
          </Field>
          {type === "TEMPORARY" && <Field label="Expires" hint="Defaults to 24 hours"><Input type="datetime-local" name="expiresAt" /></Field>}
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create QR code"}</Button>
        </form>
      </Modal>
    </>
  );
}

export function QrRowActions({ id, enabled }: { id: string; enabled: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setPending(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  async function share() {
    const url = `${location.origin}/qr-codes/${id}/print`;
    if (navigator.share) await navigator.share({ title: "LekkerWerk QR code", url }).catch(() => {});
    else {
      await navigator.clipboard.writeText(url);
      alert("Print link copied. Only signed-in managers with access can open it.");
    }
  }

  const icon = "inline-flex size-8 items-center justify-center rounded-lg border border-border text-muted hover:text-ink";
  return (
    <div className="flex items-center justify-end gap-1.5">
      <a href={`/api/qr/${id}/download?format=png`} className={icon} aria-label="Download PNG" title="Download PNG"><Download className="size-4" /></a>
      <a href={`/qr-codes/${id}/print`} target="_blank" rel="noopener" className={icon} aria-label="Print" title="Print"><Printer className="size-4" /></a>
      <button type="button" onClick={share} className={icon} aria-label="Share" title="Share"><Share2 className="size-4" /></button>
      <button
        type="button"
        disabled={pending}
        onClick={() => confirm("Regenerate this QR code? The current code stops working immediately and printed copies must be replaced.") && run(() => api(`/api/qr/${id}/regenerate`, { body: {} }))}
        className={icon}
        aria-label="Regenerate"
        title="Regenerate"
      >
        <RefreshCw className="size-4" />
      </button>
      <Button size="sm" variant={enabled ? "danger" : "secondary-light"} disabled={pending} onClick={() => run(() => api(`/api/qr/${id}/enabled`, { body: { enabled: !enabled } }))}>
        {enabled ? "Disable" : "Enable"}
      </Button>
    </div>
  );
}
