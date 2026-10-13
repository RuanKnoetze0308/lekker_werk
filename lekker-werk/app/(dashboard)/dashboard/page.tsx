import Link from "next/link";
import {
  Badge,
  Card,
  EmptyState,
  FilterBar,
  FilterField,
  PageHeader,
  StatCard,
  Table,
  Td,
  Th,
  filterControl,
} from "@/components/dashboard/ui";
import { sourceLabel } from "@/lib/device-labels";
import { addDays, formatDateTime, formatMinutes, formatTime, isoWeekday } from "@/lib/time";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { requirePageContext } from "@/server/auth/guards";
import {
  getDashboardOverview,
  getHoursByEmployee,
  getLiveBoard,
  getRecentActivity,
} from "@/server/services/dashboard.service";
import { listDepartments } from "@/server/services/employee.service";
import { listLocations } from "@/server/services/location.service";
import { listManagerUsers } from "@/server/services/user.service";

export const metadata = { title: "Dashboard · LekkerWerk" };

const EVENT_LABEL = {
  CLOCK_IN: "clocked in",
  CLOCK_OUT: "clocked out",
  BREAK_START: "started a break",
  BREAK_END: "ended a break",
} as const;

type Row = Record<string, unknown>;
const str = (r: Row, k: string) => String(r[k] ?? "");

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext("dashboard:view");
  const p = await readParams(searchParams);
  const filters = {
    date: p.get("date"),
    locationId: p.get("locationId"),
    department: p.get("department"),
    managerId: p.get("managerId"),
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
  const [live, activity, weekHours] = await Promise.all([
    data.isToday ? getLiveBoard(ctx, filters) : Promise.resolve([] as Row[]),
    getRecentActivity(ctx, filters),
    getHoursByEmployee(ctx, weekStart, data.date, filters),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${data.isToday ? "Today" : data.date} · times shown in ${data.timezone}`}
      />

      <FilterBar action="/dashboard">
        <FilterField label="Date">
          <input type="date" name="date" defaultValue={data.date} className={filterControl} />
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

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Today&rsquo;s overview</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Clocked in" value={t.clockedIn} tone="good" hint={t.onBreak ? `${t.onBreak} on break` : undefined} />
        <StatCard label="Clocked out" value={t.clockedOut} />
        <StatCard label="Hours worked" value={formatMinutes(t.workedMinutes)} hint={`of ${formatMinutes(t.scheduledMinutes)} scheduled`} />
        <StatCard label="Overtime" value={formatMinutes(t.overtimeMinutes)} tone={t.overtimeMinutes ? "warn" : "default"} />
        <StatCard label="Late arrivals" value={t.lateArrivals} tone={t.lateArrivals ? "warn" : "default"} />
        <StatCard label="Early departures" value={t.earlyDepartures} tone={t.earlyDepartures ? "warn" : "default"} />
        <StatCard label="Absent" value={t.absent} tone={t.absent ? "bad" : "default"} />
        <StatCard
          label="Pending issues"
          value={t.incompleteRecords + t.rejectedAttempts}
          tone={t.incompleteRecords + t.rejectedAttempts ? "bad" : "default"}
          hint={`${t.incompleteRecords} incomplete · ${t.rejectedAttempts} rejected (24h)`}
        />
      </div>

      <div className="mt-8 grid grid-cols-1 items-start gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card title={data.isToday ? `On the clock now (${live.length})` : "On the clock now"} flush>
          {!data.isToday ? (
            <EmptyState title="Only shown for today" />
          ) : live.length === 0 ? (
            <EmptyState title="Nobody is clocked in right now" />
          ) : (
            <Table>
              <thead>
                <tr><Th>Employee</Th><Th>Location</Th><Th>Since</Th><Th>Via</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {live.map((r) => (
                  <tr key={str(r, "employeeId")}>
                    <Td>
                      <Link href={`/employees/${str(r, "employeeId")}`} className="font-medium hover:underline">{str(r, "name")}</Link>
                    </Td>
                    <Td>{str(r, "locationName")}</Td>
                    <Td>{formatTime(r.since as Date, str(r, "timezone"))}</Td>
                    <Td className="text-muted">{sourceLabel(str(r, "source"), r.deviceName as string | null)}</Td>
                    <Td><Badge tone={r.onBreak ? "amber" : "green"}>{r.onBreak ? "on break" : "working"}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Recent clock activity" flush>
          {activity.length === 0 ? (
            <EmptyState title="No clockings yet" hint="Clock-ins from QR codes, Telegram, WhatsApp and devices appear here." />
          ) : (
            <ul className="divide-y divide-border/70">
              {activity.map((r) => (
                <li key={str(r, "id")} className="flex items-start justify-between gap-3 px-5 py-3 text-sm">
                  <span>
                    <Link href={`/employees/${str(r, "employeeId")}`} className="font-medium hover:underline">{str(r, "name")}</Link>{" "}
                    {EVENT_LABEL[str(r, "eventType") as keyof typeof EVENT_LABEL]}
                    <span className="block text-xs text-muted">
                      {str(r, "locationName")} · {sourceLabel(str(r, "source"), r.deviceName as string | null)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{formatDateTime(r.occurredAt as Date, str(r, "timezone"))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={`Hours this week (from ${weekStart})`} className="mt-6" flush>
        {weekHours.length === 0 ? (
          <EmptyState title="No hours recorded this week yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th><Th>Location</Th><Th className="text-right">Worked</Th><Th className="text-right">Scheduled</Th>
                <Th className="text-right">Overtime</Th><Th className="text-right">Days</Th><Th className="text-right">Late</Th><Th className="text-right">Incomplete</Th>
              </tr>
            </thead>
            <tbody>
              {weekHours.map((r) => (
                <tr key={str(r, "employeeId")}>
                  <Td><Link href={`/employees/${str(r, "employeeId")}?range=week`} className="font-medium hover:underline">{str(r, "name")}</Link></Td>
                  <Td>{str(r, "locationName")}</Td>
                  <Td className="text-right font-medium">{formatMinutes(Number(r.worked))}</Td>
                  <Td className="text-right text-muted">{formatMinutes(Number(r.scheduled))}</Td>
                  <Td className="text-right">{Number(r.overtime) ? formatMinutes(Number(r.overtime)) : "—"}</Td>
                  <Td className="text-right">{Number(r.days)}</Td>
                  <Td className="text-right">{Number(r.lateDays) || "—"}</Td>
                  <Td className="text-right">{Number(r.incomplete) ? <Badge tone="amber">{Number(r.incomplete)}</Badge> : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted">Workforce summary (month to date)</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total employees" value={w.totalEmployees} />
        <StatCard label="Hours worked" value={formatMinutes(w.monthWorkedMinutes)} hint={`${formatMinutes(w.monthScheduledMinutes)} scheduled`} />
        <StatCard label="Overtime" value={formatMinutes(w.monthOvertimeMinutes)} />
        <StatCard label="Attendance" value={w.attendanceRate === null ? "—" : `${w.attendanceRate}%`} hint="Days worked ÷ days expected" />
      </div>

      <Card title="Employees per location" className="mt-8" flush>
        {w.perLocation.length === 0 ? (
          <p className="p-5 text-sm text-muted">No locations yet.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Location</Th>
                <Th className="text-right">Employees</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {w.perLocation.map((l) => (
                <tr key={l.locationId}>
                  <Td className="font-medium">{l.name}</Td>
                  <Td className="text-right">{l.employees}</Td>
                  <Td className="text-right">
                    <Link href={`/locations/${l.locationId}?date=${data.date}`} className="font-medium text-dark-green hover:underline">
                      View day →
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
