"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select, Toggle } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

type Option = { id: string; name: string };

function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await fn();
      onDone();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fieldErrors)[0] ?? err.message) : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }
  return { pending, error, run };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Manager records leave for an employee (e.g. phoned in, paper form), approved straight away by default. */
export function RecordLeaveButton({ employees, types, employeeId }: { employees: Option[]; types: Option[]; employeeId?: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    employeeId: employeeId ?? employees[0]?.id ?? "",
    leaveTypeId: types[0]?.id ?? "",
    startDate: today(),
    endDate: today(),
    half: false,
    reason: "",
    approve: true,
  });
  const { pending, error, run } = useSubmit(() => setOpen(false));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <>
      <Button icon={<Plus className="size-4" />} size={employeeId ? "sm" : "md"} variant={employeeId ? "secondary-light" : "primary"} onClick={() => setOpen(true)}>
        Record leave
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Record leave">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {!employeeId && (
              <Field label="Employee">
                <Select value={f.employeeId} onChange={(e) => set("employeeId", e.target.value)}>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Type">
              <Select value={f.leaveTypeId} onChange={(e) => set("leaveTypeId", e.target.value)}>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="From"><Input type="date" value={f.startDate} onChange={(e) => { set("startDate", e.target.value); if (e.target.value > f.endDate) set("endDate", e.target.value); }} /></Field>
            <Field label="To"><Input type="date" value={f.endDate} min={f.startDate} onChange={(e) => set("endDate", e.target.value)} /></Field>
          </div>
          <Field label="Reason (optional)"><Input value={f.reason} onChange={(e) => set("reason", e.target.value)} /></Field>
          <div className="flex items-center justify-between rounded-[14px] border border-border p-3 text-sm">
            <span>Half days</span>
            <Toggle checked={f.half} onChange={(v) => set("half", v)} label="Half days" />
          </div>
          <div className="flex items-center justify-between rounded-[14px] border border-border p-3 text-sm">
            <span>Approve now</span>
            <Toggle checked={f.approve} onChange={(v) => set("approve", v)} label="Approve now" />
          </div>
          <p className="text-xs text-muted">Only scheduled working days count. Weekends, days off and public holidays are skipped.</p>
          <FormMessage error={error} />
          <Button
            disabled={pending}
            onClick={() =>
              run(() =>
                api("/api/leave/requests", {
                  body: {
                    employeeId: f.employeeId,
                    leaveTypeId: f.leaveTypeId,
                    startDate: f.startDate,
                    endDate: f.endDate,
                    dayFraction: f.half ? 0.5 : 1,
                    reason: f.reason || null,
                    approve: f.approve,
                  },
                }),
              )
            }
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </Modal>
    </>
  );
}

export function LeaveRequestActions({ id, status }: { id: string; status: string }) {
  const { pending, error, run } = useSubmit(() => {});
  const link = "text-xs font-semibold hover:underline disabled:opacity-50";
  if (status !== "REQUESTED" && status !== "APPROVED") return null;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="flex gap-3">
        {status === "REQUESTED" && (
          <>
            <button type="button" className={`${link} text-dark-green`} disabled={pending} onClick={() => run(() => api(`/api/leave/requests/${id}/decision`, { body: { approve: true } }))}>
              Approve
            </button>
            <button
              type="button"
              className={`${link} text-red-600`}
              disabled={pending}
              onClick={() => {
                const note = prompt("Reason for declining (shared with the employee's manager record):");
                if (note !== null) run(() => api(`/api/leave/requests/${id}/decision`, { body: { approve: false, note } }));
              }}
            >
              Decline
            </button>
          </>
        )}
        {status === "APPROVED" && (
          <button
            type="button"
            className={`${link} text-muted`}
            disabled={pending}
            onClick={() => confirm("Cancel this leave? The days go back to the balance.") && run(() => api(`/api/leave/requests/${id}/cancel`, { body: {} }))}
          >
            Cancel leave
          </button>
        )}
      </span>
      {error && <span className="max-w-xs text-right text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function AdjustBalanceButton({ employees, types }: { employees: Option[]; types: Option[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ employeeId: employees[0]?.id ?? "", leaveTypeId: types[0]?.id ?? "", days: "", kind: "OPENING", note: "" });
  const { pending, error, run } = useSubmit(() => setOpen(false));
  return (
    <>
      <Button size="sm" variant="secondary-light" onClick={() => setOpen(true)}>Adjust</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Adjust a leave balance">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Employee">
              <Select value={f.employeeId} onChange={(e) => setF((p) => ({ ...p, employeeId: e.target.value }))}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            <Field label="Type">
              <Select value={f.leaveTypeId} onChange={(e) => setF((p) => ({ ...p, leaveTypeId: e.target.value }))}>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Kind">
              <Select value={f.kind} onChange={(e) => setF((p) => ({ ...p, kind: e.target.value }))}>
                <option value="OPENING">Opening balance (from old system)</option>
                <option value="ADJUSTMENT">Correction</option>
              </Select>
            </Field>
            <Field label="Days (negative to reduce)"><Input inputMode="decimal" value={f.days} onChange={(e) => setF((p) => ({ ...p, days: e.target.value }))} /></Field>
          </div>
          <Field label="Note"><Input value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} placeholder="e.g. Balance from Sage on 30 Sep" /></Field>
          <FormMessage error={error} />
          <Button disabled={pending} onClick={() => run(() => api("/api/leave/adjustments", { body: { ...f, days: Number(f.days) } }))}>Save</Button>
        </div>
      </Modal>
    </>
  );
}

