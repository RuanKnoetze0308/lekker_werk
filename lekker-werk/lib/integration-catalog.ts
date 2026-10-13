// UI-safe metadata (no secrets, no server imports). Drives the Integrations settings forms.

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  secret?: boolean;
  required?: boolean;
}

export type ProviderId = "CUSTOM_API" | "SYSPRO" | "ODOO" | "SAGE" | "XERO" | "QUICKBOOKS" | "SIMPLEPAY" | "PAYSPACE";

export interface ProviderMeta {
  provider: ProviderId;
  label: string;
  description: string;
  categories: ("ERP" | "ACCOUNTING" | "PAYROLL" | "HR")[];
  /** What flows where once built: hours out to payroll, or hours in from an ERP. */
  direction: "EXPORT_HOURS" | "IMPORT_HOURS";
  /** Among the five most used by South African SMEs (Oct 2026 survey of local sources). */
  saTop5: boolean;
  implemented: boolean;
  configFields: FieldDef[];
  credentialFields: FieldDef[];
}

export const PROVIDER_CATALOG: ProviderMeta[] = [
  {
    provider: "SAGE",
    label: "Sage",
    description: "Sage Business Cloud Accounting & Sage Payroll. The most widely used in South Africa.",
    categories: ["ACCOUNTING", "PAYROLL"],
    direction: "EXPORT_HOURS",
    saTop5: true,
    implemented: false,
    configFields: [{ key: "tenant", label: "Business id", required: true }],
    credentialFields: [{ key: "apiKey", label: "API key", secret: true, required: true }],
  },
  {
    provider: "XERO",
    label: "Xero",
    description: "Cloud accounting favoured by local accountants. Timesheets feed Xero Payroll.",
    categories: ["ACCOUNTING", "PAYROLL"],
    direction: "EXPORT_HOURS",
    saTop5: true,
    implemented: false,
    configFields: [{ key: "tenant", label: "Tenant id", required: true }],
    credentialFields: [
      { key: "clientId", label: "Client id", required: true },
      { key: "clientSecret", label: "Client secret", secret: true, required: true },
    ],
  },
  {
    provider: "QUICKBOOKS",
    label: "QuickBooks Online",
    description: "Intuit's cloud accounting, with time activities per employee.",
    categories: ["ACCOUNTING", "PAYROLL"],
    direction: "EXPORT_HOURS",
    saTop5: true,
    implemented: false,
    configFields: [{ key: "realmId", label: "Realm / company id", required: true }],
    credentialFields: [
      { key: "clientId", label: "Client id", required: true },
      { key: "clientSecret", label: "Client secret", secret: true, required: true },
    ],
  },
  {
    provider: "SIMPLEPAY",
    label: "SimplePay",
    description: "South African cloud payroll built for small businesses. Hours become pay-run inputs.",
    categories: ["PAYROLL"],
    direction: "EXPORT_HOURS",
    saTop5: true,
    implemented: false,
    configFields: [{ key: "clientId", label: "SimplePay client id", required: true }],
    credentialFields: [{ key: "apiKey", label: "API key", secret: true, required: true }],
  },
  {
    provider: "PAYSPACE",
    label: "PaySpace",
    description: "Payroll & HR across 40+ African countries. Popular with growing SA companies.",
    categories: ["PAYROLL", "HR"],
    direction: "EXPORT_HOURS",
    saTop5: true,
    implemented: false,
    configFields: [{ key: "companyId", label: "Company id", required: true }],
    credentialFields: [
      { key: "clientId", label: "Client id", required: true },
      { key: "clientSecret", label: "Client secret", secret: true, required: true },
    ],
  },
  {
    provider: "SYSPRO",
    label: "Syspro",
    description: "South African-built ERP used by manufacturers and distributors.",
    categories: ["ERP", "PAYROLL"],
    direction: "IMPORT_HOURS",
    saTop5: false,
    implemented: false,
    configFields: [
      { key: "apiUrl", label: "e.net / REST URL", required: true },
      { key: "company", label: "Company ID", required: true },
      { key: "username", label: "Operator", required: true },
    ],
    credentialFields: [{ key: "password", label: "Password", secret: true, required: true }],
  },
  {
    provider: "ODOO",
    label: "Odoo",
    description: "Open-source ERP. Imports hours from Odoo Attendance.",
    categories: ["ERP", "HR"],
    direction: "IMPORT_HOURS",
    saTop5: false,
    implemented: true,
    configFields: [
      { key: "apiUrl", label: "Odoo URL", placeholder: "https://mycompany.odoo.com", required: true },
      { key: "database", label: "Database", required: true },
      { key: "username", label: "Username", required: true },
    ],
    credentialFields: [{ key: "password", label: "Password / API key", secret: true, required: true }],
  },
  {
    provider: "CUSTOM_API",
    label: "Custom API",
    description: "Any system with a REST endpoint that returns hours as JSON.",
    categories: ["ERP", "ACCOUNTING", "PAYROLL", "HR"],
    direction: "IMPORT_HOURS",
    saTop5: false,
    implemented: true,
    configFields: [
      { key: "apiUrl", label: "API URL (https)", placeholder: "https://erp.example.com/api/hours", required: true },
      { key: "employeeKey", label: "Employee field name", placeholder: "employee_number" },
      { key: "dateKey", label: "Date field name", placeholder: "date" },
      { key: "hoursKey", label: "Hours field name", placeholder: "hours" },
      { key: "idKey", label: "Record id field name", placeholder: "id" },
    ],
    credentialFields: [{ key: "apiKey", label: "API key", secret: true, required: true }],
  },
];

export const catalogByProvider = Object.fromEntries(PROVIDER_CATALOG.map((p) => [p.provider, p])) as Record<
  ProviderId,
  ProviderMeta
>;
