import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads .env.local for standalone scripts (Next.js does this for the app itself).
 * Must run before anything imports db/client, which reads DATABASE_URL at import time,
 * so scripts import their app modules dynamically after calling this.
 */
export function loadEnv(file = ".env.local", opts: { optional?: boolean } = {}) {
  // On Railway (`railway run` / a service shell) the variables are already in the environment.
  if (opts.optional && !existsSync(resolve(process.cwd(), file))) return;
  // Strip a UTF-8 BOM: files written by Windows PowerShell start with one.
  const text = readFileSync(resolve(process.cwd(), file), "utf8").replace(/^﻿/, "");
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
