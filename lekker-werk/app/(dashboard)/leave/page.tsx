import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/dashboard/ui";
import { readParams, type SearchParams } from "@/lib/page-utils";
import { can } from "@/server/auth/permissions";
import { requirePageContext } from "@/server/auth/guards";
import { listEmployees } from "@/server/services/employee.service";
import { leaveBalances, listLeaveRequests, listLeaveTypes } from "@/server/time/leave.service";
import { AdjustBalanceButton, LeaveRequestActions, LeaveTypeButton, RecordLeaveButton } from "./_components/LeaveForms";

export const metadata = { title: "Leave · LekkerWerk" };

const TABS = [
  { id: "requests", label: "Requests" },
  { id: "balances", label: "Balances" },
  { id: "types", label: "Leave types" },
] as const;

const STATUS_TONE = { REQUESTED: "amber", APPROVED: "green", DECLINED: "red", CANCELLED: "gray" } as const;

export default async function LeavePage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext("leave:approve");
  const tab = ((await readParams(searchParams)).get("tab") ?? "requests") as (typeof TABS)[number]["id"];
  const isAdmin = can(ctx.role, "settings:manage");

  const [types, staff] = await Promise.all([
    listLeaveTypes(ctx, { includeInactive: tab === "types" }),
    listEmployees(ctx, { status: "ACTIVE", page: 1, pageSize: 100 }),
  ]);
  const employees = staff.rows.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}` }));
  const activeTypes = types.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, code: t.code }));

  return (
    <>
      <PageHeader
        title="Leave"
        description="Requests from employees (web, Telegram, WhatsApp), balances and leave types. Approved leave shows up in attendance and payroll automatically."
        actions={<RecordLeaveButton employees={employees} types={activeTypes} />}
      />
      <nav className="mb-6 flex gap-1 border-b border-border" aria-label="Leave sections">
        {TABS.filter((t) => t.id !== "types" || isAdmin).map((t) => (
          <Link
            key={t.id}
            href={`/leave?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t.id ? "border-dark-green text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "requests" && <Requests ctx={ctx} />}
      {tab === "balances" && <Balances ctx={ctx} employees={employees} types={activeTypes} />}
      {tab === "types" && isAdmin && <Types types={types} />}
    </>
  );
}

