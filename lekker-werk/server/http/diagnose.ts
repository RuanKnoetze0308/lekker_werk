/**
 * Turns an unexpected server error into a stable diagnostic code (see docs/ERROR_CODES.md).
 * The code tells a developer *what kind* of failure it was without exposing SQL, stack traces or
 * secrets to the browser. Full details go to the server log under the same ref.
 */

export interface Diagnosis {
  /** e.g. LW-DB-42703, LW-CFG-02, LW-INT-TypeError */
  diagnostic: string;
  /** Short, safe explanation for the person reading dev tools. */
  hint: string;
}

const DB_HINTS: Record<string, string> = {
  "42703": "Database column missing: a migration has not been applied.",
  "42P01": "Database table missing: a migration has not been applied.",
  "42704": "Database type/enum missing: a migration has not been applied.",
  "22P02": "Invalid value for a database column type (bad uuid/enum/number).",
  "23502": "A required database column was left empty.",
  "23503": "Refers to a record that doesn't exist (foreign key).",
  "23505": "Duplicate value for a unique field.",
  "23514": "A database check constraint rejected the value.",
  "40001": "Database transaction conflict; retrying usually works.",
  "40P01": "Database deadlock; retrying usually works.",
  "53300": "Too many database connections.",
  "57014": "Database query timed out.",
  "57P01": "Database restarted during the request.",
  "28P01": "Database login failed (DATABASE_URL credentials).",
  "3D000": "Database does not exist (DATABASE_URL).",
  P0001: "Blocked by a database rule (e.g. clock_events is append-only).",
};

const NET_HINTS: Record<string, string> = {
  ECONNREFUSED: "Cannot reach the database or an external service (connection refused).",
  ENOTFOUND: "Host name not found (check DATABASE_URL / external service URL).",
  ETIMEDOUT: "Connection to the database or an external service timed out.",
  ECONNRESET: "Connection to the database or an external service was dropped.",
};

function walk(err: unknown, depth = 0): unknown[] {
  if (!err || typeof err !== "object" || depth > 4) return [];
  return [err, ...walk((err as { cause?: unknown }).cause, depth + 1)];
}

export function diagnose(err: unknown): Diagnosis {
  for (const e of walk(err)) {
    const o = e as { code?: unknown; diagnostic?: unknown; message?: unknown };
    if (typeof o.diagnostic === "string") return { diagnostic: o.diagnostic, hint: String(o.message ?? "") };
    const code = typeof o.code === "string" ? o.code : "";
    // Postgres SQLSTATE: 5 chars, digits/uppercase.
    if (/^[0-9A-Z]{5}$/.test(code)) {
      return { diagnostic: `LW-DB-${code}`, hint: DB_HINTS[code] ?? "Database error." };
    }
    if (NET_HINTS[code]) return { diagnostic: `LW-NET-${code}`, hint: NET_HINTS[code] };
    const msg = typeof o.message === "string" ? o.message : "";
    // AES-GCM decrypt with the wrong key.
    if (msg.includes("unable to authenticate data")) {
      return { diagnostic: "LW-CFG-03", hint: "Stored secrets can't be decrypted: APP_ENCRYPTION_KEY differs from the one used to encrypt them." };
    }
  }
  const name = err instanceof Error ? err.constructor.name || err.name : typeof err;
  return { diagnostic: `LW-INT-${name.replace(/[^\w]/g, "")}`, hint: "Unexpected server error." };
}
