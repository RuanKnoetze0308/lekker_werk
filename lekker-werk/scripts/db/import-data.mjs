/**
 * Loads db/exports/lekkerwerk-data.sql into another database in ONE transaction: either all of
 * it arrives or nothing does. The target must already be migrated (`npm run migrate` / a Railway
 * deploy) and empty: it refuses to load into a database that already has companies.
 *
 *   npm run db:import -- "postgresql://user:password@host:port/railway"
 *
 * Use Railway's *public* connection URL (Postgres service -> Connect -> Public Network).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";

const target = process.argv[2];
const file = process.argv[3] ?? "db/exports/lekkerwerk-data.sql";
if (!target?.startsWith("postgres")) {
  console.error('Usage: npm run db:import -- "<target DATABASE_URL>" [file]');
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`${file} not found. Run npm run db:export first.`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: target });
await client.connect();
const { rows } = await client.query("select to_regclass('public.companies') is not null as migrated");
if (!rows[0].migrated) {
  console.error("The target has no tables yet. Deploy once on Railway (it migrates) or run DATABASE_URL=... npm run migrate.");
  process.exit(1);
}
const { rows: c } = await client.query("select count(*)::int as n from companies");
await client.end();
if (c[0].n > 0) {
  console.error(`The target already has ${c[0].n} compan${c[0].n === 1 ? "y" : "ies"}. Refusing to load on top of existing data.`);
  process.exit(1);
}

const psql = [process.env.PG_BIN && `${process.env.PG_BIN}/psql`, "C:/Program Files/PostgreSQL/18/bin/psql.exe", "psql"]
  .filter(Boolean)
  .find((p) => p === "psql" || existsSync(p));
execFileSync(psql, ["-v", "ON_ERROR_STOP=1", "--single-transaction", "-q", "-f", file, target], { stdio: "inherit" });
console.log("Data loaded. Log in on the live site with the same accounts as locally.");
