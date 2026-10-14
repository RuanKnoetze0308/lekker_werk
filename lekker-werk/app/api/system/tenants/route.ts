import { requirePlatformApi } from "@/server/auth/guards";
import { listTenants } from "@/server/services/platform.service";
import { ok, route } from "@/server/http/route";

/** System portal: search tenants by company / contact name or email. Super admins only (404 otherwise). */
export const GET = route(async (req) => {
  const { ctx } = await requirePlatformApi();
  return ok(await listTenants(ctx, (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100)));
});
