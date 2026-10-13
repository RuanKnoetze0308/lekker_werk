import { readFileSync, existsSync } from "node:fs";

/** DATABASE_URL from the environment (Railway), else from .env.local (local development). */
export function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (existsSync(".env.local")) {
    const text = readFileSync(".env.local", "utf8").replace(/^\uFEFF/, "");
    const m = /^DATABASE_URL=(.*)$/m.exec(text);
    if (m) return m[1].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  throw new Error("DATABASE_URL is not set.");
}
