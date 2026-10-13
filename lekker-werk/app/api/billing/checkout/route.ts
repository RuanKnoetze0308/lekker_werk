import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { startCheckout } from "@/server/billing/billing.service";
import { ok, parseBody, route } from "@/server/http/route";

const body = z.object({
  plan: z.enum(["STARTER", "GROWTH", "BUSINESS"]),
  interval: z.enum(["MONTHLY", "YEARLY"]),
  channel: z.enum(["TELEGRAM", "WHATSAPP"]),
});

/** Returns the signed PayFast form fields; the browser then POSTs them to PayFast. */
export const POST = route(
  async (req) => {
    // allowLocked: an expired company must still be able to pay.
    const ctx = await requireApiContext("settings:manage", { allowLocked: true });
    return ok(await startCheckout(ctx, await parseBody(req, body)));
  },
  { limit: 20 },
);
