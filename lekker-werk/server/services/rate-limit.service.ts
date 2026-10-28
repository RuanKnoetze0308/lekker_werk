import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";

/**
 * Fixed-window counter in Postgres. Returns false when the limit is exceeded.
 * Good enough for a single DB; move to Redis if request volume demands it.
 */
function windowStartOf(windowSeconds: number) {
  return new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
}

export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const windowStart = windowStartOf(windowSeconds);
  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  return row.count <= limit;
}

/**
 * Counting only some events (e.g. failed logins) instead of every request: check `isRateLimited`
 * first, then `recordHit` when the event happens.
 */
export async function isRateLimited(key: string, limit: number, windowSeconds: number) {
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, key), eq(rateLimits.windowStart, windowStartOf(windowSeconds))));
  return (row?.count ?? 0) >= limit;
}

export async function recordHit(key: string, windowSeconds: number) {
  await rateLimit(key, Number.MAX_SAFE_INTEGER, windowSeconds);
}

export async function purgeRateLimits() {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - 3600_000)));
}
