"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

export interface EmployeeFormValues {
  locationId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  managerId: string;
  preferredChannel: string;
  platformIdentifier: string;
  extraLocationIds: string[];
  hiredOn: string;
}

export function EmployeeForm({
  employeeId,
  initial,
  locations,
  managers,
}: {
  employeeId?: string;
  initial?: Partial<EmployeeFormValues>;
  locations: { id: string; name: string }[];
  managers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [v, setV] = useState<EmployeeFormValues>({
    locationId: initial?.locationId ?? locations[0]?.id ?? "",
    employeeNumber: initial?.employeeNumber ?? "",
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    department: initial?.department ?? "",
    position: initial?.position ?? "",
    managerId: initial?.managerId ?? "",
    preferredChannel: initial?.preferredChannel ?? "",
    platformIdentifier: initial?.platformIdentifier ?? "",
    extraLocationIds: initial?.extraLocationIds ?? [],
    hiredOn: initial?.hiredOn ?? "",
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});

  const set = <K extends keyof EmployeeFormValues>(k: K, val: EmployeeFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFe({});
    const body = {
      ...v,
      managerId: v.managerId || null,
      preferredChannel: v.preferredChannel || null,
    };
    try {
      const res = await api<{ id: string }>(employeeId ? `/api/employees/${employeeId}` : "/api/employees", {
        method: employeeId ? "PATCH" : "POST",
        body,
      });
      router.push(`/employees/${res.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFe(err.fieldErrors);
      } else setError("Could not save the employee.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="First name" error={fe.firstName}>
        <Input value={v.firstName} onChange={(e) => set("firstName", e.target.value)} required />
      </Field>
      <Field label="Last name" error={fe.lastName}>
        <Input value={v.lastName} onChange={(e) => set("lastName", e.target.value)} required />
      </Field>
      <Field label="Employee number" error={fe.employeeNumber}>
        <Input value={v.employeeNumber} onChange={(e) => set("employeeNumber", e.target.value)} required />
      </Field>
      <Field label="Primary location" error={fe.locationId}>
        <Select value={v.locationId} onChange={(e) => set("locationId", e.target.value)} required>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Email" error={fe.email}>
        <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="Phone" error={fe.phone}>
        <Input type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
      </Field>
      <Field label="Start date" hint="Leave builds up from this date." error={fe.hiredOn}>
        <Input type="date" value={v.hiredOn} onChange={(e) => set("hiredOn", e.target.value)} />
      </Field>
      <Field label="Department">
        <Input value={v.department} onChange={(e) => set("department", e.target.value)} />
      </Field>
      <Field label="Position">
        <Input value={v.position} onChange={(e) => set("position", e.target.value)} />
      </Field>
      <Field label="Manager">
        <Select value={v.managerId} onChange={(e) => set("managerId", e.target.value)}>
          <option value="">No manager</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Communication platform">
        <Select value={v.preferredChannel} onChange={(e) => set("preferredChannel", e.target.value)}>
          <option value="">Company default</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="TELEGRAM">Telegram</option>
        </Select>
      </Field>
      <Field label="Platform identifier" hint="Telegram username or WhatsApp number (informational; linking is verified separately)" className="sm:col-span-2">
        <Input value={v.platformIdentifier} onChange={(e) => set("platformIdentifier", e.target.value)} />
      </Field>

      {locations.length > 1 && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-[13px] font-medium text-ink">Also works at</legend>
          <div className="flex flex-wrap gap-3">
            {locations
              .filter((l) => l.id !== v.locationId)
              .map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={v.extraLocationIds.includes(l.id)}
                    onChange={(e) =>
                      set(
                        "extraLocationIds",
                        e.target.checked ? [...v.extraLocationIds, l.id] : v.extraLocationIds.filter((x) => x !== l.id),
                      )
                    }
                    className="size-4 accent-[var(--color-dark-green)]"
                  />
                  {l.name}
                </label>
              ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessage error={error} />
        <div className="flex gap-3">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : employeeId ? "Save changes" : "Add employee"}</Button>
          <Button variant="secondary-light" onClick={() => router.back()}>Cancel</Button>
        </div>
      </div>
    </form>
  );
}
