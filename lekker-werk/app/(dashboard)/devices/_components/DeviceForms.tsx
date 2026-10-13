"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";
import { CREDENTIAL_KIND_LABEL, DEVICE_KIND_LABEL } from "@/lib/device-labels";

/** Shown exactly once after create / rotate: the server only keeps a hash. */
function KeyReveal({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-pale-green p-4">
      <p className="text-sm font-semibold text-ink">Device API key</p>
      <code className="break-all rounded-[10px] bg-white px-3 py-2 text-xs text-ink">{apiKey}</code>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="secondary-light"
          onClick={() => navigator.clipboard.writeText(apiKey).then(() => setCopied(true))}
        >
          {copied ? "Copied" : "Copy key"}
        </Button>
        <span className="text-xs text-muted">Store it in the terminal now. It won&rsquo;t be shown again.</span>
      </div>
    </div>
  );
}

export function AddDeviceButton({ locations }: { locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    locationId: locations[0]?.id ?? "",
    kind: "RFID_READER",
    name: "",
    serialNumber: "",
    fixedAction: "",
  });
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setPending(true);
    setError(null);
    try {
      const res = await api<{ apiKey: string }>("/api/devices", {
        body: { ...form, fixedAction: form.fixedAction || null },
      });
      setApiKey(res.apiKey);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the device.");
    } finally {
      setPending(false);
    }
  }

  function close() {
    setOpen(false);
    setApiKey(null);
    setForm((f) => ({ ...f, name: "", serialNumber: "" }));
  }

  return (
    <>
      <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)} disabled={!locations.length}>
        Add device
      </Button>
      <Modal open={open} onClose={close} title={apiKey ? "Device added" : "Add a clock device"}>
        {apiKey ? (
          <div className="flex flex-col gap-4">
            <KeyReveal apiKey={apiKey} />
            <Button onClick={close} variant="ink">Done</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name"><Input value={form.name} onChange={set("name")} placeholder="Front door reader" /></Field>
              <Field label="Type">
                <Select value={form.kind} onChange={set("kind")}>
                  {Object.entries(DEVICE_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>
              <Field label="Location">
                <Select value={form.locationId} onChange={set("locationId")}>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
              <Field label="Serial number (optional)"><Input value={form.serialNumber} onChange={set("serialNumber")} /></Field>
            </div>
            <Field label="What does a tap do?" hint="Most sites use one reader for both. Separate in/out doors can use fixed modes.">
              <Select value={form.fixedAction} onChange={set("fixedAction")}>
                <option value="">Tap in / tap out (decided by the employee&rsquo;s status)</option>
                <option value="CLOCK_IN">Always clock in</option>
                <option value="CLOCK_OUT">Always clock out</option>
              </Select>
            </Field>
            <FormMessage error={error} />
            <Button onClick={save} disabled={pending || !form.name}>{pending ? "Adding…" : "Add device"}</Button>
          </div>
        )}
      </Modal>
    </>
  );
}

export function DeviceActions({
  id,
  name,
  enabled,
  canSimulate,
}: {
  id: string;
  name: string;
  enabled: boolean;
  canSimulate: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [cred, setCred] = useState({ kind: "RFID_CARD", value: "" });
  const [sim, setSim] = useState<{ status: string; display: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    await api(`/api/devices/${id}`, { method: "PATCH", body: { enabled: !enabled } }).catch(() => {});
    setPending(false);
    router.refresh();
  }

  async function rotate() {
    if (!confirm(`Rotate the key for ${name}? The device stops working until it's given the new key.`)) return;
    setPending(true);
    try {
      setRotatedKey((await api<{ apiKey: string }>(`/api/devices/${id}/rotate-key`, { body: {} })).apiKey);
    } finally {
      setPending(false);
    }
  }

  async function tap() {
    setError(null);
    setSim(null);
    try {
      setSim(await api(`/api/devices/${id}/simulate`, { body: { credential: cred } }));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Simulation failed.");
    }
  }

  const link = "text-xs font-medium hover:underline disabled:opacity-50";
  return (
    <div className="flex justify-end gap-3">
      {canSimulate && enabled && (
        <button type="button" className={`${link} text-dark-green`} onClick={() => setSimOpen(true)}>Test tap</button>
      )}
      <button type="button" className={`${link} text-ink`} onClick={rotate} disabled={pending}>Rotate key</button>
      <button type="button" className={`${link} ${enabled ? "text-red-600" : "text-dark-green"}`} onClick={toggle} disabled={pending}>
        {enabled ? "Disable" : "Enable"}
      </button>

      <Modal open={!!rotatedKey} onClose={() => setRotatedKey(null)} title={`New key for ${name}`}>
        {rotatedKey && <KeyReveal apiKey={rotatedKey} />}
      </Modal>

      <Modal open={simOpen} onClose={() => { setSimOpen(false); setSim(null); }} title={`Test tap on ${name}`}>
        <div className="flex flex-col gap-4 text-left">
          <p className="text-sm text-muted">
            Runs exactly what happens when someone taps this device: the same validation, the same records, the same
            hours. Use a card number or PIN you issued on an employee&rsquo;s profile.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Credential">
              <Select value={cred.kind} onChange={(e) => setCred((c) => ({ ...c, kind: e.target.value }))}>
                {Object.entries(CREDENTIAL_KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label={cred.kind === "PIN" ? "PIN" : "Card / tag number"}>
              <Input value={cred.value} onChange={(e) => setCred((c) => ({ ...c, value: e.target.value }))} placeholder={cred.kind === "PIN" ? "1234" : "04A21F9C"} />
            </Field>
          </div>
          <FormMessage error={error} />
          {sim && (
            <div className={`rounded-[14px] p-4 text-center ${sim.status === "ACCEPTED" ? "bg-pale-green text-dark-green" : "bg-amber-50 text-amber-800"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">Device screen</p>
              <p className="mt-1 font-display text-lg font-bold">{sim.display}</p>
            </div>
          )}
          <Button onClick={tap} disabled={!cred.value}>Tap</Button>
        </div>
      </Modal>
    </div>
  );
}
