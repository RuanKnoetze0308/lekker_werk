import { z } from "zod";
import { requirePlatformApi } from "@/server/auth/guards";
import { enterTenant, exitTenant } from "@/server/services/platform.service";
import { ok, parseBody, route } from "@/server/http/route";

/**
 * Switch the current session into a tenant ({ companyId }) or back to your own ({ companyId: null }).
 * The tenant is stored on the session row; it is never taken from later requests.
 */
export const POST = route(async (req) => {
  const { ctx, sessionId } = await requirePlatformApi();
  const { companyId } = await parseBody(req, z.object({ companyId: z.uuid().nullable() }));
  if (companyId) {
    const company = await enterTenant(ctx, sessionId, companyId);
    return ok({ redirect: "/dashboard", tenant: company.name });
  }
  await exitTenant(ctx, sessionId);
  return ok({ redirect: "/system" });
}, { limit: 30 });
