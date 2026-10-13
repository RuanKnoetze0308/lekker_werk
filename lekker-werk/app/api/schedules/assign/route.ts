import { assignScheduleSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { assignSchedule } from "@/server/services/schedule.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route(async (req) => {
  const ctx = await requireApiContext("schedules:manage");
  await assignSchedule(ctx, await parseBody(req, assignScheduleSchema));
  return ok({ assigned: true }, { status: 201 });
});
