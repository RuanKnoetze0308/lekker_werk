import { integrationSchema } from "@/lib/schemas/settings";
import { requireApiContext } from "@/server/auth/guards";
import { listIntegrations, saveIntegration } from "@/server/services/integration.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("integrations:manage");
  return ok(await listIntegrations(ctx));
});

export const POST = route(async (req) => {
  const ctx = await requireApiContext("integrations:manage");
  const id = await saveIntegration(ctx, await parseBody(req, integrationSchema));
  return ok({ id }, { status: 201 });
});
