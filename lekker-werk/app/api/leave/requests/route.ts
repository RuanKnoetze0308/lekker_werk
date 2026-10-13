import { z } from "zod";
import { leaveRequestSchema } from "@/lib/schemas/time";
import { requireApiContext } from "@/server/auth/guards";
import { listLeaveRequests, requestLeaveAsManager } from "@/server/time/leave.service";
import { ok, parseBody, parseQuery, route } from "@/server/http/route";

const query = z.object({
  status: z.enum(["REQUESTED", "APPROVED", "DECLINED", "CANCELLED"]).optional(),
  employeeId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const GET = route(async (req) => {
  const ctx = await requireApiContext("attendance:read");
  return ok(await listLeaveRequests(ctx, parseQuery(req, query)));
});

/** Manager records leave for an employee; `approve: true` approves it in the same step. */
export const POST = route(async (req) => {
  const ctx = await requireApiContext("leave:approve");
  return ok(await requestLeaveAsManager(ctx, await parseBody(req, leaveRequestSchema)), { status: 201 });
});
