import { z } from "zod";
import { shopOrderUpdateSchema } from "@/lib/schemas/shop";
import { requirePlatformApi } from "@/server/auth/guards";
import { updateShopOrder } from "@/server/services/shop.service";
import { ok, parseBody, route } from "@/server/http/route";

/** Fulfilment status: PAID (manual, e.g. EFT), SHIPPED (with tracking note) or CANCELLED. */
export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const { ctx } = await requirePlatformApi();
  await updateShopOrder(ctx, z.uuid().parse((await params).id), await parseBody(req, shopOrderUpdateSchema));
  return ok({ updated: true });
});
