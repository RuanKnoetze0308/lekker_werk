"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

/** Manual correction: appends a new event; the original stays in the audit trail. */
export function CorrectionForm({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/api/attendance/corrections", {
        body: {
          employeeId,
          eventType: f.get("eventType"),
          // datetime-local is interpreted in the browser's timezone, then sent as an ISO instant
          occurredAt: new Date(String(f.get("occurredAt"))).toISOString(),
          note: f.get("note"),
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the correction.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary-light" size="sm" onClick={() => setOpen(true)}>Add correction</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Manual correction">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Event">
            <Select name="eventType" defaultValue="CLOCK_OUT">
              <option value="CLOCK_IN">Clock in</option>
              <option value="CLOCK_OUT">Clock out</option>
              <option value="BREAK_START">Break start</option>
              <option value="BREAK_END">Break end</option>
            </Select>
          </Field>
          <Field label="Date & time (your local time)">
            <Input name="occurredAt" type="datetime-local" required />
          </Field>
          <Field label="Reason" hint="Recorded in the audit log">
            <Input name="note" required minLength={3} maxLength={500} />
          </Field>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save correction"}</Button>
        </form>
      </Modal>
    </>
  );
}
