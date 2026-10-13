import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, StatCard, Table, Td, Th } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/time";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { requirePageContext } from "@/server/auth/guards";
import { can } from "@/server/auth/permissions";
import { getCompany } from "@/server/services/company.service";
import { getPayPeriodReport } from "@/server/time/payroll.service";
import { PeriodActions } from "../_components/PeriodActions";

export const metadata = { title: "Pay period · LekkerWerk" };

const LABEL: Record<string, string> = {
  NORMAL: "Normal",
  OVERTIME: "Overtime",
  SUNDAY: "Sunday",
  PUBLIC_HOLIDAY_WORKED: "Holiday worked",
  PUBLIC_HOLIDAY: "Holiday (paid)",
  CLOSURE_PAID: "Closure (paid)",
  CLOSURE_UNPAID: "Closure (unpaid)",
  ABSENT: "Absent",
};
const label = (code: string) => LABEL[code] ?? code.replace(/^LEAVE_/, "").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) + " leave";
const h = (m: number) => (m / 60).toFixed(2);

export default async function PayPeriodPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const ctx = await requirePageContext("payroll:manage");
  const { id } = await params;
  const refresh = (await readParams(searchParams)).get("refresh") === "1";
  const [report, company] = await Promise.all([getPayPeriodReport(ctx, id, { refresh }), getCompany(ctx)]);
  const { period, totals, codes, exceptions } = report;
  const open = period.status === "OPEN";
  const openItems = exceptions.absences + exceptions.incomplete + exceptions.pendingLeave;
  const sum = (code: string) => totals.reduce((n, t) => n + (t.lines[code]?.minutes ?? 0), 0);

  return (
    <>
      <PageHeader
        title={`Pay period ${period.startDate} → ${period.endDate}`}
        description={
          open
            ? "Live totals from attendance. Lock the period when everything is right; after that these days can't change."
            : `Locked ${period.lockedAt ? formatDateTime(period.lockedAt, company.timezone) : ""}. Totals are frozen.${period.lockNote ? ` Note: ${period.lockNote}` : ""}`
        }
        actions={<PeriodActions id={period.id} status={period.status} openItems={openItems} canReopen={can(ctx.role, "settings:manage")} />}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Status" value={<Badge tone={open ? "blue" : period.status === "LOCKED" ? "amber" : "green"}>{period.status.toLowerCase()}</Badge>} />
        <StatCard label="Employees" value={totals.length} />
        <StatCard label="Normal + overtime" value={`${h(sum("NORMAL") + sum("OVERTIME"))} h`} hint={`${h(sum("OVERTIME"))} h overtime`} />
        <StatCard
          label="Open items"
          value={openItems}
          tone={openItems ? "bad" : "good"}
          hint={`${exceptions.absences} absent · ${exceptions.incomplete} missing clock-out · ${exceptions.pendingLeave} leave`}
        />
      </div>

      {openItems > 0 && open && (
        <Card className="mb-6">
          <p className="text-sm">
            Sort these out first so payroll is right:{" "}
            <Link href={`/exceptions?from=${period.startDate}&to=${period.endDate}`} className="font-semibold text-dark-green hover:underline">
              Open exceptions for this period →
            </Link>
          </p>
        </Card>
      )}

      <Card title="Hours per employee (decimal hours)" flush action={open && <Link href={`/payroll/${period.id}?refresh=1`} className="text-xs font-semibold text-dark-green hover:underline">Recalculate</Link>}>
        {totals.length === 0 ? (
          <EmptyState title="No hours in this period" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Employee</Th>
                {codes.map((c) => <Th key={c} className="text-right">{label(c)}</Th>)}
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.employeeId}>
                  <Td>
                    <Link href={`/employees/${t.employeeId}`} className="font-medium hover:underline">{t.name}</Link>
                    <span className="block text-xs text-muted">#{t.employeeNumber} · {t.locationName}{t.payType === "SALARIED" ? " · salaried" : ""}</span>
                  </Td>
                  {codes.map((c) => {
                    const l = t.lines[c];
                    return (
                      <Td key={c} className="text-right tabular-nums">
                        {l ? h(l.minutes) : "—"}
                        {l && l.days > 0 && (c.startsWith("LEAVE_") || c === "PUBLIC_HOLIDAY" || c === "ABSENT") && (
                          <span className="block text-xs text-muted">{l.days} d</span>
                        )}
                      </Td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {report.exports.length > 0 && (
        <Card title="Exports" className="mt-6" flush>
          <Table>
            <thead><tr><Th>When</Th><Th>Format</Th><Th className="text-right">Rows</Th></tr></thead>
            <tbody>
              {report.exports.map((x) => (
                <tr key={x.id}>
                  <Td>{formatDateTime(x.createdAt, company.timezone)}</Td>
                  <Td>{x.target === "CSV_LINES" ? "CSV (one row per pay code)" : "CSV (one row per employee)"}</Td>
                  <Td className="text-right">{x.rowCount}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      <p className="mt-4 text-xs text-muted">
        LekkerWerk reports time by category. Your payroll system applies the rates (e.g. overtime 1.5×, Sunday and public holiday work 2×) from each employee&rsquo;s contract.
      </p>
    </>
  );
}
