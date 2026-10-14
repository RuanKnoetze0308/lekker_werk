import { shopProductSchema } from "@/lib/schemas/shop";
import { requirePlatformApi } from "@/server/auth/guards";
import { createShopProduct, listAllShopProducts } from "@/server/services/shop.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const { ctx } = await requirePlatformApi();
  return ok(await listAllShopProducts(ctx));
});

export const POST = route(async (req) => {
  const { ctx } = await requirePlatformApi();
  return ok(await createShopProduct(ctx, await parseBody(req, shopProductSchema)), { status: 201 });
});
