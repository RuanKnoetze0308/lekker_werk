import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
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
  if (session.ctx.billing.locked && !opts.allowLocked) {
    throw new AppError(402, "SUBSCRIPTION_REQUIRED", "Your free trial or subscription has ended. Choose a plan under Billing to continue.");
  }
  return session.ctx;
}
