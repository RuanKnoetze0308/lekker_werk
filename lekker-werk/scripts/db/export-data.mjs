/**
 * Exports all data (not the schema) from the local database to db/exports/lekkerwerk-data.sql,
 * ready to load into a freshly migrated database (e.g. Railway) with `npm run db:import`.
 * Sessions and rate-limit counters are left out (everyone logs in again).
 *
 * The file holds real personal data and password hashes: it is git-ignored, keep it private.
 *
 *   npm run db:export
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { databaseUrl } from "./_url.mjs";

function pgTool(name) {
  const candidates = [
    process.env.PG_BIN && `${process.env.PG_BIN}/${name}`,
    `C:/Program Files/PostgreSQL/18/bin/${name}.exe`,
    name,
  ].filter(Boolean);
  return candidates.find((c) => c === name || existsSync(c));
}

const out = "db/exports/lekkerwerk-data.sql";
mkdirSync("db/exports", { recursive: true });
execFileSync(
  pgTool("pg_dump"),
  [
    "--data-only",
    "--disable-triggers",
    "--no-owner",
    "--no-privileges",
    "--exclude-schema=drizzle",
    "--exclude-table-data=sessions",
    "--exclude-table-data=rate_limits",
    "-f",
    out,
    databaseUrl(),
  ],
  { stdio: "inherit" },
);
// Settings newer than the target server may not know (harmless to drop for a data load).
const sql = readFileSync(out, "utf8")
  .split("\n")
  .filter((l) => !/^SET (transaction_timeout|idle_in_transaction_session_timeout)\b/.test(l))
  .join("\n");
writeFileSync(out, sql);
console.log(`Exported to ${out} (${Math.round(sql.length / 1024)} KB). Load it with: npm run db:import -- "<target DATABASE_URL>"`);
