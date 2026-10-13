import { Card, EmptyState, FilterBar, FilterField, PageHeader, Table, Td, Th, filterControl } from "@/components/dashboard/ui";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { addDays, localDate } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { getCompany } from "@/server/services/company.service";
import { listDepartments } from "@/server/services/employee.service";
import { listLocations } from "@/server/services/location.service";
import { REPORTS, runReport, type ReportKind } from "@/server/services/reporting.service";

export const metadata = { title: "Reports · LekkerWerk" };

export default async function ReportsPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext("reports:read");
  const company = await getCompany(ctx);
  const p = await readParams(searchParams);

  const kind = (REPORTS.find((r) => r.kind === p.get("kind"))?.kind ?? "daily_attendance") as ReportKind;
  const to = p.get("to") ?? localDate(new Date(), company.timezone);
  const from = p.get("from") ?? addDays(to, -29);
  const locationId = p.get("locationId");
  const department = p.get("department");

  const [locations, departments, result] = await Promise.all([
    listLocations(ctx),
    listDepartments(ctx),
    p.get("run") ? runReport(ctx, { kind, from, to, locationId, department }) : Promise.resolve(null),
  ]);

  const qs = new URLSearchParams({ kind, from, to, ...(locationId ? { locationId } : {}), ...(department ? { department } : {}) });

  return (
    <>
      <PageHeader title="Reports" description={REPORTS.find((r) => r.kind === kind)?.description} />

      <FilterBar action="/reports">
        <input type="hidden" name="run" value="1" />
        <FilterField label="Report">
          <select name="kind" defaultValue={kind} className={filterControl}>
            {REPORTS.map((r) => <option key={r.kind} value={r.kind}>{r.label}</option>)}
          </select>
        </FilterField>
        <FilterField label="From"><input type="date" name="from" defaultValue={from} className={filterControl} /></FilterField>
        <FilterField label="To"><input type="date" name="to" defaultValue={to} className={filterControl} /></FilterField>
        <FilterField label="Location">
          <select name="locationId" defaultValue={locationId ?? ""} className={filterControl}>
            <option value="">All</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </FilterField>
        <FilterField label="Department">
          <select name="department" defaultValue={department ?? ""} className={filterControl}>
            <option value="">All</option>
            {departments.map((d) => <option key={d}>{d}</option>)}
          </select>
        </FilterField>
      </FilterBar>

      <Card
        title={result ? `${result.rows.length} row${result.rows.length === 1 ? "" : "s"}` : "Results"}
        flush
        action={
          result && (
            <a href={`/api/reports?${qs.toString()}&format=csv`} className="text-sm font-medium text-dark-green hover:underline">
              Download CSV
            </a>
          )
        }
      >
        {!result ? (
          <EmptyState title="Choose a report and press Apply" hint="Excel and PDF exports are planned; CSV opens directly in Excel." />
        ) : result.rows.length === 0 ? (
          <EmptyState title="No data for this selection" />
        ) : (
          <Table>
            <thead><tr>{result.columns.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
            <tbody>
              {result.rows.slice(0, 500).map((row, i) => (
                <tr key={i}>{row.map((cell, j) => <Td key={j}>{cell ?? ""}</Td>)}</tr>
              ))}
            </tbody>
          </Table>
        )}
        {result && result.rows.length > 500 && <p className="px-5 py-3 text-xs text-muted">Showing the first 500 rows. Download the CSV for everything.</p>}
      </Card>
    </>
  );
}
