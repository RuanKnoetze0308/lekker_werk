import { z } from "zod";
import { scheduleSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { updateSchedule } from "@/server/services/schedule.service";
import { ok, parseBody, route } from "@/server/http/route";

export const PUT = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("schedules:manage");
  await updateSchedule(ctx, z.uuid().parse((await params).id), await parseBody(req, scheduleSchema));
  return ok({ updated: true });
});
