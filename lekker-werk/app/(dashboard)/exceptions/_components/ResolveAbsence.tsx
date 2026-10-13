"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api-client";

/** Turns an unexplained absence into a leave day of the chosen type (sick, unpaid, AWOL...). */
export function ResolveAbsence({ recordId, types }: { recordId: string; types: { id: string; name: string }[] }) {
  const router = useRouter();
  const [typeId, setTypeId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!typeId) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/exceptions/absences/${recordId}/resolve`, { body: { leaveTypeId: typeId } });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <select
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          aria-label="Absence reason"
          className="rounded-[10px] border border-border bg-white px-2.5 py-1.5 text-sm"
        >
          <option value="">Choose…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={!typeId || pending}
          className="rounded-[10px] bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          Save
        </button>
      </span>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
