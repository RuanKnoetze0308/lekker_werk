import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { cancelLeave } from "@/server/time/leave.service";
import { ok, route } from "@/server/http/route";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireApiContext("leave:approve");
  await cancelLeave(ctx, z.uuid().parse((await params).id));
  return ok({ cancelled: true });
});
