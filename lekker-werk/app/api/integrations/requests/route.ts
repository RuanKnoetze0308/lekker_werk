import { integrationRequestSchema } from "@/lib/schemas/settings";
import { requireApiContext } from "@/server/auth/guards";
import { createIntegrationRequest, listIntegrationRequests } from "@/server/services/integration-request.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("integrations:manage");
  return ok(await listIntegrationRequests(ctx));
});

export const POST = route(async (req) => {
  const ctx = await requireApiContext("integrations:manage");
  return ok(await createIntegrationRequest(ctx, await parseBody(req, integrationRequestSchema)), { status: 201 });
});
