import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { testIntegration } from "@/server/services/integration.service";
import { ok, route } from "@/server/http/route";

export const POST = route<{ id: string }>(
  async (_req, { params }) => {
    const ctx = await requireApiContext("integrations:manage");
    await testIntegration(ctx, z.uuid().parse((await params).id));
    return ok({ connected: true });
  },
  { limit: 10 },
);
