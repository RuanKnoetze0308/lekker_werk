import { z } from "zod";
import { integrationSchema } from "@/lib/schemas/settings";
import { requireApiContext } from "@/server/auth/guards";
import { disconnectIntegration, saveIntegration } from "@/server/services/integration.service";
import { ok, parseBody, route } from "@/server/http/route";

type P = { id: string };

export const PUT = route<P>(async (req, { params }) => {
  const ctx = await requireApiContext("integrations:manage");
  const id = await saveIntegration(ctx, await parseBody(req, integrationSchema), z.uuid().parse((await params).id));
  return ok({ id });
});

export const DELETE = route<P>(async (_req, { params }) => {
  const ctx = await requireApiContext("integrations:manage");
  await disconnectIntegration(ctx, z.uuid().parse((await params).id));
  return ok({ disconnected: true });
});
