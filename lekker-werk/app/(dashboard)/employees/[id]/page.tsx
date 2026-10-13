import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, StatCard, Table, Td, Th, statusTone } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/Button";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { addDays, formatDateTime, formatMinutes, formatTime, isoWeekday, localDate } from "@/lib/time";
import { can } from "@/server/auth/permissions";
import { requirePageContext } from "@/server/auth/guards";
import { employeeHours, listClockEvents } from "@/server/services/attendance.service";
import { getEmployee } from "@/server/services/employee.service";
import { getCompany } from "@/server/services/company.service";
import { listCredentials } from "@/server/devices/credential.service";
import { sourceLabel } from "@/lib/device-labels";
import { EmployeeActions } from "../_components/EmployeeActions";
import { LinkAccountPanel } from "../_components/LinkAccountPanel";
import { CredentialsPanel } from "../_components/CredentialsPanel";
import { TermsPanel } from "../_components/TermsPanel";
import { RecordLeaveButton } from "../../leave/_components/LeaveForms";
import { getEffectiveTerms } from "@/server/time/terms.service";
import { leaveBalances, listLeaveRequests, listLeaveTypes } from "@/server/time/leave.service";
import { currentScheduleName } from "@/server/services/schedule.service";
import { CorrectionForm } from "../_components/CorrectionForm";

const EVENT_LABEL = {
  CLOCK_IN: "Clock in",
  CLOCK_OUT: "Clock out",
  BREAK_START: "Break start",
  BREAK_END: "Break end",
} as const;

