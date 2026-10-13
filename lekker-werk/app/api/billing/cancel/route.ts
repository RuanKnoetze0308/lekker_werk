import { requireApiContext } from "@/server/auth/guards";
import { cancelSubscription } from "@/server/billing/billing.service";
import { ok, route } from "@/server/http/route";

export const POST = route(
  async () => {
    const ctx = await requireApiContext("settings:manage", { allowLocked: true });
    await cancelSubscription(ctx);
    return ok({ cancelled: true });
  },
  { limit: 10 },
);
