/**
 * One-off for databases created with `drizzle-kit push` (before migrations existed): records the
 * baseline migration as already applied so `npm run migrate` only runs newer ones.
 * Refuses if the database has no tables yet (then just run `npm run migrate`).
 *
 *   npm run db:mark-baseline
 */
import { readMigrationFiles } from "drizzle-orm/migrator";
import pg from "pg";
import { databaseUrl } from "./_url.mjs";

const client = new pg.Client({ connectionString: databaseUrl() });
await client.connect();
try {
  const { rows } = await client.query("select to_regclass('public.companies') is not null as exists");
  if (!rows[0].exists) throw new Error("No schema here yet. Run `npm run migrate` instead.");
  const [baseline] = readMigrationFiles({ migrationsFolder: "db/migrations" });
  await client.query("create schema if not exists drizzle");
  await client.query(
    "create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)",
  );
  const seen = await client.query("select 1 from drizzle.__drizzle_migrations where hash = $1", [baseline.hash]);
  if (seen.rowCount) console.log("Baseline already recorded.");
  else {
    await client.query("insert into drizzle.__drizzle_migrations (hash, created_at) values ($1, $2)", [baseline.hash, baseline.folderMillis]);
    console.log("Baseline recorded. Future schema changes: edit db/schema, `npm run db:generate`, then `npm run migrate`.");
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
