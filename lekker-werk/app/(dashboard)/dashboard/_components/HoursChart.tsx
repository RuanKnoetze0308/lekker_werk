import { formatDay, formatMinutes } from "@/lib/time";
import type { DailyTrendPoint } from "@/server/services/dashboard.service";

const WEEKDAY = ["M", "T", "W", "T", "F", "S", "S"];

/** Round the axis top up to a clean number of hours so the tick labels are readable. */
function niceMaxHours(hours: number) {
  if (hours <= 4) return 4;
  const steps = [8, 10, 20, 40, 50, 80, 100, 200, 400, 500, 800, 1000, 2000, 5000];
  return steps.find((s) => s >= hours) ?? Math.ceil(hours / 1000) * 1000;
}

/**
 * Hours worked per day as columns, with that day's scheduled hours as a tick across the column.
 * Server-rendered: hover and keyboard focus show the exact numbers, and the same numbers are in
 * a screen-reader table, so nothing depends on colour or on JavaScript.
 */
export function HoursChart({ points, selected }: { points: DailyTrendPoint[]; selected: string }) {
  const peak = Math.max(...points.map((p) => Math.max(p.worked, p.scheduled)), 0);
  const maxH = niceMaxHours(peak / 60);
  const max = maxH * 60;
  const pct = (minutes: number) => `${Math.min(100, (minutes / max) * 100)}%`;
  const ticks = [maxH, maxH / 2, 0];

  if (peak === 0) {
    return <p className="px-5 py-12 text-center text-sm text-muted">No hours recorded in this period yet.</p>;
  }

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-dark-green" aria-hidden /> Worked
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full bg-ink" aria-hidden /> Scheduled
        </span>
      </div>

      <div className="flex gap-2" aria-hidden>
        <div className="flex h-44 w-8 shrink-0 flex-col justify-between text-right text-[11px] leading-none text-muted">
          {ticks.map((t) => (
            <span key={t}>{t}h</span>
          ))}
        </div>
        <div className="relative h-44 min-w-0 flex-1">
          {/* gridlines */}
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {ticks.map((t) => (
              <span key={t} className="block h-px w-full bg-border/70" />
            ))}
          </div>
          <div className="absolute inset-0 flex items-end">
            {points.map((p, i) => {
              const isSel = p.date === selected;
              const alignTip = i < 2 ? "left-0" : i > points.length - 3 ? "right-0" : "left-1/2 -translate-x-1/2";
              return (
                <div key={p.date} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none">
                  <div className="absolute inset-x-0 inset-y-0 rounded-[6px] group-hover:bg-soft-surface group-focus-visible:bg-soft-surface" />
                  <div
                    className={`relative w-full max-w-6 rounded-t-[4px] ${isSel ? "bg-dark-green" : "bg-dark-green/55"} group-hover:bg-dark-green`}
                    style={{ height: pct(p.worked), minHeight: p.worked ? 2 : 0 }}
                  />
                  {p.scheduled > 0 && (
                    <span className="absolute inset-x-[12%] h-0.5 rounded-full bg-ink" style={{ bottom: pct(p.scheduled) }} />
                  )}
                  <div
                    className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max rounded-[10px] bg-ink px-3 py-2 text-left text-xs text-white shadow-lg group-hover:block group-focus-visible:block ${alignTip}`}
                  >
                    <p className="font-semibold">{formatDay(p.date, { year: false })}</p>
                    <p className="mt-1 text-white/80">Worked {formatMinutes(p.worked)}</p>
                    <p className="text-white/80">Scheduled {formatMinutes(p.scheduled)}</p>
                    {(p.late > 0 || p.absent > 0) && (
                      <p className="text-white/80">
                        {p.late} late · {p.absent} absent
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex gap-2" aria-hidden>
        <div className="w-8 shrink-0" />
        <div className="flex min-w-0 flex-1">
          {points.map((p) => {
            const d = new Date(`${p.date}T00:00:00Z`);
            const wd = (d.getUTCDay() + 6) % 7;
            const isSel = p.date === selected;
            return (
              <div key={p.date} className={`min-w-0 flex-1 text-center text-[10px] leading-tight ${isSel ? "font-bold text-ink" : "text-muted"}`}>
                <span className="block">{WEEKDAY[wd]}</span>
                <span className="block">{d.getUTCDate()}</span>
              </div>
            );
          })}
        </div>
      </div>

      <table className="sr-only">
        <caption>Hours worked and scheduled per day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Worked</th>
            <th>Scheduled</th>
            <th>Late</th>
            <th>Absent</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.date}>
              <td>{formatDay(p.date)}</td>
              <td>{formatMinutes(p.worked)}</td>
              <td>{formatMinutes(p.scheduled)}</td>
              <td>{p.late}</td>
              <td>{p.absent}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
