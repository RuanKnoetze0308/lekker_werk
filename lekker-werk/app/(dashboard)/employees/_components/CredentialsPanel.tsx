"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/dashboard/ui";
import { api, ApiError } from "@/lib/api-client";
import { CREDENTIAL_KIND_LABEL } from "@/lib/device-labels";

interface Credential {
  id: string;
  kind: keyof typeof CREDENTIAL_KIND_LABEL;
  valueHint: string;
  label: string | null;
  lastUsed: string | null;
  revoked: boolean;
}

/** Cards, tags, PINs and fingerprint ids this employee uses on clock devices. */
export function CredentialsPanel({
  employeeId,
  credentials,
  canManage,
}: {
  employeeId: string;
  credentials: Credential[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ kind: "RFID_CARD", value: "", label: "" });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});

  async function issue() {
    setPending(true);
    setMsg({});
    try {
      await api(`/api/employees/${employeeId}/credentials`, { body: form });
      setForm((f) => ({ ...f, value: "", label: "" }));
      setMsg({ success: "Issued." });
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof ApiError ? (Object.values(err.fieldErrors)[0] ?? err.message) : "Could not issue." });
    } finally {
      setPending(false);
    }
  }

  async function revoke(credentialId: string) {
    if (!confirm("Revoke this credential? It stops working on every device immediately.")) return;
    await api(`/api/employees/${employeeId}/credentials`, { method: "DELETE", body: { credentialId } });
    router.refresh();
  }

  const live = credentials.filter((c) => !c.revoked);
  return (
    <div className="flex flex-col gap-4">
      {live.length === 0 ? (
        <p className="text-sm text-muted">No cards, tags or PINs issued.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {live.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {CREDENTIAL_KIND_LABEL[c.kind]}
                {c.valueHint && <span className="text-muted"> ···{c.valueHint}</span>}
                {c.label && <span className="text-muted"> · {c.label}</span>}
                <span className="block text-xs text-muted">{c.lastUsed ? `Last used ${c.lastUsed}` : "Not used yet"}</span>
              </span>
              <span className="flex items-center gap-2">
                <Badge tone="green">active</Badge>
                {canManage && (
                  <button type="button" onClick={() => revoke(c.id)} className="text-xs text-red-600 hover:underline">Revoke</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-2">
            <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))} aria-label="Credential type">
              {Object.entries(CREDENTIAL_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder={form.kind === "PIN" ? "4–8 digits" : "Card number"}
              aria-label="Value"
              type={form.kind === "PIN" ? "password" : "text"}
              autoComplete="off"
            />
          </div>
          <Field label="Label (optional)">
            <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Blue lanyard card" />
          </Field>
          <Button variant="secondary-light" size="sm" onClick={issue} disabled={pending || !form.value}>Issue</Button>
          <FormMessage error={msg.error} success={msg.success} />
        </div>
      )}
    </div>
  );
}
