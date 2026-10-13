export type Role = "SUPER_ADMIN" | "COMPANY_ADMIN" | "MANAGER" | "EMPLOYEE";

export const PERMISSIONS = [
  "dashboard:view",
  "employees:read",
  "employees:write",
  "attendance:read",
  "attendance:correct",
  "schedules:manage",
  "locations:read",
  "locations:write",
  "qr:manage",
  "devices:manage",
  "integrations:manage",
  "reports:read",
  "settings:manage",
  "users:manage",
  "audit:read",
  "platform:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const manager: Permission[] = [
  "dashboard:view",
  "employees:read",
  "employees:write",
  "attendance:read",
  "attendance:correct",
  "schedules:manage",
  "locations:read",
  "qr:manage",
  "reports:read",
];

const companyAdmin: Permission[] = [
  ...manager,
  "locations:write",
  "devices:manage",
  "integrations:manage",
  "settings:manage",
  "users:manage",
  "audit:read",
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set<Permission>([...companyAdmin, "platform:manage"]),
  COMPANY_ADMIN: new Set(companyAdmin),
  MANAGER: new Set(manager),
  EMPLOYEE: new Set<Permission>([]),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}
