import Link from "next/link";
import {
  Card,
  EmptyState,
  FilterBar,
  FilterField,
  PageHeader,
  Table,
  Td,
  Th,
  filterControl,
} from "@/components/dashboard/ui";
import { periodContaining } from "@/lib/pay-periods";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { formatMinutes, formatTime, localDate } from "@/lib/time";
import { can } from "@/server/auth/permissions";
import { requirePageContext } from "@/server/auth/guards";
import { getCompany, getSettings } from "@/server/services/company.service";
import { listExceptions } from "@/server/time/exceptions.service";
import { listLeaveTypes } from "@/server/time/leave.service";
import { ResolveAbsence } from "./_components/ResolveAbsence";

export const metadata = { title: "Exceptions · LekkerWerk" };

/**
 * The manager's to-do list before payroll: who didn't show up without leave, who forgot to clock
 * out, and leave waiting for a decision. Defaults to the current pay period.
 */
export default async function ExceptionsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext("attendance:read");
  const p = await readParams(searchParams);
  const [company, settings] = await Promise.all([getCompany(ctx), getSettings(ctx.companyId)]);
  const period = periodContaining(localDate(new Date(), company.timezone), settings.payroll);
  const from = p.get("from") ?? period.start;
  const to = p.get("to") ?? period.end;

  const [ex, types] = await Promise.all([listExceptions(ctx, from, to), listLeaveTypes(ctx)]);
  const canResolve = can(ctx.role, "leave:approve");
  const total = ex.absences.length + ex.incomplete.length + ex.pendingLeaveCount;

  return (
    <>
      <PageHeader
        title="Exceptions"
        description={
          total
            ? `${total} item${total === 1 ? "" : "s"} to sort out before hours are final.`
            : "Nothing to sort out: hours for this range are ready for payroll."
        }
      />
      <FilterBar action="/exceptions">
        <FilterField label="From">
          <input type="date" name="from" defaultValue={from} className={filterControl} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={to} className={filterControl} />
        </FilterField>
      </FilterBar>

      {ex.pendingLeaveCount > 0 && (
        <Card className="mb-6">
          <p className="text-sm">
            <b>{ex.pendingLeaveCount}</b> leave request{ex.pendingLeaveCount === 1 ? " is" : "s are"} waiting for a
            decision.{" "}
            <Link href="/leave" className="font-semibold text-dark-green hover:underline">
              Review leave →
            </Link>
          </p>
        </Card>
      )}

      <Card title={`Absent without explanation (${ex.absences.length})`} flush>
        {ex.absences.length === 0 ? (
          <EmptyState title="No unexplained absences" />
        ) : (
          <>
            {/* Phones: one stacked row per absence so the action is reachable without sideways scrolling. */}
            <ul className="divide-y divide-border/70 sm:hidden">
              {ex.absences.map((a) => (
                <li key={a.id} className="flex flex-col gap-2 px-5 py-4 text-sm">
                  <span>
                    <Link href={`/employees/${a.employeeId}`} className="font-medium hover:underline">
                      {a.employeeName}
                    </Link>
                    <span className="block text-xs text-muted">
                      {a.workDate} · {a.locationName} · {formatMinutes(a.scheduledMinutes)} scheduled
                    </span>
                  </span>
                  {canResolve && (
                    <ResolveAbsence recordId={a.id} types={types.map((t) => ({ id: t.id, name: t.name }))} />
                  )}
                </li>
              ))}
            </ul>
            <div className="hidden sm:block">
              <Table>
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Employee</Th>
                    <Th>Location</Th>
                    <Th>Scheduled</Th>
                    <Th className="text-right">What was it?</Th>
                  </tr>
                </thead>
                <tbody>
                  {ex.absences.map((a) => (
                    <tr key={a.id}>
                      <Td>{a.workDate}</Td>
                      <Td>
                        <Link href={`/employees/${a.employeeId}`} className="font-medium hover:underline">
                          {a.employeeName}
                        </Link>
                      </Td>
                      <Td>{a.locationName}</Td>
                      <Td>{formatMinutes(a.scheduledMinutes)}</Td>
                      <Td className="text-right">
                        {canResolve ? (
                          <ResolveAbsence recordId={a.id} types={types.map((t) => ({ id: t.id, name: t.name }))} />
                        ) : (
                          "—"
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <Card title={`Forgot to clock out (${ex.incomplete.length})`} className="mt-6" flush>
        {ex.incomplete.length === 0 ? (
          <EmptyState title="No open shifts" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Employee</Th>
                <Th>Location</Th>
                <Th>Clocked in</Th>
                <Th className="text-right" />
              </tr>
            </thead>
            <tbody>
              {ex.incomplete.map((r) => (
                <tr key={r.id}>
                  <Td>{r.workDate}</Td>
                  <Td>{r.employeeName}</Td>
                  <Td>{r.locationName}</Td>
                  <Td>{formatTime(r.firstClockIn, r.timezone)}</Td>
                  <Td className="text-right">
                    <Link
                      href={`/employees/${r.employeeId}?range=month`}
                      className="text-xs font-semibold text-dark-green hover:underline"
                    >
                      Add the clock-out →
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
