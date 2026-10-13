import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { setEmployeeActive } from "@/server/services/employee.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("employees:write");
  const { active } = await parseBody(req, z.object({ active: z.boolean() }));
  await setEmployeeActive(ctx, z.uuid().parse((await params).id), active);
  return ok({ updated: true });
});
