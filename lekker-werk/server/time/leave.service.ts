import "server-only";
import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { employees, leaveLedger, leaveRequests, leaveTypes, locations } from "@/db/schema";
import type { z } from "zod";
import type { leaveAdjustmentSchema, leaveRequestSchema, leaveTypeSchema } from "@/lib/schemas/time";
import { addDays, localDate } from "@/lib/time";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "../services/audit.service";
import { notify } from "../services/notification.service";
import { recomputeDay } from "../services/attendance.service";
import { resolveDaySchedule } from "../services/schedule.service";
import { holidaysBetween } from "./holidays.service";
import { assertDatesOpen } from "./period-lock";

// ---- Leave types --------------------------------------------------------------------------

/**
 * South African BCEA minimums as starting defaults. Companies edit them (more generous policy,
 * study leave...). Maternity and parental leave are unpaid by the employer by default (UIF pays).
 */
export const DEFAULT_LEAVE_TYPES = [
  { code: "ANNUAL", name: "Annual leave", paid: true, accrual: "MONTHLY", entitlementDays: "15", cycleMonths: 12, documentAfterDays: null, employeeRequestable: true },
  { code: "SICK", name: "Sick leave", paid: true, accrual: "CYCLE_UPFRONT", entitlementDays: "30", cycleMonths: 36, documentAfterDays: 2, employeeRequestable: true },
  { code: "FAMILY", name: "Family responsibility", paid: true, accrual: "CYCLE_UPFRONT", entitlementDays: "3", cycleMonths: 12, documentAfterDays: null, employeeRequestable: true },
  { code: "MATERNITY", name: "Maternity leave", paid: false, accrual: "NONE", entitlementDays: "0", cycleMonths: 12, documentAfterDays: null, employeeRequestable: true },
  { code: "PARENTAL", name: "Parental leave", paid: false, accrual: "NONE", entitlementDays: "0", cycleMonths: 12, documentAfterDays: null, employeeRequestable: true },
  { code: "UNPAID", name: "Unpaid leave", paid: false, accrual: "NONE", entitlementDays: "0", cycleMonths: 12, documentAfterDays: null, employeeRequestable: true },
  { code: "AWOL", name: "Absent without leave", paid: false, accrual: "NONE", entitlementDays: "0", cycleMonths: 12, documentAfterDays: null, employeeRequestable: false },
] as const;

/** Idempotent: inserts any default type the company doesn't have yet. */
export async function ensureLeaveTypes(companyId: string, executor: Db | Tx = db) {
  await executor
    .insert(leaveTypes)
    .values(DEFAULT_LEAVE_TYPES.map((t) => ({ ...t, companyId })))
    .onConflictDoNothing();
}

export async function listLeaveTypes(ctx: AuthContext, opts: { includeInactive?: boolean } = {}) {
  await ensureLeaveTypes(ctx.companyId);
  return db
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.companyId, ctx.companyId), opts.includeInactive ? undefined : eq(leaveTypes.active, true)))
    .orderBy(asc(leaveTypes.name));
}

export async function saveLeaveType(ctx: AuthContext, input: z.infer<typeof leaveTypeSchema>, id?: string) {
  assertCan(ctx, "settings:manage");
  const values = {
    ...input,
    entitlementDays: String(input.entitlementDays),
    documentAfterDays: input.documentAfterDays ?? null,
  };
  if (id) {
    const res = await db
      .update(leaveTypes)
      .set(values)
      .where(and(eq(leaveTypes.id, id), eq(leaveTypes.companyId, ctx.companyId)))
      .returning({ id: leaveTypes.id });
    if (!res.length) throw Errors.notFound("Leave type");
    await audit(ctx, "leave.type_changed", "leave_type", id, { code: input.code });
    return { id };
  }
  const [row] = await db
    .insert(leaveTypes)
    .values({ ...values, companyId: ctx.companyId })
    .onConflictDoNothing()
    .returning({ id: leaveTypes.id });
  if (!row) throw Errors.conflict(`A leave type with code ${input.code} already exists.`);
  await audit(ctx, "leave.type_changed", "leave_type", row.id, { code: input.code, created: true });
  return row;
}

