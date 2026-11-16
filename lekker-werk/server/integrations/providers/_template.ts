import "server-only";
import { assertPublicHttpsUrl, publicFetch } from "@/lib/ssrf";
import { AppError } from "../../errors";
import type { IntegrationProviderImpl, ProviderSettings } from "../types";

/**
 * TEMPLATE: copy this file, rename it (e.g. sage.ts), fill in the three functions, then register
 * the export in ../registry.ts. Nothing else needs to change. Walkthrough: docs/INTEGRATIONS.md.
 *
 * What you get in `s`:
 *   s.config       the non-secret fields from the connect form   (lib/integration-catalog.ts -> configFields)
 *   s.credentials  the secret fields, decrypted for this call    (lib/integration-catalog.ts -> credentialFields)
 *
 * Rules that keep this safe:
 *   - If the customer types the URL, call it with assertPublicHttpsUrl + publicFetch (blocks
 *     internal addresses). For a fixed vendor URL (https://api.xero.com) plain fetch is fine.
 *   - Throw AppError with a message the customer can act on. Never put a secret in a message.
 *   - Delete the direction you don't need (fetchHours = import, pushHours = export).
 */

const API = "https://api.example.com"; // fixed vendor URL, or read s.config.apiUrl

async function request(s: ProviderSettings, path: string, init: { method?: string; body?: unknown } = {}) {
  const url = await assertPublicHttpsUrl(`${s.config.apiUrl ?? API}${path}`);
  const res = await publicFetch(url, {
    method: init.method ?? "GET",
    headers: {
      authorization: `Bearer ${s.credentials.apiKey ?? ""}`,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    timeoutMs: 20_000,
  });
  if (res.status === 401 || res.status === 403) throw new AppError(401, "INTEGRATION_AUTH", "The system rejected these credentials.");
  if (!res.ok) throw new AppError(502, "INTEGRATION_ERROR", `The system responded ${res.status}.`);
  return res.json() as Promise<unknown>;
}

export const templateProvider: IntegrationProviderImpl = {
  /** "Test connection" button. Make the cheapest authenticated call the API offers. */
  async testConnection(s) {
    await request(s, "/me");
  },

  /** IMPORT (ERP -> LekkerWerk). Runs on the sync schedule. Return one row per employee per day. */
  async fetchHours(s, { from, to }) {
    const rows = (await request(s, `/timesheets?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`)) as {
      id: string;
      employeeNumber: string;
      date: string;
      hours: number;
    }[];
    return rows.map((r) => ({
      externalRecordId: String(r.id), // same id again = update, not a duplicate
      externalEmployeeRef: String(r.employeeNumber), // must equal the employee number in LekkerWerk
      workDate: r.date.slice(0, 10),
      hours: Number(r.hours),
      raw: r as unknown as Record<string, unknown>,
    }));
  },

  /** EXPORT (LekkerWerk -> payroll). Runs when someone clicks "Send to ..." on a locked pay period. */
  async pushHours(s, payload) {
    const out = (await request(s, "/pay-run-inputs", {
      method: "POST",
      body: {
        // Use the period id as the idempotency key so sending twice doesn't double-pay anyone.
        idempotencyKey: payload.periodId,
        from: payload.periodStart,
        to: payload.periodEnd,
        lines: payload.lines.map((l) => ({
          employee: l.employeeNumber,
          code: l.payCode, // map NORMAL / OVERTIME / LEAVE_ANNUAL ... to the system's own codes here
          hours: l.hours,
          days: l.days,
        })),
      },
    })) as { batchId?: string };
    return { accepted: payload.lines.length, reference: out.batchId };
  },
};
