import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuse one pool across hot reloads in dev; in production each server instance owns one pool.
const globalForDb = globalThis as unknown as { __pgPool?: Pool };

const pool =
  globalForDb.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX) || 10, // unset or blank = 10
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;
else warnIfUnencrypted(process.env.DATABASE_URL);

/**
 * Railway's private network (*.railway.internal) is already encrypted. Any other remote database
 * must be reached over TLS: add ?sslmode=require (or verify-full) to DATABASE_URL.
 */
function warnIfUnencrypted(url: string | undefined) {
  if (!url) return;
  try {
    const u = new URL(url);
    const local = ["localhost", "127.0.0.1", "::1"].includes(u.hostname) || u.hostname.endsWith(".railway.internal");
    if (!local && !u.searchParams.get("sslmode")) {
      console.warn(`[db] DATABASE_URL points at ${u.hostname} without sslmode: traffic to the database is not encrypted. Add ?sslmode=require.`);
    }
  } catch {
    // Not a URL (e.g. a socket path): nothing to check.
  }
}

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
