import "server-only";
import type { ProviderId } from "@/lib/integration-catalog";
import { AppError } from "../errors";
import { bridgeConfigured, bridgeProvider } from "./bridge";
import { customApiProvider } from "./providers/custom-api";
import { odooProvider } from "./providers/odoo";
import type { IntegrationProviderImpl } from "./types";

/**
 * Connectors written in this codebase. To add one:
 *   1. copy providers/_template.ts to providers/<name>.ts and fill in the three functions
 *   2. add it here
 * That's all: the Integrations page shows it as "Available", the connect form already has its
 * fields (lib/integration-catalog.ts), and sync / payroll push pick it up.
 *
 * Anything NOT listed here is sent to your own integration backend when INTEGRATION_BRIDGE_URL
 * is set (see bridge.ts), and is "Coming soon" otherwise.
 */
const native: Partial<Record<ProviderId, IntegrationProviderImpl>> = {
  CUSTOM_API: customApiProvider,
  ODOO: odooProvider,
  // SAGE: sageProvider,
  // XERO: xeroProvider,
  // QUICKBOOKS: quickbooksProvider,
  // SIMPLEPAY: simplepayProvider,
  // PAYSPACE: payspaceProvider,
  // SYSPRO: sysproProvider,
};

const notImplemented = (name: string): IntegrationProviderImpl => ({
  async testConnection() {
    throw new AppError(501, "NOT_IMPLEMENTED", `The ${name} connector is not available yet.`);
  },
});

export type ProviderSource = "native" | "bridge" | "none";

/** Where a provider's calls go right now. */
export function providerSource(provider: ProviderId): ProviderSource {
  if (native[provider]) return "native";
  return bridgeConfigured() ? "bridge" : "none";
}

export function getProvider(provider: ProviderId): IntegrationProviderImpl {
  return native[provider] ?? (bridgeConfigured() ? bridgeProvider(provider) : notImplemented(provider));
}

/** What the UI needs to know about a provider, without exposing the implementation. */
export function providerCapabilities(provider: ProviderId) {
  const impl = getProvider(provider);
  const source = providerSource(provider);
  return {
    available: source !== "none",
    source,
    canImport: source !== "none" && typeof impl.fetchHours === "function",
    canExport: source !== "none" && typeof impl.pushHours === "function",
  };
}
