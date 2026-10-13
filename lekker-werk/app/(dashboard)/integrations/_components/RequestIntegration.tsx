"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

/** "My system isn't listed" (or "please build this one first"): creates an integration request. */
export function RequestIntegrationButton({
  defaultEmail,
  systemName = "",
  category = "PAYROLL",
  label = "Request an integration",
  variant = "primary",
}: {
  defaultEmail: string;
  systemName?: string;
  category?: "ERP" | "ACCOUNTING" | "PAYROLL" | "HR";
  label?: string;
  variant?: "primary" | "secondary-light";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ systemName, category, website: "", contactEmail: defaultEmail, dataNeeded: "", notes: "" });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setPending(true);
    setMsg({});
    setErrors({});
    try {
      await api("/api/integrations/requests", { body: form });
      setMsg({ success: "Request sent. We'll review it and come back to you with scope and a quote." });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        setMsg({ error: err.message });
      } else setMsg({ error: "Could not send the request." });
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button size="sm" variant={variant} onClick={() => { setMsg({}); setOpen(true); }}>{label}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Request an integration">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Tell us which system you use. Custom connectors are scoped and quoted per system before any work starts.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="System name" error={errors.systemName}>
              <Input value={form.systemName} onChange={set("systemName")} placeholder="e.g. Sage VIP Payroll" />
            </Field>
            <Field label="Type">
              <Select value={form.category} onChange={set("category")}>
                <option value="PAYROLL">Payroll</option>
                <option value="ACCOUNTING">Accounting</option>
                <option value="ERP">ERP</option>
                <option value="HR">HR</option>
              </Select>
            </Field>
            <Field label="Website (optional)" error={errors.website}>
              <Input value={form.website} onChange={set("website")} placeholder="https://" />
            </Field>
            <Field label="Contact email" error={errors.contactEmail}>
              <Input type="email" value={form.contactEmail} onChange={set("contactEmail")} />
            </Field>
          </div>
          <Field label="What should flow between the systems?" hint="e.g. approved hours per employee into the monthly pay run">
            <Input value={form.dataNeeded} onChange={set("dataNeeded")} />
          </Field>
          <Field label="Anything else (optional)">
            <Textarea rows={3} value={form.notes} onChange={set("notes")} />
          </Field>
          <FormMessage error={msg.error} success={msg.success} />
          {!msg.success && <Button onClick={submit} disabled={pending}>{pending ? "Sending…" : "Send request"}</Button>}
        </div>
      </Modal>
    </>
  );
}
