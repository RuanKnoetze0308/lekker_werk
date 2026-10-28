import { requirePlatformApi } from "@/server/auth/guards";
import { beginTwoStepSetup, twoStepStatus } from "@/server/services/two-step.service";
import { ok, route } from "@/server/http/route";

export const GET = route(async () => {
  const { ctx } = await requirePlatformApi();
  return ok(await twoStepStatus(ctx));
});

/** Starts setup: a new (inactive) secret and its QR code. */
export const POST = route(
  async () => {
    const { ctx } = await requirePlatformApi();
    return ok(await beginTwoStepSetup(ctx));
  },
  { limit: 10 },
);
