import Link from "next/link";
import { ArrowRight, Clock, Hourglass, TimerReset, TriangleAlert } from "lucide-react";
import {
  Avatar,
  Badge,
  Card,
  EmptyState,
  FilterBar,
  FilterField,
  Meter,
  PageHeader,
  SectionTitle,
  StatCard,
  filterControl,
} from "@/components/dashboard/ui";
import { sourceLabel } from "@/lib/device-labels";
import { addDays, formatDay, formatMinutes, formatTime, isoWeekday, localDate, localMinutes } from "@/lib/time";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { requirePageContext } from "@/server/auth/guards";
import {
  getDailyTrend,
  getDashboardOverview,
  getHoursByEmployee,
  getLiveBoard,
  getRecentActivity,
} from "@/server/services/dashboard.service";
import { listDepartments } from "@/server/services/employee.service";
import { listLocations } from "@/server/services/location.service";
import { listManagerUsers } from "@/server/services/user.service";
import { HoursChart } from "./_components/HoursChart";

export const metadata = { title: "Dashboard · LekkerWerk" };

const EVENT_LABEL = {
  CLOCK_IN: "clocked in",
  CLOCK_OUT: "clocked out",
  BREAK_START: "started a break",
  BREAK_END: "ended a break",
} as const;

const EVENT_DOT = {
  CLOCK_IN: "bg-dark-green",
  CLOCK_OUT: "bg-slate-500",
  BREAK_START: "bg-amber-500",
  BREAK_END: "bg-dark-green",
} as const;

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => String(r[k] ?? "");

