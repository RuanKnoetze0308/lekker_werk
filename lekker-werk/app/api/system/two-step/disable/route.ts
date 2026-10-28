import { z } from "zod";
import { requirePlatformApi } from "@/server/auth/guards";
import { disableTwoStep } from "@/server/services/two-step.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route(
  async (req) => {
    const { ctx } = await requirePlatformApi();
    const { code } = await parseBody(req, z.object({ code: z.string().trim().min(6).max(20) }));
    await disableTwoStep(ctx, code);
    return ok({ disabled: true });
  },
  { limit: 10 },
);
