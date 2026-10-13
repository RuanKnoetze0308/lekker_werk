import { scheduleSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { createSchedule, listSchedules } from "@/server/services/schedule.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("schedules:manage");
  return ok(await listSchedules(ctx));
});

export const POST = route(async (req) => {
  const ctx = await requireApiContext("schedules:manage");
  return ok(await createSchedule(ctx, await parseBody(req, scheduleSchema)), { status: 201 });
});
