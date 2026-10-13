import "server-only";
import { lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimits } from "@/db/schema";

/**
 * Fixed-window counter in Postgres. Returns false when the limit is exceeded.
 * Good enough for a single DB; move to Redis if request volume demands it.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const windowStart = new Date(Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000);
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

export async function purgeRateLimits() {
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(Date.now() - 3600_000)));
}
