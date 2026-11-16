import "server-only";
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { AppError } from "../errors";
import type { HoursExport, IntegrationProviderImpl, NormalizedHours, ProviderSettings, PushResult } from "./types";

/**
 * The integration bridge: instead of writing a connector in this codebase, point LekkerWerk at
 * your own backend (for example a .NET API) and build the connectors there.
 *
 *   INTEGRATION_BRIDGE_URL=https://integrations.example.com
 *   INTEGRATION_BRIDGE_SECRET=<32+ random characters, same value on both sides>
 *
 * Every provider that has no native connector in registry.ts is then routed to:
 *
 *   POST {url}/v1/{provider}/test            body { config, credentials }
 *   POST {url}/v1/{provider}/hours/import    body { config, credentials, from, to }      -> { records: NormalizedHours[] }
 *   POST {url}/v1/{provider}/hours/export    body { config, credentials, export }        -> { accepted, reference? }
 *
 * `{provider}` is lower-case: sage, xero, quickbooks, simplepay, payspace, syspro.
 * Every request is signed (see signBridgeRequest); the backend must verify the signature and
 * reject timestamps older than 5 minutes. Full contract and a C# sample: docs/INTEGRATIONS.md.
 */

export const BRIDGE_TIMEOUT_MS = 30_000;

/** HMAC-SHA256 over "<unix seconds>.<raw body>", hex encoded. Pure, so both sides can test it. */
export function signBridgeRequest(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function bridgeConfigured(): boolean {
  const { url, secret } = env.integrationBridge;
  return Boolean(url && secret);
}

function bridgeBase(): URL {
  const { url, secret } = env.integrationBridge;
  if (!url || !secret) throw new AppError(501, "NOT_IMPLEMENTED", "This connector is not available yet.");
  let base: URL;
  try {
    base = new URL(url);
  } catch {
    throw new AppError(503, "SERVER_MISCONFIGURED", "INTEGRATION_BRIDGE_URL is not a valid URL.");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  // Customer credentials travel in the body, so production must be https. Plain http is for a
  // backend running on your own machine during development only.
  if (base.protocol !== "https:" && !(base.protocol === "http:" && local && !env.isProd)) {
    throw new AppError(503, "SERVER_MISCONFIGURED", "INTEGRATION_BRIDGE_URL must use https.");
  }
  if (secret.length < 32) throw new AppError(503, "SERVER_MISCONFIGURED", "INTEGRATION_BRIDGE_SECRET must be at least 32 characters.");
  return base;
}

async function call<T>(provider: string, path: string, payload: Record<string, unknown>): Promise<T> {
  const base = bridgeBase();
  const url = new URL(`${base.pathname.replace(/\/$/, "")}/v1/${provider.toLowerCase()}/${path}`, base);
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-lekkerwerk-timestamp": timestamp,
        "x-lekkerwerk-signature": `sha256=${signBridgeRequest(env.integrationBridge.secret, timestamp, body)}`,
      },
      body,
      redirect: "error",
      signal: AbortSignal.timeout(BRIDGE_TIMEOUT_MS),
    });
  } catch {
    throw new AppError(502, "INTEGRATION_ERROR", "The integration backend could not be reached.");
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* handled below */
  }
  if (!res.ok) {
    // The backend's own message (e.g. "Sage rejected the API key") is the useful part for the customer.
    const message = (json as { message?: unknown; error?: unknown } | null)?.message ?? (json as { error?: unknown } | null)?.error;
    const status = res.status === 401 || res.status === 403 ? 401 : 502;
    throw new AppError(
      status,
      status === 401 ? "INTEGRATION_AUTH" : "INTEGRATION_ERROR",
      typeof message === "string" && message ? message.slice(0, 300) : `The integration backend responded ${res.status}.`,
    );
  }
  return json as T;
}

/** A provider whose three operations are forwarded to the bridge backend. */
export function bridgeProvider(provider: string): IntegrationProviderImpl {
  return {
    async testConnection(s: ProviderSettings) {
      await call(provider, "test", { config: s.config, credentials: s.credentials });
    },
    async fetchHours(s, { from, to }) {
      const out = await call<{ records?: unknown }>(provider, "hours/import", {
        config: s.config,
        credentials: s.credentials,
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const list = Array.isArray(out?.records) ? (out.records as Record<string, unknown>[]) : [];
      const rows: NormalizedHours[] = [];
      // Never trust the shape blindly: skip rows that would corrupt imported_hours.
      for (const r of list) {
        const hours = Number(r.hours);
        const workDate = String(r.workDate ?? "").slice(0, 10);
        if (!Number.isFinite(hours) || hours < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate) || r.externalEmployeeRef == null) continue;
        const emp = String(r.externalEmployeeRef);
        rows.push({
          externalRecordId: String(r.externalRecordId ?? `${emp}:${workDate}`),
          externalEmployeeRef: emp,
          workDate,
          hours,
          raw: typeof r.raw === "object" && r.raw !== null ? (r.raw as Record<string, unknown>) : undefined,
        });
      }
      return rows;
    },
    async pushHours(s, payload: HoursExport): Promise<PushResult> {
      const out = await call<{ accepted?: unknown; reference?: unknown }>(provider, "hours/export", {
        config: s.config,
        credentials: s.credentials,
        export: payload,
      });
      const accepted = Number(out?.accepted);
      return {
        accepted: Number.isFinite(accepted) ? accepted : payload.lines.length,
        reference: typeof out?.reference === "string" ? out.reference.slice(0, 200) : undefined,
      };
    },
  };
}
