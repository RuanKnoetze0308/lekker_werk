import { shopOrderSchema } from "@/lib/schemas/shop";
import { requireApiContext } from "@/server/auth/guards";
import { createShopOrder, listShopOrders } from "@/server/services/shop.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("devices:manage");
  return ok(await listShopOrders(ctx));
});

/** Places an order at catalogue prices; returns the signed PayFast form ({ action, fields }) to post. */
export const POST = route(
  async (req) => {
    const ctx = await requireApiContext("devices:manage");
    return ok(await createShopOrder(ctx, await parseBody(req, shopOrderSchema)), { status: 201 });
  },
  { limit: 20 },
);
