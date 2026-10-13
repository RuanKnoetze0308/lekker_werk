import "server-only";
import { assertPublicHttpsUrl } from "@/lib/ssrf";
import { AppError } from "../../errors";
import type { IntegrationProviderImpl, NormalizedHours, ProviderSettings } from "../types";

async function rpc(base: URL, service: string, method: string, args: unknown[]) {
  const res = await fetch(new URL("/jsonrpc", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: { service, method, args }, id: 1 }),
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json()) as { result?: unknown; error?: { data?: { message?: string } } };
  if (json.error) throw new AppError(502, "INTEGRATION_ERROR", json.error.data?.message ?? "Odoo error");
  return json.result;
}

async function login(s: ProviderSettings) {
  const base = await assertPublicHttpsUrl(s.config.apiUrl);
  const uid = await rpc(base, "common", "login", [s.config.database, s.config.username, s.credentials.password]);
  if (!uid) throw new AppError(401, "INTEGRATION_AUTH", "Odoo rejected these credentials.");
  return { base, uid: uid as number };
}

/** Reads hr.attendance and normalises each check-in/out pair into hours per employee/day. */
export const odooProvider: IntegrationProviderImpl = {
  async testConnection(s) {
    await login(s);
  },
  async fetchHours(s, { from, to }) {
    const { base, uid } = await login(s);
    const rows = (await rpc(base, "object", "execute_kw", [
      s.config.database,
      uid,
      s.credentials.password,
      "hr.attendance",
      "search_read",
      [[["check_in", ">=", from.toISOString().slice(0, 19).replace("T", " ")], ["check_in", "<=", to.toISOString().slice(0, 19).replace("T", " ")]]],
      { fields: ["employee_id", "check_in", "worked_hours"], limit: 5000 },
    ])) as { id: number; employee_id: [number, string]; check_in: string; worked_hours: number }[];

    const out: NormalizedHours[] = [];
    for (const r of rows) {
      // Odoo employee refs are matched on the employee's name unless a barcode/number is mapped later.
      out.push({
        externalRecordId: String(r.id),
        externalEmployeeRef: String(r.employee_id?.[1] ?? r.employee_id?.[0]),
        workDate: r.check_in.slice(0, 10),
        hours: r.worked_hours,
        raw: r as unknown as Record<string, unknown>,
      });
    }
    return out;
  },
};
