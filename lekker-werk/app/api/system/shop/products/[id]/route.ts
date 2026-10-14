import { z } from "zod";
import { shopProductSchema } from "@/lib/schemas/shop";
import { requirePlatformApi } from "@/server/auth/guards";
import { updateShopProduct } from "@/server/services/shop.service";
import { ok, parseBody, route } from "@/server/http/route";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const { ctx } = await requirePlatformApi();
  return ok(await updateShopProduct(ctx, z.uuid().parse((await params).id), await parseBody(req, shopProductSchema)));
});
