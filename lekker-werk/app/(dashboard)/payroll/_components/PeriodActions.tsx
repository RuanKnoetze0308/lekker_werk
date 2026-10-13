"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock, Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

export function PeriodActions({
  id,
  status,
  openItems,
  canReopen,
}: {
  id: string;
  status: "OPEN" | "LOCKED" | "EXPORTED";
  openItems: number;
  canReopen: boolean;
}) {
  const router = useRouter();
  const [lockOpen, setLockOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lock() {
    setPending(true);
    setError(null);
    try {
      await api(`/api/payroll/periods/${id}/lock`, { body: { note: note || null, force: openItems > 0 } });
      setLockOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not lock the period.");
    } finally {
      setPending(false);
    }
  }

  async function reopen() {
    const why = prompt("Why are you reopening this period? (kept in the audit log)");
    if (!why) return;
    try {
      await api(`/api/payroll/periods/${id}/reopen`, { body: { note: why } });
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not reopen.");
    }
  }

  if (status === "OPEN") {
    return (
      <>
        <Button icon={<Lock className="size-4" />} onClick={() => setLockOpen(true)}>Lock period</Button>
        <Modal open={lockOpen} onClose={() => setLockOpen(false)} title="Lock this pay period?">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted">
              Hours are recalculated one last time and frozen. Clock-ins, corrections and leave for these days are blocked
              until an admin reopens the period.
            </p>
            {openItems > 0 && (
              <p className="rounded-[12px] bg-amber-50 px-3 py-2 text-sm text-amber-800">
                There {openItems === 1 ? "is 1 open item" : `are ${openItems} open items`} (absences, missing clock-outs or leave).
                They will be exported as they are. Add a note to explain.
              </p>
            )}
            <Field label={openItems > 0 ? "Note (required)" : "Note (optional)"}>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <FormMessage error={error} />
            <Button onClick={lock} disabled={pending || (openItems > 0 && !note.trim())}>{pending ? "Locking…" : "Lock period"}</Button>
          </div>
        </Modal>
      </>
    );
  }
  return (
    <>
      <Button href={`/api/payroll/periods/${id}/export?format=lines`} icon={<Download className="size-4" />}>Export CSV</Button>
      <Button href={`/api/payroll/periods/${id}/export?format=wide`} variant="secondary-light">Spreadsheet CSV</Button>
      {canReopen && <Button variant="secondary-light" icon={<Unlock className="size-4" />} onClick={reopen}>Reopen</Button>}
    </>
  );
}