const moreLink = "inline-flex items-center gap-1 text-[13px] font-semibold text-dark-green hover:underline";

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext("dashboard:view");
  const p = await readParams(searchParams);
  // Typed getters: an invalid date or id in the URL behaves like no filter instead of breaking the page.
  const filters = {
    date: p.date("date"),
    locationId: p.uuid("locationId"),
    department: p.get("department"),
    managerId: p.uuid("managerId"),
  };

  const [data, locations, departments, managers] = await Promise.all([
    getDashboardOverview(ctx, filters),
    listLocations(ctx),
    listDepartments(ctx),
    ctx.role === "COMPANY_ADMIN" || ctx.role === "SUPER_ADMIN" ? listManagerUsers(ctx) : Promise.resolve([]),
  ]);
  const t = data.today;
  const w = data.workforce;
  const weekStart = addDays(data.date, -(isoWeekday(data.date) - 1));
  const [live, activity, weekHours, trend] = await Promise.all([
    data.isToday ? getLiveBoard(ctx, filters) : Promise.resolve([] as Row[]),
    getRecentActivity(ctx, filters, 8),
    getHoursByEmployee(ctx, weekStart, data.date, filters, 8),
    getDailyTrend(ctx, addDays(data.date, -13), data.date, filters),
  ]);

  const now = new Date();
  const hour = Math.floor(localMinutes(now, data.timezone) / 60);
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = ctx.name.trim().split(/\s+/)[0] ?? "";
  const todayLocal = localDate(now, data.timezone);
  const filtered = Boolean(filters.locationId || filters.department || filters.managerId);

  // Where everyone is, as one bar. Order keeps look-alike colours apart; every part is also
  // named with its count below, so the bar never relies on colour alone.
  const segments = [
    { label: "Working", value: t.clockedIn, color: "bg-dark-green" },
    { label: data.isToday ? "Finished" : "Worked", value: t.clockedOut, color: "bg-slate-500" },
    { label: "On break", value: t.onBreak, color: "bg-amber-500" },
    { label: "Leave / closed", value: t.excused, color: "bg-blue-500" },
    { label: "Absent", value: t.absent, color: "bg-red-500" },
    { label: "Not in yet", value: t.notInYet, color: "bg-slate-300" },
  ];
  const shown = segments.filter((s) => s.value > 0);
  const onClock = t.clockedIn + t.onBreak;
  const headline = data.isToday ? onClock : t.clockedOut;
  const issues = t.incompleteRecords + t.rejectedAttempts;
  const hoursTone = t.scheduledMinutes && t.workedMinutes > t.scheduledMinutes ? "amber" : "green";
  const maxHeadcount = Math.max(1, ...w.perLocation.map((l) => l.employees));

  return (
    <>
      <PageHeader
        title={data.isToday ? `${greeting}${firstName ? `, ${firstName}` : ""}` : "Dashboard"}
        description={`${formatDay(data.date)}${data.isToday ? "" : " (not today)"} · times shown in ${data.timezone.replace("_", " ")}`}
        actions={
          !data.isToday || filtered ? (
            <Link href="/dashboard" className="rounded-[12px] border border-border bg-white px-3.5 py-2 text-[13px] font-semibold text-ink hover:border-ink/40">
              Back to today, all staff
            </Link>
          ) : undefined
        }
      />

      <FilterBar action="/dashboard">
        <FilterField label="Date">
          <input type="date" name="date" defaultValue={data.date} max={todayLocal} className={filterControl} />
        </FilterField>
        <FilterField label="Location">
          <select name="locationId" defaultValue={filters.locationId ?? ""} className={filterControl}>
            <option value="">All locations</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Department">
          <select name="department" defaultValue={filters.department ?? ""} className={filterControl}>
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </FilterField>
        {managers.length > 0 && (
          <FilterField label="Manager">
            <select name="managerId" defaultValue={filters.managerId ?? ""} className={filterControl}>
              <option value="">All managers</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </FilterField>
        )}
      </FilterBar>

      {/* 1. Where is everyone? */}
      <section className="rounded-[20px] border border-border bg-white p-4 shadow-[0_1px_2px_rgba(7,19,20,0.04)] sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <p className="text-[13px] font-medium text-muted">{data.isToday ? "On the clock right now" : "Worked on this day"}</p>
            <p className="mt-1 font-display text-[40px] font-bold leading-none tracking-tight text-ink sm:text-[48px]">
              {headline}
              <span className="ml-2 text-lg font-semibold text-muted sm:text-xl">of {w.totalEmployees} {w.totalEmployees === 1 ? "person" : "people"}</span>
            </p>
          </div>
          <Link href={`/attendance?from=${data.date}&to=${data.date}`} className={moreLink}>
            Attendance for this day <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        {w.totalEmployees === 0 ? (
          <p className="mt-5 text-sm text-muted">
            No active employees yet. <Link href="/employees/new" className="font-semibold text-dark-green hover:underline">Add your first employee</Link> to start clocking.
          </p>
        ) : (
          <>
            <div className="mt-5 flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-soft-surface" aria-hidden>
              {shown.map((s) => (
                <span key={s.label} className={`h-full min-w-1.5 ${s.color}`} style={{ flexGrow: s.value, flexBasis: 0 }} />
              ))}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
              {segments.map((s) => (
                <li key={s.label} className={`flex items-center gap-2 text-sm ${s.value ? "" : "opacity-50"}`}>
                  <span className={`size-2.5 shrink-0 rounded-full ${s.color}`} aria-hidden />
                  <span className="min-w-0 truncate text-muted">{s.label}</span>
                  <span className="ml-auto font-semibold tabular-nums text-ink">{s.value}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* 2. The four numbers that matter today */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Hours worked"
          value={formatMinutes(t.workedMinutes)}
          icon={<Clock className="size-4" aria-hidden />}
          tone="good"
          hint={`of ${formatMinutes(t.scheduledMinutes)} scheduled`}
        >
          <Meter value={t.workedMinutes} max={t.scheduledMinutes} tone={hoursTone} />
        </StatCard>
        <StatCard
          label="Late arrivals"
          value={t.lateArrivals}
          icon={<TimerReset className="size-4" aria-hidden />}
          tone={t.lateArrivals ? "warn" : "default"}
          hint={t.earlyDepartures ? `${t.earlyDepartures} left early` : "Nobody left early"}
          href={`/attendance?from=${data.date}&to=${data.date}`}
        />
        <StatCard
          label="Overtime"
          value={formatMinutes(t.overtimeMinutes)}
          icon={<Hourglass className="size-4" aria-hidden />}
          tone={t.overtimeMinutes ? "warn" : "default"}
          hint={`${formatMinutes(w.monthOvertimeMinutes)} this month`}
        />
        <StatCard
          label="Needs attention"
          value={issues + t.absent}
          icon={<TriangleAlert className="size-4" aria-hidden />}
          tone={issues + t.absent ? "bad" : "default"}
          hint={`${t.absent} absent · ${t.incompleteRecords} incomplete · ${t.rejectedAttempts} rejected`}
          href="/exceptions"
        />
      </div>

      {/* 3. Trend + who is in */}
      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card title="Hours per day · last 14 days" flush>
          <HoursChart points={trend} selected={data.date} />
        </Card>

        <Card
          title={data.isToday ? `On the clock now · ${live.length}` : "On the clock now"}
          action={<Link href="/attendance" className={moreLink}>Attendance <ArrowRight className="size-3.5" aria-hidden /></Link>}
          flush
        >
          {!data.isToday ? (
            <EmptyState title="Only shown for today" hint="Pick today's date to see who is clocked in." />
          ) : live.length === 0 ? (
            <EmptyState title="Nobody is clocked in right now" hint="People appear here the moment they clock in." />
          ) : (
            <ul className="max-h-[21.5rem] divide-y divide-border/70 overflow-y-auto">
              {live.map((r) => (
                <li key={str(r, "employeeId")} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                  <Avatar name={str(r, "name")} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/employees/${str(r, "employeeId")}`} className="block truncate text-sm font-medium text-ink hover:underline">
                      {str(r, "name")}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      {str(r, "locationName")} · {sourceLabel(str(r, "source"), r.deviceName as string | null)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Badge tone={r.onBreak ? "amber" : "green"}>{r.onBreak ? "On break" : "Working"}</Badge>
                    <p className="mt-1 text-xs tabular-nums text-muted">since {formatTime(r.since as Date, str(r, "timezone"))}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 4. This week + what just happened */}
      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Card
          title={`Hours this week · from ${formatDay(weekStart, { year: false })}`}
          action={<Link href="/reports" className={moreLink}>Reports <ArrowRight className="size-3.5" aria-hidden /></Link>}
          flush
        >
          {weekHours.length === 0 ? (
            <EmptyState title="No hours recorded this week yet" />
          ) : (
            <ul className="divide-y divide-border/70">
              {weekHours.map((r) => {
                const worked = Number(r.worked);
                const scheduled = Number(r.scheduled);
                return (
                  <li key={str(r, "employeeId")} className="px-4 py-3 sm:px-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={str(r, "name")} size="sm" />
                      <div className="min-w-0 flex-1">
                        <Link href={`/employees/${str(r, "employeeId")}?range=week`} className="block truncate text-sm font-medium text-ink hover:underline">
                          {str(r, "name")}
                        </Link>
                        <p className="truncate text-xs text-muted">{str(r, "locationName")}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                        {Number(r.overtime) > 0 && <Badge tone="blue">{formatMinutes(Number(r.overtime))} overtime</Badge>}
                        {Number(r.lateDays) > 0 && <Badge tone="amber">{Number(r.lateDays)} late</Badge>}
                        {Number(r.incomplete) > 0 && <Badge tone="red">{Number(r.incomplete)} incomplete</Badge>}
                      </div>
                      <p className="w-[5.5rem] shrink-0 text-right text-sm tabular-nums">
                        <span className="font-semibold text-ink">{formatMinutes(worked)}</span>
                        <span className="block text-xs text-muted">of {formatMinutes(scheduled)}</span>
                      </p>
                    </div>
                    <Meter value={worked} max={scheduled} tone={scheduled && worked > scheduled ? "amber" : "green"} />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Recent clock activity" flush>
          {activity.length === 0 ? (
            <EmptyState title="No clockings yet" hint="Clock-ins from QR codes, Telegram, WhatsApp and devices appear here." />
          ) : (
            <ul className="divide-y divide-border/70">
              {activity.map((r) => {
                const type = str(r, "eventType") as keyof typeof EVENT_LABEL;
                const sameDay = localDate(new Date(r.occurredAt as Date), str(r, "timezone")) === todayLocal;
                return (
                  <li key={str(r, "id")} className="flex items-start gap-3 px-4 py-3 text-sm sm:px-5">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${EVENT_DOT[type] ?? "bg-slate-300"}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <Link href={`/employees/${str(r, "employeeId")}`} className="font-medium text-ink hover:underline">{str(r, "name")}</Link>{" "}
                      <span className="text-muted">{EVENT_LABEL[type] ?? type.toLowerCase()}</span>
                      <span className="block truncate text-xs text-muted">
                        {str(r, "locationName")} · {sourceLabel(str(r, "source"), r.deviceName as string | null)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-muted">
                      {formatTime(r.occurredAt as Date, str(r, "timezone"))}
                      {!sameDay && <span className="block">{formatDay(localDate(new Date(r.occurredAt as Date), str(r, "timezone")), { weekday: false, year: false })}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* 5. The month so far */}
      <SectionTitle>This month so far</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Active employees" value={w.totalEmployees} href="/employees" />
        <StatCard label="Hours worked" value={formatMinutes(w.monthWorkedMinutes)} hint={`of ${formatMinutes(w.monthScheduledMinutes)} scheduled`}>
          <Meter value={w.monthWorkedMinutes} max={w.monthScheduledMinutes} />
        </StatCard>
        <StatCard label="Overtime" value={formatMinutes(w.monthOvertimeMinutes)} />
        <StatCard
          label="Attendance rate"
          value={w.attendanceRate === null ? "—" : `${w.attendanceRate}%`}
          hint="Days worked ÷ days expected"
        >
          {w.attendanceRate !== null && (
            <Meter value={w.attendanceRate} max={100} tone={w.attendanceRate >= 90 ? "green" : w.attendanceRate >= 75 ? "amber" : "red"} />
          )}
        </StatCard>
      </div>

      <Card
        title="People per location"
        className="mt-6"
        action={<Link href="/locations" className={moreLink}>Locations <ArrowRight className="size-3.5" aria-hidden /></Link>}
        flush
      >
        {w.perLocation.length === 0 ? (
          <EmptyState title="No locations yet" hint="Add a location to start assigning employees and QR codes." />
        ) : (
          <ul className="divide-y divide-border/70">
            {w.perLocation.map((l) => (
              <li key={l.locationId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <p className="w-full min-w-0 truncate text-sm font-medium text-ink sm:w-52">{l.name}</p>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-soft-surface" aria-hidden>
                    <div className="h-full rounded-full bg-dark-green/70" style={{ width: `${(l.employees / maxHeadcount) * 100}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">{l.employees}</span>
                </div>
                <Link href={`/locations/${l.locationId}?date=${data.date}`} className={`${moreLink} shrink-0`}>
                  View day <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
