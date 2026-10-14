import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { resolveSession } from "./session";
import { assertCan, type AuthContext } from "./context";
import type { Permission } from "./permissions";
import { can } from "./permissions";
import { AppError, Errors } from "../errors";

export const getSession = cache(resolveSession);

/** For server components / pages: redirects to the login modal if not signed in. */
export async function requirePageContext(permission?: Permission): Promise<AuthContext> {
  const session = await getSession();
  if (!session) redirect("/#login");
  if (permission && !can(session.ctx.role, permission)) redirect("/dashboard");
  return session.ctx;
}

/**
 * System portal pages. Anyone who isn't a super admin gets a plain 404, so the portal's
 * existence isn't advertised.
 */
export async function requirePlatformPage() {
  const session = await getSession();
  if (!session) redirect("/#login");
  if (session.ctx.role !== "SUPER_ADMIN") notFound();
  return session;
}

/** System portal API routes: 404 for everyone but super admins. Never blocked by billing. */
export async function requirePlatformApi() {
  const session = await getSession();
  if (!session) throw Errors.unauthenticated();
  if (session.ctx.role !== "SUPER_ADMIN") throw Errors.notFound();
  return session;
}

/**
 * For API routes: throws AppError instead of redirecting.
 * When the trial/subscription has lapsed every route is blocked (402) except those that opt in
 * with `allowLocked` (billing itself), so the customer can always get to the payment screen.
 */
export async function requireApiContext(
  permission?: Permission,
  opts: { allowLocked?: boolean } = {},
): Promise<AuthContext> {
  const session = await getSession();
  if (!session) throw Errors.unauthenticated();
  if (permission) assertCan(session.ctx, permission);
  // Platform operators must be able to help a tenant whose subscription has lapsed.
  if (session.ctx.billing.locked && !opts.allowLocked && session.ctx.role !== "SUPER_ADMIN") {
    throw new AppError(402, "SUBSCRIPTION_REQUIRED", "Your free trial or subscription has ended. Choose a plan under Billing to continue.");
  }
  return session.ctx;
}
