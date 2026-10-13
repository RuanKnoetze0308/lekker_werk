import { z } from "zod";
import { leaveDecisionSchema } from "@/lib/schemas/time";
import { requireApiContext } from "@/server/auth/guards";
import { decideLeave } from "@/server/time/leave.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("leave:approve");
  await decideLeave(ctx, z.uuid().parse((await params).id), await parseBody(req, leaveDecisionSchema));
  return ok({ decided: true });
});