// ---- Day counting -------------------------------------------------------------------------

/**
 * Working days a leave range uses: days the employee is scheduled to work, minus public
 * holidays, times the day fraction. Leave never consumes weekends or holidays.
 */
export async function countLeaveDays(
  companyId: string,
  employeeId: string,
  locationId: string,
  startDate: string,
  endDate: string,
  dayFraction: number,
  executor: Db | Tx = db,
) {
  const holidays = await holidaysBetween(companyId, startDate, endDate, executor);
  let days = 0;
  const dates: string[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) {
    if (holidays.has(d)) continue;
    const s = await resolveDaySchedule(companyId, employeeId, locationId, d, executor);
    if (!s || s.scheduledMinutes <= 0) continue;
    days += dayFraction;
    dates.push(d);
  }
  return { days: Math.round(days * 100) / 100, dates };
}

// ---- Requests -----------------------------------------------------------------------------

async function loadEmployee(companyId: string, employeeId: string) {
  const [emp] = await db
    .select({ id: employees.id, locationId: employees.locationId, firstName: employees.firstName, lastName: employees.lastName, timezone: locations.timezone })
    .from(employees)
    .innerJoin(locations, eq(locations.id, employees.locationId))
    .where(and(eq(employees.id, employeeId), eq(employees.companyId, companyId)));
  if (!emp) throw Errors.notFound("Employee");
  return emp;
}

async function loadType(companyId: string, leaveTypeId: string) {
  const [t] = await db
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.id, leaveTypeId), eq(leaveTypes.companyId, companyId), eq(leaveTypes.active, true)));
  if (!t) throw Errors.invalid("Unknown leave type.");
  return t;
}

async function recomputeRange(employeeId: string, startDate: string, endDate: string, executor: Db | Tx = db) {
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) await recomputeDay(executor, employeeId, d);
}

interface CreateArgs {
  companyId: string;
  actor: { userId: string | null; companyId: string };
  input: Omit<z.infer<typeof leaveRequestSchema>, "approve"> & { approve?: boolean };
  source: "WEB" | "TELEGRAM" | "WHATSAPP" | "MANAGER" | "IMPORT";
}

async function createLeave({ companyId, actor, input, source }: CreateArgs) {
  const emp = await loadEmployee(companyId, input.employeeId);
  const type = await loadType(companyId, input.leaveTypeId);
  const { days } = await countLeaveDays(companyId, emp.id, emp.locationId, input.startDate, input.endDate, input.dayFraction);
  if (days <= 0) throw Errors.invalid("Those dates have no working days (weekends, days off and public holidays don't count).");

  const overlap = await db
    .select({ id: leaveRequests.id })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.employeeId, emp.id),
        inArray(leaveRequests.status, ["REQUESTED", "APPROVED"]),
        lte(leaveRequests.startDate, input.endDate),
        gte(leaveRequests.endDate, input.startDate),
      ),
    )
    .limit(1);
  if (overlap.length) throw Errors.conflict("There is already leave requested or approved on some of these days.");

  const [row] = await db
    .insert(leaveRequests)
    .values({
      companyId,
      employeeId: emp.id,
      leaveTypeId: type.id,
      startDate: input.startDate,
      endDate: input.endDate,
      dayFraction: String(input.dayFraction),
      days: String(days),
      source,
      reason: input.reason ?? null,
      documentRef: input.documentRef ?? null,
      requestedBy: actor.userId,
    })
    .returning();
  await audit(actor, "leave.requested", "leave_request", row.id, { employeeId: emp.id, type: type.code, days, source });
  return { row, emp, type };
}

/** Manager/admin records leave for an employee, optionally approving it immediately. */
export async function requestLeaveAsManager(ctx: AuthContext, input: z.infer<typeof leaveRequestSchema>) {
  assertCan(ctx, "leave:approve");
  const emp = await loadEmployee(ctx.companyId, input.employeeId);
  assertLocationAccess(ctx, emp.locationId);
  if (input.approve) await assertDatesOpen(ctx.companyId, input.startDate, input.endDate);
  const { row } = await createLeave({ companyId: ctx.companyId, actor: ctx, input, source: "MANAGER" });
  if (input.approve) await decideLeave(ctx, row.id, { approve: true, note: "Recorded by manager" });
  return { id: row.id };
}

