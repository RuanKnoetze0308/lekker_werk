import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { pushPayPeriod } from "@/server/services/integration.service";
import { ok, parseBody, route } from "@/server/http/route";

const bodySchema = z.object({ integrationId: z.uuid() });

/** Sends a locked pay period to a connected payroll / accounting system. Calls an external API, so it's rate limited. */
export const POST = route<{ id: string }>(
  async (req, { params }) => {
    const ctx = await requireApiContext("payroll:manage");
    const { integrationId } = await parseBody(req, bodySchema);
    return ok(await pushPayPeriod(ctx, z.uuid().parse((await params).id), integrationId));
  },
  { limit: 10 },
);
