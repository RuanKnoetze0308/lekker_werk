import { z } from "zod";
import { requirePlatformApi } from "@/server/auth/guards";
import { getTenant } from "@/server/services/platform.service";
import { ok, route } from "@/server/http/route";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const { ctx } = await requirePlatformApi();
  return ok(await getTenant(ctx, z.uuid().parse((await params).id)));
});
