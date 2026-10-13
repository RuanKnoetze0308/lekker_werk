import { payrollSettingsSchema } from "@/lib/schemas/settings";
import { requireApiContext } from "@/server/auth/guards";
import { getSettings, updatePayrollSettings } from "@/server/services/company.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("settings:manage");
  return ok((await getSettings(ctx.companyId)).payroll);
});

export const PUT = route(async (req) => {
  const ctx = await requireApiContext("settings:manage");
  await updatePayrollSettings(ctx, await parseBody(req, payrollSettingsSchema));
  return ok({ updated: true });
});
