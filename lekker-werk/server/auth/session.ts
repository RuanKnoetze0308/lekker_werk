import "server-only";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { companies, managerLocations, managers, sessions, users } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getBillingAccess } from "../billing/billing.service";
import type { AuthContext } from "./context";
import { clientIpFrom } from "../http/client-ip";

export const SESSION_COOKIE = "lw_session";
export const CSRF_COOKIE = "lw_csrf";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
/** Signed out after this long without a request. Super admins can see every tenant, so sooner. */
const IDLE_MS = { default: 12 * 3600_000, superAdmin: 2 * 3600_000 };
/** A super admin's access to a tenant they stepped into (System portal) lapses after this. */
export const ACTING_TTL_MS = 3600_000;
/** lastSeenAt is only written when older than this, so normal browsing doesn't write every request. */
const TOUCH_MS = 60_000;

function cookieBase(expiresAt: Date) {
  return { sameSite: "lax" as const, secure: env.isProd, path: "/", expires: expiresAt };
}

function setSessionCookies(jar: Awaited<ReturnType<typeof cookies>>, token: string, csrfToken: string, expiresAt: Date) {
  jar.set(SESSION_COOKIE, token, { ...cookieBase(expiresAt), httpOnly: true });
  // Readable by client JS on purpose (double-submit CSRF token). Useless without the session cookie.
  jar.set(CSRF_COOKIE, csrfToken, { ...cookieBase(expiresAt), httpOnly: false });
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const ip = clientIpFrom(h);

  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    csrfToken,
    userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
    ip: ip === "unknown" ? null : ip,
    expiresAt,
  });

  setSessionCookies(await cookies(), token, csrfToken, expiresAt);
}

/**
 * New token and CSRF token for an existing session, e.g. when a super admin steps into or out of
 * a tenant: a token copied before the switch can't be used to act inside the tenant.
 */
export async function rotateSession(sessionId: string) {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const [row] = await db
    .update(sessions)
    .set({ tokenHash: sha256(token), csrfToken })
    .where(eq(sessions.id, sessionId))
    .returning({ expiresAt: sessions.expiresAt });
  if (row) setSessionCookies(await cookies(), token, csrfToken, row.expiresAt);
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
  jar.delete(CSRF_COOKIE);
}

export interface ResolvedSession {
  ctx: AuthContext;
  csrfToken: string;
  sessionId: string;
}

export async function resolveSession(): Promise<ResolvedSession | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const [row] = await db
    .select({
      sessionId: sessions.id,
      csrfToken: sessions.csrfToken,
      actingCompanyId: sessions.actingCompanyId,
      actingSince: sessions.actingSince,
      lastSeenAt: sessions.lastSeenAt,
      userId: users.id,
      companyId: users.companyId,
      role: users.role,
      name: users.name,
      email: users.email,
      status: users.status,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || row.status !== "ACTIVE") return null;

  const superAdmin = row.role === "SUPER_ADMIN";
  const now = Date.now();
  if (now - row.lastSeenAt.getTime() > (superAdmin ? IDLE_MS.superAdmin : IDLE_MS.default)) {
    await db.delete(sessions).where(eq(sessions.id, row.sessionId));
    return null;
  }

  // Tenant access lapses after ACTING_TTL_MS (a session from before acting_since existed has none).
  let actingCompanyId = row.actingCompanyId;
  const actingExpired = actingCompanyId && (!row.actingSince || now - row.actingSince.getTime() > ACTING_TTL_MS);
  if (actingExpired) actingCompanyId = null;
  if (actingExpired || now - row.lastSeenAt.getTime() > TOUCH_MS) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(now), ...(actingExpired ? { actingCompanyId: null, actingSince: null } : {}) })
      .where(eq(sessions.id, row.sessionId));
  }

  // Super admins can step into any tenant from the System portal; everyone else is pinned to
  // their own company. The acting tenant lives on the session row, never in the request.
  let companyId = row.companyId;
  let impersonating = false;
  if (superAdmin && actingCompanyId && actingCompanyId !== row.companyId) {
    const [tenant] = await db.select({ id: companies.id }).from(companies).where(eq(companies.id, actingCompanyId));
    if (tenant) {
      companyId = tenant.id;
      impersonating = true;
    }
  }
  if (!companyId) return null;

  let locationScope: string[] | null = null;
  if (row.role === "MANAGER") {
    const rows = await db
      .select({ locationId: managerLocations.locationId })
      .from(managers)
      .innerJoin(managerLocations, eq(managerLocations.managerId, managers.id))
      .where(eq(managers.userId, row.userId));
    locationScope = rows.map((r) => r.locationId);
  }

  const billing = await getBillingAccess(companyId);

  return {
    sessionId: row.sessionId,
    csrfToken: row.csrfToken,
    ctx: {
      billing,
      userId: row.userId,
      companyId,
      impersonating,
      actingUntil: impersonating && row.actingSince ? new Date(row.actingSince.getTime() + ACTING_TTL_MS) : undefined,
      role: row.role,
      name: row.name,
      email: row.email,
      locationScope,
    },
  };
}
