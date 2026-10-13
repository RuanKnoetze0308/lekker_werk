import Link from "next/link";
import {
  Badge,
  Card,
  EmptyState,
  FilterBar,
  FilterField,
  PageHeader,
  Pagination,
  Table,
  Td,
  Th,
  filterControl,
  statusTone,
} from "@/components/dashboard/ui";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { attendanceQuery } from "@/lib/schemas/workforce";
import { addDays, formatMinutes, formatTime, localDate } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { listRecentAttempts, listAttendance } from "@/server/services/attendance.service";
import { getCompany } from "@/server/services/company.service";
import { listDepartments } from "@/server/services/employee.service";
import { listLocations } from "@/server/services/location.service";

export const metadata = { title: "Attendance · LekkerWerk" };

const REASONS: Record<string, string> = {
  GPS_REQUIRED: "No location shared",
  OUTSIDE_RADIUS: "Outside allowed radius",
  QR_INVALID: "Invalid QR",
  QR_DISABLED: "Disabled QR",
  QR_EXPIRED: "Expired QR",
  ACCOUNT_NOT_LINKED: "Chat not linked",
  DUPLICATE: "Duplicate",
  ALREADY_CLOCKED_IN: "Already clocked in",
  NOT_CLOCKED_IN: "Not clocked in",
};

export default async function AttendancePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext("attendance:read");
  const company = await getCompany(ctx);
  const p = await readParams(searchParams);
  const to = p.get("to") ?? localDate(new Date(), company.timezone);
  const query = attendanceQuery.parse({
    from: p.get("from") ?? addDays(to, -6),
    to,
    locationId: p.get("locationId"),
    department: p.get("department"),
    page: p.get("page"),
  });

  const [result, locations, departments, attempts] = await Promise.all([
    listAttendance(ctx, query),
    listLocations(ctx),
    listDepartments(ctx),
    listRecentAttempts(ctx, 8),
  ]);

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Daily records calculated from the clock-event ledger. Click an employee to drill into individual clockings."
      />

      <FilterBar action="/attendance">
        <FilterField label="From">
          <input type="date" name="from" defaultValue={query.from} className={filterControl} />
        </FilterField>
        <FilterField label="To">
          <input type="date" name="to" defaultValue={query.to} className={filterControl} />
        </FilterField>
        <FilterField label="Location">
          <select name="locationId" defaultValue={query.locationId ?? ""} className={filterControl}>
            <option value="">All</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Department">
          <select name="department" defaultValue={query.department ?? ""} className={filterControl}>
            <option value="">All</option>
            {departments.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      <Card flush>
        {result.rows.length === 0 ? (
          <EmptyState title="No attendance records" hint="Records appear as soon as employees clock in." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th><Th>Employee</Th><Th>Location</Th><Th>In</Th><Th>Out</Th>
                  <Th>Worked</Th><Th>Scheduled</Th><Th>Overtime</Th><Th>Late</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.id} className="hover:bg-soft-surface/50">
                    <Td>{r.workDate}</Td>
                    <Td>
                      <Link href={`/employees/${r.employeeId}`} className="font-medium hover:text-dark-green">{r.employeeName}</Link>
                      <p className="text-xs text-muted">#{r.employeeNumber}</p>
                    </Td>
                    <Td>{r.locationName}</Td>
                    <Td>{formatTime(r.firstClockIn, r.timezone)}</Td>
                    <Td>{formatTime(r.lastClockOut, r.timezone)}</Td>
                    <Td>{formatMinutes(r.workedMinutes)}</Td>
                    <Td>{formatMinutes(r.scheduledMinutes)}</Td>
                    <Td>{r.overtimeMinutes ? formatMinutes(r.overtimeMinutes) : "—"}</Td>
                    <Td>{r.lateMinutes ? `${r.lateMinutes}m` : "—"}</Td>
                    <Td><Badge tone={statusTone(r.status)}>{r.status.toLowerCase()}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              basePath="/attendance"
              params={{ from: query.from, to: query.to, locationId: query.locationId, department: query.department }}
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
            />
          </>
        )}
      </Card>

      <Card title="Recent failed clocking attempts" className="mt-6" flush>
        {attempts.length === 0 ? (
          <p className="p-5 text-sm text-muted">No rejected attempts. 🎉</p>
        ) : (
          <Table>
            <thead><tr><Th>When</Th><Th>Employee</Th><Th>Action</Th><Th>Reason</Th></tr></thead>
            <tbody>
              {attempts.map((a) => (
                <tr key={a.id}>
                  <Td>{a.createdAt.toLocaleString("en-ZA", { timeZone: company.timezone })}</Td>
                  <Td>{a.employeeName ?? "Unknown chat"}</Td>
                  <Td>{a.requestedAction.replace("_", " ").toLowerCase()}</Td>
                  <Td><Badge tone="red">{(a.reason && REASONS[a.reason]) ?? a.reason?.toLowerCase().replaceAll("_", " ")}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
