"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select, Toggle } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";
import { catalogByProvider, PROVIDER_CATALOG, type ProviderId } from "@/lib/integration-catalog";

interface Existing {
  id: string;
  provider: ProviderId;
  category: string;
  name: string;
  enabled: boolean;
  config: Record<string, string>;
  hasCredentials: boolean;
  syncFrequencyMinutes: number;
}

export function IntegrationFormButton({
  integration,
  provider: initialProvider,
  label,
}: {
  integration?: Existing;
  /** Preselect a system (catalog cards). */
  provider?: ProviderId;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId>(integration?.provider ?? initialProvider ?? "CUSTOM_API");
  const meta = catalogByProvider[provider];
  const [name, setName] = useState(integration?.name ?? "");
  const [category, setCategory] = useState(integration?.category ?? meta.categories[0]);
  const [freq, setFreq] = useState(String(integration?.syncFrequencyMinutes ?? 60));
  const [enabled, setEnabled] = useState(integration?.enabled ?? true);
  const [config, setConfig] = useState<Record<string, string>>(integration?.config ?? {});
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    try {
      const credentials = Object.fromEntries(Object.entries(creds).filter(([, v]) => v));
      await api(integration ? `/api/integrations/${integration.id}` : "/api/integrations", {
        method: integration ? "PUT" : "POST",
        body: {
          provider,
          category,
          name: name || meta.label,
          enabled,
          syncFrequencyMinutes: Number(freq),
          config,
          credentials: Object.keys(credentials).length ? credentials : undefined,
        },
      });
      setOpen(false);
      setCreds({});
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the integration.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {integration ? (
        <Button size="sm" variant="secondary-light" onClick={() => setOpen(true)}>Configure</Button>
      ) : label ? (
        <Button size="sm" variant="secondary-light" onClick={() => setOpen(true)}>{label}</Button>
      ) : (
        <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Connect system</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={integration ? "Configure integration" : "Connect a system"} wide>
        <div className="flex flex-col gap-4">
          {!meta.implemented && (
            <p className="rounded-[10px] bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The {meta.label} connector is registered but not available yet. You can save the settings now; syncing will fail until it ships.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="System">
              <Select
                value={provider}
                disabled={!!integration}
                onChange={(e) => {
                  const next = e.target.value as ProviderId;
                  setProvider(next);
                  setCategory(catalogByProvider[next].categories[0]);
                  setConfig({});
                  setCreds({});
                }}
              >
                {PROVIDER_CATALOG.map((p) => <option key={p.provider} value={p.provider}>{p.label}{p.implemented ? "" : " (coming soon)"}</option>)}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {meta.categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Display name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder={meta.label} /></Field>
            <Field label="Sync every (minutes)"><Input inputMode="numeric" value={freq} onChange={(e) => setFreq(e.target.value)} /></Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {meta.configFields.map((f) => (
              <Field key={f.key} label={f.label}>
                <Input value={config[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => setConfig((p) => ({ ...p, [f.key]: e.target.value }))} />
              </Field>
            ))}
            {meta.credentialFields.map((f) => (
              <Field key={f.key} label={f.label} hint={integration?.hasCredentials ? "Stored securely. Leave blank to keep the current value." : "Stored encrypted. Never shown again."}>
                <Input
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  value={creds[f.key] ?? ""}
                  placeholder={integration?.hasCredentials ? "••••••••" : ""}
                  onChange={(e) => setCreds((p) => ({ ...p, [f.key]: e.target.value }))}
                />
              </Field>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-[14px] border border-border p-4">
            <span className="text-sm font-medium">Enabled</span>
            <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
          </div>
          <FormMessage error={error} />
          <Button onClick={save} disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      </Modal>
    </>
  );
}

export function IntegrationActions({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});

  async function run(key: string, fn: () => Promise<unknown>, success: string) {
    setPending(key);
    setMsg({});
    try {
      await fn();
      setMsg({ success });
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof ApiError ? err.message : "Request failed." });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary-light" disabled={!!pending} onClick={() => run("test", () => api(`/api/integrations/${id}/test`, { body: {} }), "Connection successful.")}>
          {pending === "test" ? "Testing…" : "Test connection"}
        </Button>
        <Button size="sm" variant="secondary-light" disabled={!!pending} onClick={() => run("sync", () => api(`/api/integrations/${id}/sync`, { body: {} }), "Sync queued. It will run on the next worker tick.")}>
          Sync now
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={!!pending}
          onClick={() => confirm("Disconnect this integration? Stored credentials are deleted; imported history is kept.") && run("del", () => api(`/api/integrations/${id}`, { method: "DELETE" }), "Disconnected.")}
        >
          Disconnect
        </Button>
      </div>
      <FormMessage error={msg.error} success={msg.success} />
    </div>
  );
}
