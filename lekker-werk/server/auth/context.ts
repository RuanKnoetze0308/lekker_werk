import { Errors } from "../errors";
import type { BillingAccess } from "../billing/access";
import { can, type Permission, type Role } from "./permissions";

/**
 * Resolved server-side for every request. Services take this instead of raw ids from the
 * client: companyId and location scope always come from the session, never from the request.
 */
export interface AuthContext {
  userId: string;
  companyId: string;
  role: Role;
  name: string;
  email: string;
  /** null = every location in the company. Managers are limited to assigned locations. */
  locationScope: string[] | null;
  /** SUPER_ADMIN viewing another tenant through the System portal (companyId is that tenant). */
  impersonating?: boolean;
  /** Trial / subscription state, resolved with the session so every request can enforce it. */
  billing: BillingAccess;
}

export function assertCan(ctx: AuthContext, permission: Permission) {
  if (!can(ctx.role, permission)) throw Errors.forbidden();
}

export function canAccessLocation(ctx: AuthContext, locationId: string): boolean {
  return ctx.locationScope === null || ctx.locationScope.includes(locationId);
}

export function assertLocationAccess(ctx: AuthContext, locationId: string) {
  if (!canAccessLocation(ctx, locationId)) throw Errors.forbidden("No access to this location.");
}
