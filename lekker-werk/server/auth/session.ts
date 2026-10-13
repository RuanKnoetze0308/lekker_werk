import "server-only";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db/client";
import { managerLocations, managers, sessions, users } from "@/db/schema";
import { randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { getBillingAccess } from "../billing/billing.service";
import type { AuthContext } from "./context";

export const SESSION_COOKIE = "lw_session";
export const CSRF_COOKIE = "lw_csrf";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export async function createSession(userId: string) {
  const token = randomToken(32);
  const csrfToken = randomToken(24);
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    csrfToken,
    userAgent: h.get("user-agent")?.slice(0, 255) ?? null,
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    expiresAt,
  });

  const jar = await cookies();
  const base = { sameSite: "lax" as const, secure: env.isProd, path: "/", expires: expiresAt };
  jar.set(SESSION_COOKIE, token, { ...base, httpOnly: true });
  // Readable by client JS on purpose (double-submit CSRF token). Useless without the session cookie.
  jar.set(CSRF_COOKIE, csrfToken, { ...base, httpOnly: false });
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

  if (!row || row.status !== "ACTIVE" || !row.companyId) return null;

  let locationScope: string[] | null = null;
  if (row.role === "MANAGER") {
    const rows = await db
      .select({ locationId: managerLocations.locationId })
      .from(managers)
      .innerJoin(managerLocations, eq(managerLocations.managerId, managers.id))
      .where(eq(managers.userId, row.userId));
    locationScope = rows.map((r) => r.locationId);
  }

  const billing = await getBillingAccess(row.companyId);

  return {
    sessionId: row.sessionId,
    csrfToken: row.csrfToken,
    ctx: {
      billing,
      userId: row.userId,
      companyId: row.companyId,
      role: row.role,
      name: row.name,
      email: row.email,
      locationScope,
    },
  };
}
