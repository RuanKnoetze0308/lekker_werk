import Link from "next/link";
import { Plus } from "lucide-react";
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
import { Button } from "@/components/ui/Button";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { employeeListQuery } from "@/lib/schemas/workforce";
import { can } from "@/server/auth/permissions";
import { requirePageContext } from "@/server/auth/guards";
import { listDepartments, listEmployees } from "@/server/services/employee.service";
import { listLocations } from "@/server/services/location.service";

export const metadata = { title: "Employees · LekkerWerk" };

export default async function EmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext("employees:read");
  const p = await readParams(searchParams);
  const query = employeeListQuery.parse({
    q: p.get("q"),
    locationId: p.get("locationId"),
    department: p.get("department"),
    status: p.get("status"),
    page: p.get("page"),
  });

  const [result, locations, departments] = await Promise.all([
    listEmployees(ctx, query),
    listLocations(ctx, { includeInactive: true }),
    listDepartments(ctx),
  ]);

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone who clocks in. Deactivated employees keep their full history."
        actions={
          can(ctx.role, "employees:write") && (
            <Button href="/employees/new" icon={<Plus className="size-4" />}>Add employee</Button>
          )
        }
      />

      <FilterBar action="/employees">
        <FilterField label="Search">
          <input name="q" defaultValue={query.q ?? ""} placeholder="Name or number" className={filterControl} />
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
        <FilterField label="Status">
          <select name="status" defaultValue={query.status ?? ""} className={filterControl}>
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </FilterField>
      </FilterBar>

      <Card flush>
        {result.rows.length === 0 ? (
          <EmptyState title="No employees found" hint="Adjust the filters or add your first employee." />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Number</Th>
                  <Th>Location</Th>
                  <Th>Department</Th>
                  <Th>Channel</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((e) => (
                  <tr key={e.id} className="hover:bg-soft-surface/50">
                    <Td>
                      <Link href={`/employees/${e.id}`} className="font-medium text-ink hover:text-dark-green">
                        {e.firstName} {e.lastName}
                      </Link>
                      {e.position && <p className="text-xs text-muted">{e.position}</p>}
                    </Td>
                    <Td>{e.employeeNumber}</Td>
                    <Td>{e.locationName}</Td>
                    <Td>{e.department ?? "—"}</Td>
                    <Td>{e.preferredChannel ? e.preferredChannel.toLowerCase() : "—"}</Td>
                    <Td><Badge tone={statusTone(e.status)}>{e.status === "ACTIVE" ? "Active" : "Inactive"}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              basePath="/employees"
              params={{ q: query.q, locationId: query.locationId, department: query.department, status: query.status }}
              page={result.page}
              pageSize={result.pageSize}
              total={result.total}
            />
          </>
        )}
      </Card>
    </>
  );
}
