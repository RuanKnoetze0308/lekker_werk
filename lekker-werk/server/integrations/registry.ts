import "server-only";
import { AppError } from "../errors";
import { customApiProvider } from "./providers/custom-api";
import { odooProvider } from "./providers/odoo";
import type { IntegrationProviderImpl } from "./types";

const notImplemented = (name: string): IntegrationProviderImpl => ({
  async testConnection() {
    throw new AppError(501, "NOT_IMPLEMENTED", `${name} connector is not available yet.`);
  },
  async fetchHours() {
    throw new AppError(501, "NOT_IMPLEMENTED", `${name} connector is not available yet.`);
  },
});

/** Adding an ERP = write a provider implementing IntegrationProviderImpl and register it here. */
export const providers: Record<string, IntegrationProviderImpl> = {
  CUSTOM_API: customApiProvider,
  ODOO: odooProvider,
  SYSPRO: notImplemented("Syspro"),
  SAGE: notImplemented("Sage"),
  XERO: notImplemented("Xero"),
  QUICKBOOKS: notImplemented("QuickBooks"),
  SIMPLEPAY: notImplemented("SimplePay"),
  PAYSPACE: notImplemented("PaySpace"),
};