/**
 * Employee self-service from Telegram / WhatsApp. Creates a REQUESTED leave and tells the
 * managers; nothing changes hours until a manager approves it.
 */
export async function requestLeaveFromChat(
  companyId: string,
  employeeId: string,
  leaveCode: string,
  startDate: string,
  endDate: string,
  channel: "TELEGRAM" | "WHATSAPP",
  reason?: string,
) {
  const [type] = await db
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.companyId, companyId), eq(leaveTypes.code, leaveCode), eq(leaveTypes.active, true)));
  if (!type || !type.employeeRequestable) throw Errors.invalid("That kind of leave can't be requested here.");
  const { row, emp } = await createLeave({
    companyId,
    actor: { userId: null, companyId },
    input: { employeeId, leaveTypeId: type.id, startDate, endDate, dayFraction: 1, reason: reason ?? null },
    source: channel,
  });
  await notify({
    companyId,
    type: "LEAVE_REQUESTED",
    title: `${emp.firstName} ${emp.lastName}: ${type.name}`,
    body: `${startDate === endDate ? startDate : `${startDate} to ${endDate}`} (${Number(row.days)} day${Number(row.days) === 1 ? "" : "s"}), via ${channel.toLowerCase()}.`,
    payload: { leaveRequestId: row.id, employeeId },
  });
  return { request: row, type };
}

/** Approve or decline. Approval books the days against the balance and updates attendance. */
export async function decideLeave(ctx: AuthContext, id: string, decision: { approve: boolean; note?: string | null }) {
  assertCan(ctx, "leave:approve");
  const [req] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.companyId, ctx.companyId)));
  if (!req) throw Errors.notFound("Leave request");
  const emp = await loadEmployee(ctx.companyId, req.employeeId);
  assertLocationAccess(ctx, emp.locationId);
  if (req.status !== "REQUESTED") throw Errors.conflict(`This request is already ${req.status.toLowerCase()}.`);
  await assertDatesOpen(ctx.companyId, req.startDate, req.endDate);

  await db.transaction(async (tx) => {
    await tx
      .update(leaveRequests)
      .set({
        status: decision.approve ? "APPROVED" : "DECLINED",
        decidedBy: ctx.userId,
        decidedAt: new Date(),
        decisionNote: decision.note ?? null,
      })
      .where(eq(leaveRequests.id, id));
    if (decision.approve) {
      await tx.insert(leaveLedger).values({
        companyId: ctx.companyId,
        employeeId: req.employeeId,
        leaveTypeId: req.leaveTypeId,
        entryDate: req.startDate,
        kind: "USAGE",
        days: `-${req.days}`,
        leaveRequestId: id,
        idempotencyKey: `USAGE:${id}`,
        createdBy: ctx.userId,
      });
      await recomputeRange(req.employeeId, req.startDate, req.endDate, tx);
    }
    await audit(ctx, decision.approve ? "leave.approved" : "leave.declined", "leave_request", id, { note: decision.note ?? null }, tx);
  });
}

/** Cancelling approved leave gives the days back and re-evaluates those days (they may become absences). */
export async function cancelLeave(ctx: AuthContext, id: string) {
  assertCan(ctx, "leave:approve");
  const [req] = await db
    .select()
    .from(leaveRequests)
    .where(and(eq(leaveRequests.id, id), eq(leaveRequests.companyId, ctx.companyId)));
  if (!req) throw Errors.notFound("Leave request");
  const emp = await loadEmployee(ctx.companyId, req.employeeId);
  assertLocationAccess(ctx, emp.locationId);
  if (req.status === "CANCELLED" || req.status === "DECLINED") throw Errors.conflict("This request is not active.");
  if (req.status === "APPROVED") await assertDatesOpen(ctx.companyId, req.startDate, req.endDate);

  await db.transaction(async (tx) => {
    await tx.update(leaveRequests).set({ status: "CANCELLED" }).where(eq(leaveRequests.id, id));
    if (req.status === "APPROVED") {
      await tx.insert(leaveLedger).values({
        companyId: ctx.companyId,
        employeeId: req.employeeId,
        leaveTypeId: req.leaveTypeId,
        entryDate: localDate(new Date(), emp.timezone),
        kind: "REVERSAL",
        days: req.days,
        leaveRequestId: id,
        idempotencyKey: `REVERSAL:${id}`,
        createdBy: ctx.userId,
      });
      await recomputeRange(req.employeeId, req.startDate, req.endDate, tx);
    }
    await audit(ctx, "leave.cancelled", "leave_request", id, {}, tx);
  });
}

