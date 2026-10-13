import { channelConfigSchema } from "@/lib/schemas/settings";
import { requireApiContext } from "@/server/auth/guards";
import { configureChannel, listChannels } from "@/server/services/company.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("settings:manage");
  return ok(await listChannels(ctx));
});

export const PUT = route(async (req) => {
  const ctx = await requireApiContext("settings:manage");
  await configureChannel(ctx, await parseBody(req, channelConfigSchema));
  return ok({ updated: true });
});
