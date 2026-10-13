import { employeePermissionsSchema } from "@/lib/schemas/settings";
import { requireApiContext } from "@/server/auth/guards";
import {
  getEmployeeDataPermissions,
  updateEmployeeDataPermissions,
} from "@/server/services/company.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("settings:manage");
  return ok(await getEmployeeDataPermissions(ctx.companyId));
});

export const PUT = route(async (req) => {
  const ctx = await requireApiContext("settings:manage");
  const { permissions } = await parseBody(req, employeePermissionsSchema);
  await updateEmployeeDataPermissions(ctx, permissions);
  return ok({ updated: true });
});
