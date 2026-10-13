"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select, Toggle } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";
import { TIMEZONES } from "@/lib/defaults";

const num = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number(v));

export function NewLocationButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/api/locations", {
        body: { name: f.get("name"), address: f.get("address"), latitude: num(f.get("latitude")), longitude: num(f.get("longitude")) },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add the location.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Add location</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add location">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Name"><Input name="name" required /></Field>
          <Field label="Address"><Input name="address" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude"><Input name="latitude" inputMode="decimal" placeholder="-29.8587" /></Field>
            <Field label="Longitude"><Input name="longitude" inputMode="decimal" placeholder="31.0218" /></Field>
          </div>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add location"}</Button>
        </form>
      </Modal>
    </>
  );
}

export interface LocationSettingsValues {
  id: string;
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  gpsValidationEnabled: boolean | null;
  allowedRadiusMeters: number | null;
  status: "ACTIVE" | "INACTIVE";
}

export function LocationSettingsForm({ loc, canEdit }: { loc: LocationSettingsValues; canEdit: boolean }) {
  const router = useRouter();
  const [gps, setGps] = useState<boolean | null>(loc.gpsValidationEnabled);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setMsg({});
    try {
      await api(`/api/locations/${loc.id}`, {
        method: "PATCH",
        body: {
          name: f.get("name"),
          address: f.get("address"),
          latitude: num(f.get("latitude")),
          longitude: num(f.get("longitude")),
          timezone: f.get("timezone"),
          gpsValidationEnabled: gps,
          allowedRadiusMeters: num(f.get("radius")),
          status: f.get("status"),
        },
      });
      setMsg({ success: "Saved." });
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof ApiError ? err.message : "Could not save." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <fieldset disabled={!canEdit} className="contents">
        <Field label="Name"><Input name="name" defaultValue={loc.name} required /></Field>
        <Field label="Address"><Input name="address" defaultValue={loc.address} /></Field>
        <Field label="Latitude"><Input name="latitude" inputMode="decimal" defaultValue={loc.latitude ?? ""} /></Field>
        <Field label="Longitude"><Input name="longitude" inputMode="decimal" defaultValue={loc.longitude ?? ""} /></Field>
        <Field label="Timezone">
          <Select name="timezone" defaultValue={loc.timezone}>
            {[...new Set([loc.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Status">
          <Select name="status" defaultValue={loc.status}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </Select>
        </Field>
        <div className="flex items-center justify-between gap-4 rounded-[14px] border border-border p-4 sm:col-span-2">
          <div>
            <p className="text-sm font-medium text-ink">GPS validation at this location</p>
            <p className="text-xs text-muted">
              {gps === null ? "Using the company default." : gps ? "Employees must share their location." : "Location is not checked."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {gps !== null && (
              <button type="button" className="text-xs text-muted underline" onClick={() => setGps(null)}>Use default</button>
            )}
            <Toggle checked={gps ?? false} onChange={setGps} label="GPS validation" />
          </div>
        </div>
        <Field label="Allowed radius (meters)" hint="Blank = company default">
          <Input name="radius" inputMode="numeric" defaultValue={loc.allowedRadiusMeters ?? ""} />
        </Field>
      </fieldset>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessage error={msg.error} success={msg.success} />
        {canEdit && <Button type="submit" disabled={pending} className="w-fit">{pending ? "Saving…" : "Save changes"}</Button>}
      </div>
    </form>
  );
}

export function ManagersForm({
  locationId,
  managers,
  selected,
}: {
  locationId: string;
  managers: { id: string; name: string }[];
  selected: string[];
}) {
  const router = useRouter();
  const [ids, setIds] = useState(selected);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});

  async function save() {
    setPending(true);
    setMsg({});
    try {
      await api(`/api/locations/${locationId}/managers`, { method: "PUT", body: { userIds: ids } });
      setMsg({ success: "Managers updated." });
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof ApiError ? err.message : "Could not update managers." });
    } finally {
      setPending(false);
    }
  }

  if (!managers.length) {
    return <p className="text-sm text-muted">No manager accounts yet. Create one under Settings → Users &amp; roles.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {managers.map((m) => (
        <label key={m.id} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ids.includes(m.id)}
            onChange={(e) => setIds(e.target.checked ? [...ids, m.id] : ids.filter((x) => x !== m.id))}
            className="size-4 accent-[var(--color-dark-green)]"
          />
          {m.name}
        </label>
      ))}
      <FormMessage error={msg.error} success={msg.success} />
      <Button size="sm" onClick={save} disabled={pending} className="w-fit">Save managers</Button>
    </div>
  );
}