export async function listLeaveRequests(
  ctx: AuthContext,
  q: { status?: "REQUESTED" | "APPROVED" | "DECLINED" | "CANCELLED"; employeeId?: string; from?: string; to?: string; limit?: number },
) {
  assertCan(ctx, "attendance:read");
  const scope: SQL | undefined =
    ctx.locationScope === null
      ? undefined
      : ctx.locationScope.length
        ? inArray(employees.locationId, ctx.locationScope)
        : sql`false`;
  return db
    .select({
      id: leaveRequests.id,
      employeeId: employees.id,
      employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
      employeeNumber: employees.employeeNumber,
      typeName: leaveTypes.name,
      typeCode: leaveTypes.code,
      startDate: leaveRequests.startDate,
      endDate: leaveRequests.endDate,
      days: leaveRequests.days,
      status: leaveRequests.status,
      source: leaveRequests.source,
      reason: leaveRequests.reason,
      documentRef: leaveRequests.documentRef,
      documentAfterDays: leaveTypes.documentAfterDays,
      decisionNote: leaveRequests.decisionNote,
      createdAt: leaveRequests.createdAt,
    })
    .from(leaveRequests)
    .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
    .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
    .where(
      and(
        eq(leaveRequests.companyId, ctx.companyId),
        scope,
        q.status ? eq(leaveRequests.status, q.status) : undefined,
        q.employeeId ? eq(leaveRequests.employeeId, q.employeeId) : undefined,
        q.to ? lte(leaveRequests.startDate, q.to) : undefined,
        q.from ? gte(leaveRequests.endDate, q.from) : undefined,
      ),
    )
    .orderBy(desc(leaveRequests.startDate))
    .limit(Math.min(q.limit ?? 100, 500));
}

// ---- Balances -----------------------------------------------------------------------------

/** Balance per employee per leave type (sum of the ledger), for one employee or everyone in scope. */
export async function leaveBalances(ctx: AuthContext, employeeId?: string) {
  assertCan(ctx, "attendance:read");
  const rows = (
    await db.execute(sql`
      select e.id as "employeeId", e.first_name || ' ' || e.last_name as "employeeName", e.employee_number as "employeeNumber",
        t.id as "leaveTypeId", t.code, t.name, coalesce(sum(l.days), 0)::float as balance
      from employees e
      cross join leave_types t
      left join leave_ledger l on l.employee_id = e.id and l.leave_type_id = t.id
      where e.company_id = ${ctx.companyId} and t.company_id = ${ctx.companyId}
        and e.status = 'ACTIVE' and t.active and t.accrual <> 'NONE'
        ${employeeId ? sql`and e.id = ${employeeId}` : sql``}
        ${
          ctx.locationScope === null
            ? sql``
            : ctx.locationScope.length
              ? sql`and e.location_id in (${sql.join(ctx.locationScope.map((id) => sql`${id}::uuid`), sql`, `)})`
              : sql`and false`
        }
      group by e.id, e.first_name, e.last_name, e.employee_number, t.id, t.code, t.name
      order by e.last_name, e.first_name, t.name`)
  ).rows as { employeeId: string; employeeName: string; employeeNumber: string; leaveTypeId: string; code: string; name: string; balance: number }[];
  return rows;
}

/** Balance of one type for one employee: used by the chat "leave balance" answer. */
export async function balanceFor(employeeId: string, code: string) {
  const [row] = (
    await db.execute(sql`
      select coalesce(sum(l.days), 0)::float as balance, t.name
      from leave_types t
      join employees e on e.company_id = t.company_id and e.id = ${employeeId}
      left join leave_ledger l on l.leave_type_id = t.id and l.employee_id = e.id
      where t.code = ${code}
      group by t.name`)
  ).rows as { balance: number; name: string }[];
  return row ?? null;
}

