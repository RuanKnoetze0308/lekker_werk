import { companyUpdateSchema } from "@/lib/schemas/settings";
import { requireApiContext } from "@/server/auth/guards";
import { getCompany, updateCompany } from "@/server/services/company.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("dashboard:view");
  return ok(await getCompany(ctx));
});

export const PATCH = route(async (req) => {
  const ctx = await requireApiContext("settings:manage");
  await updateCompany(ctx, await parseBody(req, companyUpdateSchema));
  return ok({ updated: true });
});