export default async function EmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const ctx = await requirePageContext("employees:read");
  const { id } = await params;
  const p = await readParams(searchParams);
  const range = (p.get("range") as "day" | "week" | "month" | undefined) ?? "month";

  const { employee: e, locationName, locationTimezone: tz, managerName, extraLocations, accounts } = await getEmployee(ctx, id);
  const company = await getCompany(ctx);

  const today = localDate(new Date(), tz);
  const from = range === "day" ? today : range === "week" ? addDays(today, -(isoWeekday(today) - 1)) : `${today.slice(0, 8)}01`;
  const canReadAttendance = can(ctx.role, "attendance:read");
  const [hours, events, credentials, terms, scheduleName, balances, leave, leaveTypes] = await Promise.all([
    canReadAttendance ? employeeHours(ctx, id, from, today) : null,
    canReadAttendance ? listClockEvents(ctx, { employeeId: id, limit: 30 }) : [],
    listCredentials(ctx, id),
    getEffectiveTerms(ctx.companyId, id, today),
    currentScheduleName(ctx, id, today),
    canReadAttendance ? leaveBalances(ctx, id) : [],
    canReadAttendance ? listLeaveRequests(ctx, { employeeId: id, limit: 8 }) : [],
    listLeaveTypes(ctx),
  ]);
  const canApproveLeave = can(ctx.role, "leave:approve");
  const canWrite = can(ctx.role, "employees:write");
  const canCorrect = can(ctx.role, "attendance:correct");

  const detail = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value || "—"}</dd>
    </div>
  );

  return (
    <>
      <PageHeader
        title={`${e.firstName} ${e.lastName}`}
        description={`#${e.employeeNumber} · ${locationName}`}
        actions={
          canWrite && (
            <>
              <Button href={`/employees/${id}/edit`} variant="secondary-light" icon={<Pencil className="size-4" />}>Edit</Button>
              <EmployeeActions employeeId={id} active={e.status === "ACTIVE"} />
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Profile" className="lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-3">
            {detail("Status", <Badge tone={statusTone(e.status)}>{e.status === "ACTIVE" ? "Active" : "Inactive"}</Badge>)}
            {detail("Department", e.department)}
            {detail("Position", e.position)}
            {detail("Manager", managerName)}
            {detail("Email", e.email)}
            {detail("Phone", e.phone)}
            {detail("Primary location", locationName)}
            {detail("Other locations", extraLocations.filter((l) => l.locationId !== e.locationId).map((l) => l.name).join(", "))}
            {detail("Platform", e.preferredChannel ? `${e.preferredChannel.toLowerCase()} ${e.platformIdentifier ?? ""}` : e.platformIdentifier)}
            {detail("Hired", e.hiredOn)}
            {detail("Deactivated", e.deactivatedOn)}
          </dl>
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Chat accounts">
            <LinkAccountPanel
              employeeId={id}
              canManage={canWrite && e.status === "ACTIVE"}
              defaultChannel={e.preferredChannel ?? company.preferredChannel}
              accounts={accounts.map((a) => ({
                id: a.id,
                channel: a.channel,
                displayName: a.displayName,
                verified: Boolean(a.verifiedAt),
                revoked: Boolean(a.revokedAt),
              }))}
            />
          </Card>
          <Card title="Cards, tags & PINs">
            <CredentialsPanel
              employeeId={id}
              canManage={canWrite && e.status === "ACTIVE"}
              credentials={credentials.map((c) => ({
                id: c.id,
                kind: c.kind,
                valueHint: c.valueHint,
                label: c.label,
                lastUsed: c.lastUsedAt ? formatDateTime(c.lastUsedAt, tz) : null,
                revoked: Boolean(c.revokedAt),
              }))}
            />
          </Card>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Working hours">
          <TermsPanel employeeId={id} terms={terms} scheduleName={scheduleName} canManage={canWrite} />
        </Card>
        <Card
          title="Leave"
          action={canApproveLeave && e.status === "ACTIVE" && (
            <RecordLeaveButton employeeId={id} employees={[]} types={leaveTypes.map((t) => ({ id: t.id, name: t.name }))} />
          )}
        >
          {balances.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {balances.map((b) => (
                <span key={b.leaveTypeId} className="rounded-[10px] bg-soft-surface px-3 py-1.5 text-sm">
                  {b.name}: <b className={b.balance < 0 ? "text-red-600" : "text-ink"}>{Math.round(b.balance * 100) / 100}</b> days
                </span>
              ))}
            </div>
          )}
          {leave.length === 0 ? (
            <p className="text-sm text-muted">No leave recorded.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {leave.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span>
                    {l.typeName} · {l.startDate === l.endDate ? l.startDate : `${l.startDate} → ${l.endDate}`}
                    <span className="text-muted"> ({Number(l.days)} d)</span>
                  </span>
                  <Badge tone={l.status === "APPROVED" ? "green" : l.status === "REQUESTED" ? "amber" : "gray"}>{l.status.toLowerCase()}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {hours && (
        <>
          <div className="mb-3 mt-8 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Hours</h2>
            <div className="flex gap-1 rounded-[12px] border border-border bg-white p-1 text-sm">
              {(["day", "week", "month"] as const).map((r) => (
                <Link
                  key={r}
                  href={`/employees/${id}?range=${r}`}
                  className={`rounded-[9px] px-3 py-1 font-medium capitalize ${range === r ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
                >
                  {r === "day" ? "Today" : `This ${r}`}
                </Link>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Hours worked" value={formatMinutes(hours.totals.worked ?? 0)} hint={`${formatMinutes(hours.totals.scheduled ?? 0)} scheduled`} />
            <StatCard label="Overtime" value={formatMinutes(hours.totals.overtime ?? 0)} />
            <StatCard label="Days worked" value={hours.totals.days} />
            <StatCard label="Late days" value={hours.totals.late ?? 0} tone={hours.totals.late ? "warn" : "default"} />
          </div>

          <Card title="Attendance" className="mt-6" flush>
            {hours.days.length === 0 ? (
              <EmptyState title="No attendance in this period" />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th><Th>In</Th><Th>Out</Th><Th>Worked</Th><Th>Break</Th><Th>Overtime</Th><Th>Late</Th><Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {hours.days.map((d) => (
                    <tr key={d.id}>
                      <Td>{d.workDate}</Td>
                      <Td>{formatTime(d.firstClockIn, tz)}</Td>
                      <Td>{formatTime(d.lastClockOut, tz)}</Td>
                      <Td>{formatMinutes(d.workedMinutes)}</Td>
                      <Td>{formatMinutes(d.breakMinutes)}</Td>
                      <Td>{d.overtimeMinutes ? formatMinutes(d.overtimeMinutes) : "—"}</Td>
                      <Td>{d.lateMinutes ? `${d.lateMinutes}m` : "—"}</Td>
                      <Td><Badge tone={statusTone(d.status)}>{d.status.toLowerCase()}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card
            title="Clock-in / clock-out history"
            className="mt-6"
            flush
            action={canCorrect && <CorrectionForm employeeId={id} />}
          >
            {events.length === 0 ? (
              <EmptyState title="No clock events yet" />
            ) : (
              <Table>
                <thead>
                  <tr><Th>When</Th><Th>Event</Th><Th>Location</Th><Th>Source</Th><Th>Note</Th></tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <Td>{formatDateTime(ev.occurredAt, tz)}</Td>
                      <Td>{EVENT_LABEL[ev.eventType]}</Td>
                      <Td>{ev.locationName}</Td>
                      <Td className="text-muted">{sourceLabel(ev.source, ev.deviceName)}</Td>
                      <Td className="text-muted">{ev.note ?? (ev.distanceMeters != null ? `${Math.round(ev.distanceMeters)} m from site` : "")}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </>
  );
}
