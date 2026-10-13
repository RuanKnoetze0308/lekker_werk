import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { leaveBalances } from "@/server/time/leave.service";
import { ok, parseQuery, route } from "@/server/http/route";

export const GET = route(async (req) => {
  const ctx = await requireApiContext("attendance:read");
  const { employeeId } = parseQuery(req, z.object({ employeeId: z.uuid().optional() }));
  return ok(await leaveBalances(ctx, employeeId));
});
