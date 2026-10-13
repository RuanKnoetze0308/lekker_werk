"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";
import { TIMEZONES } from "@/lib/defaults";

interface Company {
  name: string;
  registrationNumber: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  timezone: string;
  preferredChannel: string;
}

export function CompanyForm({ company }: { company: Company }) {
  const router = useRouter();
  const [v, setV] = useState(company);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const set = (k: keyof Company, val: string) => setV((p) => ({ ...p, [k]: val }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setMsg({});
    try {
      await api("/api/company", { method: "PATCH", body: { ...v, registrationNumber: v.registrationNumber || null } });
      setMsg({ success: "Company details saved." });
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof ApiError ? err.message : "Could not save." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <Field label="Company name" className="sm:col-span-2"><Input value={v.name} onChange={(e) => set("name", e.target.value)} required /></Field>
      <Field label="Registration number"><Input value={v.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} /></Field>
      <Field label="Timezone" hint="Used for dashboards, schedules and daily attendance">
        <Select value={v.timezone} onChange={(e) => set("timezone", e.target.value)}>
          {[...new Set([v.timezone, ...TIMEZONES])].map((t) => <option key={t}>{t}</option>)}
        </Select>
      </Field>
      <Field label="Primary contact"><Input value={v.contactName} onChange={(e) => set("contactName", e.target.value)} required /></Field>
      <Field label="Contact email"><Input type="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} required /></Field>
      <Field label="Contact phone"><Input type="tel" value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} required /></Field>
      <Field label="Default communication channel">
        <Select value={v.preferredChannel} onChange={(e) => set("preferredChannel", e.target.value)}>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="TELEGRAM">Telegram</option>
        </Select>
      </Field>
      <div className="flex flex-col gap-3 sm:col-span-2">
        <FormMessage error={msg.error} success={msg.success} />
        <Button type="submit" disabled={pending} className="w-fit">{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
