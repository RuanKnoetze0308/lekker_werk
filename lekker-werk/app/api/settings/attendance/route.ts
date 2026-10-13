import { attendanceSettingsSchema } from "@/lib/schemas/settings";
import { requireApiContext } from "@/server/auth/guards";
import { getSettings, updateAttendanceSettings } from "@/server/services/company.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("settings:manage");
  return ok((await getSettings(ctx.companyId)).attendance);
});

export const PUT = route(async (req) => {
  const ctx = await requireApiContext("settings:manage");
  await updateAttendanceSettings(ctx, await parseBody(req, attendanceSettingsSchema));
  return ok({ updated: true });
});
