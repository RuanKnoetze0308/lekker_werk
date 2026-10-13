/**
 * Applies db/migrations to the database (idempotent). Runs on Railway as the pre-deploy command,
 * so a failed migration stops the release and the previous version keeps serving.
 *
 *   npm run migrate
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { databaseUrl } from "./_url.mjs";

const pool = new pg.Pool({ connectionString: databaseUrl(), max: 1 });
const started = Date.now();
console.log("[migrate] applying migrations…");
try {
  await migrate(drizzle(pool), { migrationsFolder: "db/migrations" });
  const { rows } = await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations");
  console.log(`[migrate] done in ${Date.now() - started} ms (${rows[0].n} migrations applied in total)`);
} catch (err) {
  console.error("[migrate] FAILED:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