interface LeaveTypeValue {
  id?: string;
  code: string;
  name: string;
  paid: boolean;
  accrual: "NONE" | "MONTHLY" | "CYCLE_UPFRONT";
  entitlementDays: number;
  cycleMonths: number;
  documentAfterDays: number | null;
  employeeRequestable: boolean;
  active: boolean;
}

export function LeaveTypeButton({ type }: { type?: LeaveTypeValue }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<LeaveTypeValue>(
    type ?? { code: "", name: "", paid: true, accrual: "NONE", entitlementDays: 0, cycleMonths: 12, documentAfterDays: null, employeeRequestable: true, active: true },
  );
  const { pending, error, run } = useSubmit(() => setOpen(false));
  const set = <K extends keyof LeaveTypeValue>(k: K, v: LeaveTypeValue[K]) => setF((p) => ({ ...p, [k]: v }));
  const { id, ...body } = f;
  return (
    <>
      {type ? (
        <button type="button" className="text-xs font-semibold text-dark-green hover:underline" onClick={() => setOpen(true)}>Edit</button>
      ) : (
        <Button size="sm" variant="secondary-light" onClick={() => setOpen(true)}>Add type</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={type ? `Edit ${type.name}` : "Add a leave type"}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Study leave" /></Field>
            <Field label="Code" hint="Used in payroll exports"><Input value={f.code} disabled={!!type} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="STUDY" /></Field>
            <Field label="Balance">
              <Select value={f.accrual} onChange={(e) => set("accrual", e.target.value as LeaveTypeValue["accrual"])}>
                <option value="NONE">No balance (just record it)</option>
                <option value="MONTHLY">Builds up monthly</option>
                <option value="CYCLE_UPFRONT">Granted at the start of each cycle</option>
              </Select>
            </Field>
            {f.accrual !== "NONE" && (
              <>
                <Field label="Days per cycle"><Input inputMode="decimal" value={f.entitlementDays} onChange={(e) => set("entitlementDays", Number(e.target.value) || 0)} /></Field>
                <Field label="Cycle length (months)"><Input inputMode="numeric" value={f.cycleMonths} onChange={(e) => set("cycleMonths", Number(e.target.value) || 12)} /></Field>
              </>
            )}
            <Field label="Document needed after (days)" hint="Blank = never">
              <Input inputMode="numeric" value={f.documentAfterDays ?? ""} onChange={(e) => set("documentAfterDays", e.target.value === "" ? null : Number(e.target.value))} />
            </Field>
          </div>
          {(
            [
              ["paid", "Paid leave"],
              ["employeeRequestable", "Employees can request it themselves"],
              ["active", "Active"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between rounded-[14px] border border-border p-3 text-sm">
              <span>{label}</span>
              <Toggle checked={f[k]} onChange={(v) => set(k, v)} label={label} />
            </div>
          ))}
          <FormMessage error={error} />
          <Button disabled={pending} onClick={() => run(() => api(id ? `/api/leave/types/${id}` : "/api/leave/types", { method: id ? "PUT" : "POST", body }))}>
            Save
          </Button>
        </div>
      </Modal>
    </>
  );
}