async function Requests({ ctx }: { ctx: Awaited<ReturnType<typeof requirePageContext>> }) {
  const [pending, recent] = await Promise.all([
    listLeaveRequests(ctx, { status: "REQUESTED", limit: 200 }),
    listLeaveRequests(ctx, { limit: 50 }),
  ]);
  const decided = recent.filter((r) => r.status !== "REQUESTED");
  const row = (r: (typeof recent)[number]) => (
    <tr key={r.id}>
      <Td>
        <Link href={`/employees/${r.employeeId}`} className="font-medium hover:underline">{r.employeeName}</Link>
        <span className="block text-xs text-muted">#{r.employeeNumber}</span>
      </Td>
      <Td>{r.typeName}</Td>
      <Td>{r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`}</Td>
      <Td className="text-right">{Number(r.days)}</Td>
      <Td className="text-muted">
        {r.source.toLowerCase()}
        {r.reason && <span className="block max-w-xs truncate text-xs">{r.reason}</span>}
        {r.documentAfterDays !== null && Number(r.days) > r.documentAfterDays && !r.documentRef && (
          <span className="block text-xs font-medium text-amber-700">Needs a doctor&rsquo;s note</span>
        )}
      </Td>
      <Td><Badge tone={STATUS_TONE[r.status]}>{r.status.toLowerCase()}</Badge></Td>
      <Td className="text-right"><LeaveRequestActions id={r.id} status={r.status} /></Td>
    </tr>
  );
  const head = (
    <thead>
      <tr><Th>Employee</Th><Th>Type</Th><Th>Dates</Th><Th className="text-right">Days</Th><Th>Via</Th><Th>Status</Th><Th /></tr>
    </thead>
  );
  return (
    <>
      <Card title={`Waiting for a decision (${pending.length})`} flush>
        {pending.length === 0 ? (
          <EmptyState title="Nothing waiting" hint="New requests from chat or the web appear here." />
        ) : (
          <>
            {/* Phones: stacked so Approve / Decline are reachable without sideways scrolling. */}
            <ul className="divide-y divide-border/70 sm:hidden">
              {pending.map((r) => (
                <li key={r.id} className="flex flex-col gap-1.5 px-5 py-4 text-sm">
                  <Link href={`/employees/${r.employeeId}`} className="font-medium hover:underline">{r.employeeName}</Link>
                  <span className="text-muted">
                    {r.typeName} · {r.startDate === r.endDate ? r.startDate : `${r.startDate} → ${r.endDate}`} · {Number(r.days)} d · via {r.source.toLowerCase()}
                  </span>
                  {r.reason && <span className="text-xs text-muted">{r.reason}</span>}
                  <span className="self-start"><LeaveRequestActions id={r.id} status={r.status} /></span>
                </li>
              ))}
            </ul>
            <div className="hidden sm:block"><Table>{head}<tbody>{pending.map(row)}</tbody></Table></div>
          </>
        )}
      </Card>
      <Card title="Recent decisions" className="mt-6" flush>
        {decided.length === 0 ? <EmptyState title="No decisions yet" /> : <Table>{head}<tbody>{decided.map(row)}</tbody></Table>}
      </Card>
    </>
  );
}

async function Balances({
  ctx,
  employees,
  types,
}: {
  ctx: Awaited<ReturnType<typeof requirePageContext>>;
  employees: { id: string; name: string }[];
  types: { id: string; name: string; code: string }[];
}) {
  const rows = await leaveBalances(ctx);
  const columns = [...new Map(rows.map((r) => [r.leaveTypeId, r.name])).entries()];
  const people = [...new Map(rows.map((r) => [r.employeeId, { name: r.employeeName, number: r.employeeNumber }])).entries()];
  const value = (emp: string, type: string) => rows.find((r) => r.employeeId === emp && r.leaveTypeId === type)?.balance ?? 0;
  return (
    <Card title="Balances (days)" flush action={<AdjustBalanceButton employees={employees} types={types} />}>
      {people.length === 0 ? (
        <EmptyState title="No balances yet" hint="Balances build up nightly from each employee's start date. Add opening balances from your old system with Adjust." />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Employee</Th>
              {columns.map(([id, name]) => <Th key={id} className="text-right">{name}</Th>)}
            </tr>
          </thead>
          <tbody>
            {people.map(([id, p]) => (
              <tr key={id}>
                <Td><Link href={`/employees/${id}`} className="font-medium hover:underline">{p.name}</Link></Td>
                {columns.map(([typeId]) => {
                  const b = Math.round(value(id, typeId) * 100) / 100;
                  return <Td key={typeId} className={`text-right ${b < 0 ? "font-semibold text-red-600" : ""}`}>{b}</Td>;
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function Types({ types }: { types: Awaited<ReturnType<typeof listLeaveTypes>> }) {
  const accrual = { NONE: "No balance", MONTHLY: "Builds up monthly", CYCLE_UPFRONT: "Granted per cycle" } as const;
  return (
    <Card title="Leave types" flush action={<LeaveTypeButton />}>
      <Table>
        <thead>
          <tr><Th>Name</Th><Th>Code</Th><Th>Paid</Th><Th>Entitlement</Th><Th>Note needed after</Th><Th>Employees can request</Th><Th /></tr>
        </thead>
        <tbody>
          {types.map((t) => (
            <tr key={t.id} className={t.active ? "" : "opacity-50"}>
              <Td className="font-medium">{t.name}</Td>
              <Td className="text-muted">{t.code}</Td>
              <Td>{t.paid ? "Paid" : "Unpaid"}</Td>
              <Td>{t.accrual === "NONE" ? accrual.NONE : `${Number(t.entitlementDays)} days / ${t.cycleMonths} months · ${accrual[t.accrual].toLowerCase()}`}</Td>
              <Td>{t.documentAfterDays !== null ? `${t.documentAfterDays} days` : "—"}</Td>
              <Td>{t.employeeRequestable ? "Yes" : "Managers only"}</Td>
              <Td className="text-right"><LeaveTypeButton type={{ ...t, entitlementDays: Number(t.entitlementDays) }} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <p className="px-5 py-4 text-xs text-muted">
        Defaults follow the BCEA minimums (annual 15 working days a year, sick 30 days per 3-year cycle, family
        responsibility 3 days a year). Make them more generous if your policy is.
      </p>
    </Card>
  );
}
