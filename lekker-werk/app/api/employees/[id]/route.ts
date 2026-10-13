import { z } from "zod";
import { employeeUpdateSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { getEmployee, updateEmployee } from "@/server/services/employee.service";
import { ok, parseBody, route } from "@/server/http/route";

type P = { id: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireApiContext("employees:read");
  return ok(await getEmployee(ctx, z.uuid().parse((await params).id)));
});

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await requireApiContext("employees:write");
  const emp = await updateEmployee(ctx, z.uuid().parse((await params).id), await parseBody(req, employeeUpdateSchema));
  return ok({ id: emp.id });
});
