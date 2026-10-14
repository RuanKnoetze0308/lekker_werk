import { requireApiContext } from "@/server/auth/guards";
import { listShopProducts } from "@/server/services/shop.service";
import { ok, route } from "@/server/http/route";

/** Hardware catalogue (active products) for Devices → Buy hardware. */
export const GET = route(async () => {
  const ctx = await requireApiContext("devices:manage");
  return ok(await listShopProducts(ctx));
});
