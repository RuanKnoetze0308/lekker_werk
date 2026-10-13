"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage, Toggle } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

export function PermissionsForm({
  items,
  initial,
}: {
  items: { key: string; label: string }[];
  initial: Record<string, boolean>;
}) {
  const [v, setV] = useState(initial);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});

  async function save() {
    setPending(true);
    setMsg({});
    try {
      await api("/api/settings/employee-permissions", { method: "PUT", body: { permissions: v } });
      setMsg({ success: "Saved. Changes apply to the next message an employee sends." });
    } catch (err) {
      setMsg({ error: err instanceof ApiError ? err.message : "Could not save." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col">
      <p className="mb-2 text-sm text-muted">Clocking is always available. Turn off anything you don&rsquo;t want employees to see.</p>
      {items.map((i) => (
        <div key={i.key} className="flex items-center justify-between border-b border-border py-3 last:border-0">
          <span className="text-sm font-medium text-ink">{i.label}</span>
          <Toggle checked={!!v[i.key]} onChange={(x) => setV((p) => ({ ...p, [i.key]: x }))} label={i.label} />
        </div>
      ))}
      <div className="mt-5 flex flex-col gap-3">
        <FormMessage error={msg.error} success={msg.success} />
        <Button onClick={save} disabled={pending} className="w-fit">{pending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
