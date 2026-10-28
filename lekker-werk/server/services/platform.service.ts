import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { clockDevices, companies, sessions, subscriptions, users } from "@/db/schema";
import type { AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "./audit.service";
import { rotateSession } from "../auth/session";

/**
 * System portal (platform operators only). These functions deliberately cross tenants, so every
 * one starts with assertPlatform. Callers come in through requirePlatformPage / requirePlatformApi.
 */
function assertPlatform(ctx: AuthContext) {
  if (ctx.role !== "SUPER_ADMIN") throw Errors.notFound();
}

type Row = Record<string, unknown>;

/** Tenants with headline counts, newest first. `q` matches company name, contact name or email. */
export async function listTenants(ctx: AuthContext, q = "", limit = 50) {
  assertPlatform(ctx);
  const term = q.trim();
  const like = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const res = await db.execute(sql`
    select c.id, c.name, c.contact_name as "contactName", c.contact_email as "contactEmail",
      c.status, c.created_at as "createdAt",
      s.status as "subscriptionStatus", s.plan,
      (select count(*)::int from locations l where l.company_id = c.id and l.status = 'ACTIVE') as locations,
      (select count(*)::int from employees e where e.company_id = c.id and e.status = 'ACTIVE') as employees,
      (select count(*)::int from clock_devices d where d.company_id = c.id) as devices
    from companies c
    left join subscriptions s on s.company_id = c.id
    ${term ? sql`where c.name ilike ${like} or c.contact_name ilike ${like} or c.contact_email ilike ${like}` : sql``}
    order by c.created_at desc
    limit ${limit}`);
  return res.rows as Row[] as {
    id: string;
    name: string;
    contactName: string;
    contactEmail: string;
    status: string;
    createdAt: string;
    subscriptionStatus: string | null;
    plan: string | null;
    locations: number;
    employees: number;
    devices: number;
  }[];
}

/** One tenant: company, subscription, locations (with headcount) and every device. */
export async function getTenant(ctx: AuthContext, companyId: string) {
  assertPlatform(ctx);
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));
  if (!company) throw Errors.notFound("Tenant");
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.companyId, companyId));
  const locs = (
    await db.execute(sql`
      select l.id, l.name, l.address, l.status,
        (select count(*)::int from employees e where e.company_id = l.company_id and e.status = 'ACTIVE'
          and (e.location_id = l.id or exists (select 1 from employee_locations el where el.employee_id = e.id and el.location_id = l.id))) as employees
      from locations l where l.company_id = ${companyId}
      order by l.name`)
  ).rows as { id: string; name: string; address: string | null; status: string; employees: number }[];
  const devices = await db
    .select({
      id: clockDevices.id,
      name: clockDevices.name,
      kind: clockDevices.kind,
      enabled: clockDevices.enabled,
      lastSeenAt: clockDevices.lastSeenAt,
      locationId: clockDevices.locationId,
    })
    .from(clockDevices)
    .where(eq(clockDevices.companyId, companyId))
    .orderBy(clockDevices.name);
  const admins = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(eq(users.companyId, companyId))
    .orderBy(users.name);
  return { company, subscription: sub ?? null, locations: locs, devices, users: admins };
}

/**
 * Point this session at another tenant. From the next request every page and API works on that
 * tenant's data (resolveSession swaps companyId); audit entries keep the operator's user id.
 */
export async function enterTenant(ctx: AuthContext, sessionId: string, companyId: string) {
  assertPlatform(ctx);
  const [company] = await db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.id, companyId));
  if (!company) throw Errors.notFound("Tenant");
  await db.update(sessions).set({ actingCompanyId: company.id, actingSince: new Date() }).where(eq(sessions.id, sessionId));
  await rotateSession(sessionId);
  await audit({ userId: ctx.userId, companyId: company.id }, "platform.tenant_entered", "company", company.id, { name: company.name });
  return company;
}

export async function exitTenant(ctx: AuthContext, sessionId: string) {
  assertPlatform(ctx);
  await db.update(sessions).set({ actingCompanyId: null, actingSince: null }).where(eq(sessions.id, sessionId));
  await rotateSession(sessionId);
  if (ctx.impersonating) {
    await audit({ userId: ctx.userId, companyId: ctx.companyId }, "platform.tenant_exited", "company", ctx.companyId);
  }
}

/** Enable / disable a tenant's clock device without stepping into the tenant. */
export async function setTenantDeviceEnabled(ctx: AuthContext, companyId: string, deviceId: string, enabled: boolean) {
  assertPlatform(ctx);
  const [row] = await db
    .update(clockDevices)
    .set({ enabled })
    .where(and(eq(clockDevices.id, deviceId), eq(clockDevices.companyId, companyId)))
    .returning({ id: clockDevices.id, name: clockDevices.name });
  if (!row) throw Errors.notFound("Device");
  await audit({ userId: ctx.userId, companyId, impersonating: true }, "device.updated", "clock_device", row.id, { enabled });
}

/** Name of the tenant a super admin is currently viewing (for the banner). */
export async function actingTenantName(ctx: AuthContext) {
  if (!ctx.impersonating) return null;
  const [c] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, ctx.companyId));
  return c?.name ?? null;
}
