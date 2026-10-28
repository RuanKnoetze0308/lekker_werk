import { z } from "zod";
import { requirePlatformApi } from "@/server/auth/guards";
import { enableTwoStep } from "@/server/services/two-step.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route(
  async (req) => {
    const { ctx } = await requirePlatformApi();
    const { code } = await parseBody(req, z.object({ code: z.string().trim().min(6).max(10) }));
    return ok(await enableTwoStep(ctx, code));
  },
  { limit: 10 },
);