export async function adjustLeaveBalance(ctx: AuthContext, input: z.infer<typeof leaveAdjustmentSchema>) {
  assertCan(ctx, "leave:approve");
  const emp = await loadEmployee(ctx.companyId, input.employeeId);
  assertLocationAccess(ctx, emp.locationId);
  await loadType(ctx.companyId, input.leaveTypeId);
  const [row] = await db
    .insert(leaveLedger)
    .values({
      companyId: ctx.companyId,
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      entryDate: localDate(new Date(), emp.timezone),
      kind: input.kind,
      days: String(input.days),
      note: input.note,
      createdBy: ctx.userId,
    })
    .returning({ id: leaveLedger.id });
  await audit(ctx, "leave.balance_adjusted", "leave_ledger", row.id, { ...input });
}

// ---- Accrual (scheduled job) ----------------------------------------------------------------

function monthsBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}

function addMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

/**
 * Builds leave entitlements up to `asOf` for every active employee, idempotently:
 *   MONTHLY        entitlement / cycleMonths for each completed month since the start date
 *   CYCLE_UPFRONT  full entitlement at each cycle start; the unused rest of the previous cycle expires
 * Uses the employee's start date (employees.hired_on). Run daily; re-running adds nothing new.
 */
export async function runLeaveAccruals(companyId: string, asOf: string) {
  await ensureLeaveTypes(companyId);
  const types = await db
    .select()
    .from(leaveTypes)
    .where(and(eq(leaveTypes.companyId, companyId), eq(leaveTypes.active, true)));
  const staff = await db
    .select({ id: employees.id, hiredOn: employees.hiredOn, createdAt: employees.createdAt })
    .from(employees)
    .where(and(eq(employees.companyId, companyId), eq(employees.status, "ACTIVE")));

  let inserted = 0;
  for (const e of staff) {
    const start = e.hiredOn ?? e.createdAt.toISOString().slice(0, 10);
    if (start > asOf) continue;
    const months = monthsBetween(start, asOf);
    for (const t of types) {
      const entitlement = Number(t.entitlementDays);
      if (t.accrual === "NONE" || entitlement <= 0) continue;
      const base = { companyId, employeeId: e.id, leaveTypeId: t.id };
      const write = async (rows: (typeof leaveLedger.$inferInsert)[]) => {
        if (!rows.length) return;
        const res = await db.insert(leaveLedger).values(rows).onConflictDoNothing().returning({ id: leaveLedger.id });
        inserted += res.length;
      };
      if (t.accrual === "MONTHLY") {
        const perMonth = Math.round((entitlement / t.cycleMonths) * 100) / 100;
        const rows = [];
        for (let i = 1; i <= months; i++) {
          const date = addMonths(start, i);
          rows.push({ ...base, entryDate: date, kind: "ACCRUAL" as const, days: String(perMonth), idempotencyKey: `ACCRUAL:${date.slice(0, 7)}` });
        }
        await write(rows);
      } else {
        // Cycle by cycle: each expiry needs the balance including the previous cycle's grant.
        const cycles = Math.floor(months / t.cycleMonths);
        for (let c = 0; c <= cycles; c++) {
          const cycleStart = addMonths(start, c * t.cycleMonths);
          if (c > 0) {
            const [{ balance }] = (
              await db.execute(sql`select coalesce(sum(days),0)::float as balance from leave_ledger
                where employee_id = ${e.id} and leave_type_id = ${t.id} and entry_date < ${cycleStart}`)
            ).rows as { balance: number }[];
            if (balance > 0) {
              await write([{ ...base, entryDate: cycleStart, kind: "EXPIRY", days: String(-balance), idempotencyKey: `EXPIRY:${c - 1}`, note: `Unused days from cycle ${c} expire` }]);
            }
          }
          await write([{ ...base, entryDate: cycleStart, kind: "ACCRUAL", days: String(entitlement), idempotencyKey: `CYCLE:${c}` }]);
        }
      }
    }
  }
  return inserted;
}
