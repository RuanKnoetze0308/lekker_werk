import "server-only";
import { assertPublicHttpsUrl } from "@/lib/ssrf";
import { AppError } from "../../errors";
import type { IntegrationProviderImpl, NormalizedHours } from "../types";

async function get(s: { config: Record<string, string>; credentials: Record<string, string> }, params: Record<string, string>) {
  const url = await assertPublicHttpsUrl(s.config.apiUrl);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { "x-api-key": s.credentials.apiKey ?? "", accept: "application/json" },
    redirect: "error", // a redirect could bounce us to an internal address
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new AppError(502, "INTEGRATION_ERROR", `API responded ${res.status}`);
  return res.json() as Promise<unknown>;
}

/** Expects a JSON array (or { data: [] }) of rows; field names are configurable. */
export const customApiProvider: IntegrationProviderImpl = {
  async testConnection(s) {
    await get(s, { limit: "1" });
  },
  async fetchHours(s, { from, to }) {
    const body = (await get(s, {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    })) as unknown;
    const list = (Array.isArray(body) ? body : (body as { data?: unknown[] })?.data ?? []) as Record<string, unknown>[];
    const k = {
      emp: s.config.employeeKey || "employee_number",
      date: s.config.dateKey || "date",
      hours: s.config.hoursKey || "hours",
      id: s.config.idKey || "id",
    };
    const out: NormalizedHours[] = [];
    for (const row of list) {
      const hours = Number(row[k.hours]);
      const date = String(row[k.date] ?? "").slice(0, 10);
      if (!Number.isFinite(hours) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || row[k.emp] == null) continue;
      const emp = String(row[k.emp]);
      out.push({
        externalRecordId: String(row[k.id] ?? `${emp}:${date}`),
        externalEmployeeRef: emp,
        workDate: date,
        hours,
        raw: row,
      });
    }
    return out;
  },
};
