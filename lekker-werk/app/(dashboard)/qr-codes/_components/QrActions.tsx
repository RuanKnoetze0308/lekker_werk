"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, MonitorPlay, Plus, Printer, RefreshCw, Share2 } from "lucide-react";
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
  const [mode, setMode] = useState<"STATIC" | "DYNAMIC">("STATIC");

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
          mode,
          rotationSeconds: mode === "DYNAMIC" ? Number(f.get("rotationSeconds")) : undefined,
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

  const modeOption = (value: "STATIC" | "DYNAMIC", title: string, hint: string) => (
    <label
      className={`flex cursor-pointer flex-col gap-0.5 rounded-xl border p-3 text-sm ${mode === value ? "border-dark-green bg-brand-green/10" : "border-border"}`}
    >
      <span className="flex items-center gap-2 font-semibold text-ink">
        <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="accent-dark-green" />
        {title}
      </span>
      <span className="text-xs text-muted">{hint}</span>
    </label>
  );

  return (
    <>
      <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New QR code</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New QR code">
        {locations.length === 0 ? (
          <p className="text-sm text-muted">Add a location first. Each QR code belongs to one location.</p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Field label="Location">
              <Select name="locationId" required>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
            </Field>
            <Field label="Label" hint="e.g. Front door, Staff room"><Input name="label" required maxLength={120} /></Field>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-1.5 text-sm font-medium text-ink">Mode</legend>
              {modeOption("STATIC", "Static", "Never changes. Print it and stick it up.")}
              {modeOption("DYNAMIC", "Dynamic", "Changes every few seconds on a screen. Photos of it stop working.")}
            </fieldset>
            {mode === "DYNAMIC" && (
              <Field label="New code every" hint="Shown full-screen on a tablet or TV at the entrance">
                <Select name="rotationSeconds" defaultValue="30">
                  <option value="15">15 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">1 minute</option>
                  <option value="120">2 minutes</option>
                  <option value="300">5 minutes</option>
                </Select>
              </Field>
            )}
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
        )}
      </Modal>
    </>
  );
}

export function QrRowActions({
  id,
  enabled,
  mode,
  align = "end",
}: {
  id: string;
  enabled: boolean;
  mode: "STATIC" | "DYNAMIC";
  align?: "start" | "end";
}) {
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

  async function displayUrl() {
    const { url } = await api<{ url: string }>(`/api/qr/${id}/display`);
    return url;
  }

  async function openDisplay() {
    // Open the tab synchronously so pop-up blockers allow it, then point it at the link.
    const win = window.open("", "_blank");
    try {
      const url = await displayUrl();
      if (win) win.location.href = url;
      else location.href = url;
    } catch (err) {
      win?.close();
      alert(err instanceof ApiError ? err.message : "Could not open the display.");
    }
  }

  async function copyDisplay() {
    try {
      await navigator.clipboard.writeText(await displayUrl());
      alert("Display link copied. Open it on the screen at the entrance; anyone with the link can show this code, so Regenerate if it leaks.");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not copy the link.");
    }
  }

  const icon = "inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted hover:text-ink md:size-8";
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${align === "end" ? "justify-end" : "justify-start"}`}>
      {mode === "DYNAMIC" ? (
        <>
          <button type="button" onClick={openDisplay} className={icon} aria-label="Open display screen" title="Open display screen"><MonitorPlay className="size-4" /></button>
          <button type="button" onClick={copyDisplay} className={icon} aria-label="Copy display link" title="Copy display link"><Copy className="size-4" /></button>
        </>
      ) : (
        <>
          <a href={`/api/qr/${id}/download?format=png`} className={icon} aria-label="Download PNG" title="Download PNG"><Download className="size-4" /></a>
          <a href={`/qr-codes/${id}/print`} target="_blank" rel="noopener" className={icon} aria-label="Print" title="Print"><Printer className="size-4" /></a>
          <button type="button" onClick={share} className={icon} aria-label="Share" title="Share"><Share2 className="size-4" /></button>
        </>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          confirm(
            mode === "DYNAMIC"
              ? "Regenerate this QR code? Every display screen link stops working and must be replaced."
              : "Regenerate this QR code? The current code stops working immediately and printed copies must be replaced.",
          ) && run(() => api(`/api/qr/${id}/regenerate`, { body: {} }))
        }
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
