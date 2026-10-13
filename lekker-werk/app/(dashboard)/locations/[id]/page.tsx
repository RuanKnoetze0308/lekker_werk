import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, statusTone } from "@/components/dashboard/ui";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { formatMinutes, formatTime, localDate } from "@/lib/time";
import { can } from "@/server/auth/permissions";
import { requirePageContext } from "@/server/auth/guards";
import { getLocationDay } from "@/server/services/dashboard.service";
import { getLocation, listLocationManagers } from "@/server/services/location.service";
import { listManagerUsers } from "@/server/services/user.service";
import { listQrCodes } from "@/server/services/qr.service";
import { LocationSettingsForm, ManagersForm } from "../_components/LocationForms";
import { ClosuresPanel } from "../_components/ClosuresPanel";
import { listClosures } from "@/server/time/closures.service";

export default async function LocationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const ctx = await requirePageContext("locations:read");
  const { id } = await params;
  const p = await readParams(searchParams);
  const loc = await getLocation(ctx, id);
  const date = p.get("date") ?? localDate(new Date(), loc.timezone);

  const canDash = can(ctx.role, "dashboard:view");
  const [roster, assigned, managers, qrs, closures] = await Promise.all([
    canDash ? getLocationDay(ctx, id, date) : [],
    listLocationManagers(ctx, id),
    can(ctx.role, "users:manage") ? listManagerUsers(ctx) : Promise.resolve([]),
    can(ctx.role, "qr:manage") ? listQrCodes(ctx, id) : Promise.resolve([]),
    listClosures(ctx, id),
  ]);

  return (
    <>
      <PageHeader title={loc.name} description={loc.address ?? undefined} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Settings" className="lg:col-span-2">
          <LocationSettingsForm
            canEdit={can(ctx.role, "locations:write")}
            loc={{
              id: loc.id,
              name: loc.name,
              address: loc.address ?? "",
              latitude: loc.latitude,
              longitude: loc.longitude,
              timezone: loc.timezone,
              gpsValidationEnabled: loc.gpsValidationEnabled,
              allowedRadiusMeters: loc.allowedRadiusMeters,
              status: loc.status,
            }}
          />
        </Card>

        <div className="flex flex-col gap-6">
          <Card title="Managers">
            {can(ctx.role, "users:manage") ? (
              <ManagersForm locationId={id} managers={managers} selected={assigned.map((a) => a.userId)} />
            ) : assigned.length ? (
              <ul className="text-sm">{assigned.map((a) => <li key={a.userId}>{a.name}</li>)}</ul>
            ) : (
              <p className="text-sm text-muted">No managers assigned.</p>
            )}
          </Card>
          <Card title="Site closures">
            <ClosuresPanel locationId={id} closures={closures} canManage={can(ctx.role, "attendance:correct")} />
          </Card>
          {can(ctx.role, "qr:manage") && (
            <Card title="QR codes" action={<Link href="/qr-codes" className="text-xs font-medium text-dark-green">Manage</Link>}>
              {qrs.length === 0 ? (
                <p className="text-sm text-muted">No QR codes for this location yet.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {qrs.map((q) => (
                    <li key={q.id} className="flex items-center justify-between">
                      {q.label} <Badge tone={q.enabled ? "green" : "red"}>{q.enabled ? "active" : "disabled"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      {canDash && (
        <Card title={`Roster · ${date}`} className="mt-6" flush>
          {roster.length === 0 ? (
            <EmptyState title="No active employees at this location" />
          ) : (
            <Table>
              <thead>
                <tr><Th>Employee</Th><Th>In</Th><Th>Out</Th><Th>Worked</Th><Th>Overtime</Th><Th>Status</Th></tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={String(r.employeeId)}>
                    <Td>
                      <Link href={`/employees/${r.employeeId}`} className="font-medium hover:text-dark-green">{String(r.name)}</Link>
                    </Td>
                    <Td>{formatTime(r.firstClockIn as Date | null, loc.timezone)}</Td>
                    <Td>{formatTime(r.lastClockOut as Date | null, loc.timezone)}</Td>
                    <Td>{formatMinutes(Number(r.worked))}</Td>
                    <Td>{Number(r.overtime) ? formatMinutes(Number(r.overtime)) : "—"}</Td>
                    <Td>
                      {r.status ? <Badge tone={statusTone(String(r.status))}>{String(r.status).toLowerCase()}</Badge> : <span className="text-muted">no clocking</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      )}
    </>
  );
}
