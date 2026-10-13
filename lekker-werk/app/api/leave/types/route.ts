import { leaveTypeSchema } from "@/lib/schemas/time";
import { requireApiContext } from "@/server/auth/guards";
import { listLeaveTypes, saveLeaveType } from "@/server/time/leave.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async (req) => {
  const ctx = await requireApiContext("attendance:read");
  return ok(await listLeaveTypes(ctx, { includeInactive: req.nextUrl.searchParams.get("all") === "1" }));
});

export const POST = route(async (req) => {
  const ctx = await requireApiContext("settings:manage");
  return ok(await saveLeaveType(ctx, await parseBody(req, leaveTypeSchema)), { status: 201 });
});
