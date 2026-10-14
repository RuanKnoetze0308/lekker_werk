import { requirePlatformApi } from "@/server/auth/guards";
import { listAllShopOrders } from "@/server/services/shop.service";
import { ok, route } from "@/server/http/route";

export const GET = route(async () => {
  const { ctx } = await requirePlatformApi();
  return ok(await listAllShopOrders(ctx));
});
