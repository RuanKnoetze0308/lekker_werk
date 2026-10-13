import { employeeListQuery, employeeSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { createEmployee, listEmployees } from "@/server/services/employee.service";
import { ok, parseBody, parseQuery, route } from "@/server/http/route";

export const GET = route(async (req) => {
  const ctx = await requireApiContext("employees:read");
  return ok(await listEmployees(ctx, parseQuery(req, employeeListQuery)));
});

export const POST = route(async (req) => {
  const ctx = await requireApiContext("employees:write");
  const emp = await createEmployee(ctx, await parseBody(req, employeeSchema));
  return ok({ id: emp.id }, { status: 201 });
});
