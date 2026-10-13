"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Field, FormMessage, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Day { day: number; start: string; end: string; breakMinutes?: number }
interface ScheduleValue {
  id: string;
  name: string;
  days: Day[];
  graceMinutes: number;
  overtimeAfterMinutesPerDay: number | null;
  locationId: string | null;
}

export function ScheduleEditorButton({
  schedule,
  locations,
}: {
  schedule?: ScheduleValue;
  locations: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(schedule?.name ?? "");
  const [locationId, setLocationId] = useState(schedule?.locationId ?? "");
  const [grace, setGrace] = useState(String(schedule?.graceMinutes ?? 5));
  const [ot, setOt] = useState(schedule?.overtimeAfterMinutesPerDay ? String(schedule.overtimeAfterMinutesPerDay / 60) : "");
  const [days, setDays] = useState<Record<number, Day | null>>(() => {
    const m: Record<number, Day | null> = {};
    for (let d = 1; d <= 7; d++) {
      m[d] = schedule?.days.find((x) => x.day === d) ?? (!schedule && d <= 5 ? { day: d, start: "08:00", end: "17:00", breakMinutes: 60 } : null);
    }
    return m;
  });

  async function save() {
    setPending(true);
    setError(null);
    try {
      const body = {
        name,
        locationId: schedule ? schedule.locationId : locationId || null,
        graceMinutes: Number(grace),
        overtimeAfterMinutesPerDay: ot ? Math.round(Number(ot) * 60) : null,
        days: Object.values(days).filter((d): d is Day => d !== null),
      };
      await api(schedule ? `/api/schedules/${schedule.id}` : "/api/schedules", { method: schedule ? "PUT" : "POST", body });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the schedule.");
    } finally {
      setPending(false);
    }
  }

  const setDay = (d: number, patch: Partial<Day>) => setDays((p) => ({ ...p, [d]: { ...(p[d] as Day), ...patch } }));

  return (
    <>
      {schedule ? (
        <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-dark-green hover:underline">Edit</button>
      ) : (
        <Button icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>New schedule</Button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={schedule ? "Edit schedule" : "New schedule"} wide>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            {!schedule && (
              <Field label="Applies to">
                <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">Whole company</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </Select>
              </Field>
            )}
            <Field label="Late grace (minutes)"><Input inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} /></Field>
            <Field label="Overtime after (hours/day)" hint="Blank = after scheduled hours">
              <Input inputMode="decimal" value={ot} onChange={(e) => setOt(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-col gap-2">
            {DAY_NAMES.map((label, i) => {
              const d = i + 1;
              const v = days[d];
              return (
                <div key={d} className="grid grid-cols-[110px_1fr_1fr_90px] items-center gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!v}
                      onChange={(e) => setDays((p) => ({ ...p, [d]: e.target.checked ? { day: d, start: "08:00", end: "17:00", breakMinutes: 60 } : null }))}
                      className="size-4 accent-[var(--color-dark-green)]"
                    />
                    {label}
                  </label>
                  {v ? (
                    <>
                      <Input type="time" value={v.start} onChange={(e) => setDay(d, { start: e.target.value })} aria-label={`${label} start`} />
                      <Input type="time" value={v.end} onChange={(e) => setDay(d, { end: e.target.value })} aria-label={`${label} end`} />
                      <Input inputMode="numeric" value={v.breakMinutes ?? 0} onChange={(e) => setDay(d, { breakMinutes: Number(e.target.value) || 0 })} aria-label={`${label} break minutes`} title="Break (min)" />
                    </>
                  ) : (
                    <span className="col-span-3 text-muted">Off</span>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-muted">Columns: start · end · unpaid break (minutes)</p>
          </div>

          <FormMessage error={error} />
          <Button onClick={save} disabled={pending || !name}>{pending ? "Saving…" : "Save schedule"}</Button>
        </div>
      </Modal>
    </>
  );
}

export function AssignScheduleButton({
  employees,
  schedules,
}: {
  employees: { id: string; name: string }[];
  schedules: { id: string; name: string }[];
}) {
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
      await api("/api/schedules/assign", {
        body: { employeeId: f.get("employeeId"), scheduleId: f.get("scheduleId"), effectiveFrom: f.get("effectiveFrom") },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not assign.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="secondary-light" onClick={() => setOpen(true)}>Assign to employee</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Assign schedule">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Employee"><Select name="employeeId" required>{employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
          <Field label="Schedule"><Select name="scheduleId" required>{schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Effective from"><Input type="date" name="effectiveFrom" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>Assign</Button>
        </form>
      </Modal>
    </>
  );
}
