import { z } from "zod";
import { leaveTypeSchema } from "@/lib/schemas/time";
import { requireApiContext } from "@/server/auth/guards";
import { saveLeaveType } from "@/server/time/leave.service";
import { ok, parseBody, route } from "@/server/http/route";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("settings:manage");
  return ok(await saveLeaveType(ctx, await parseBody(req, leaveTypeSchema), z.uuid().parse((await params).id)));
});
