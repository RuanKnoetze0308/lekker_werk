import { leaveAdjustmentSchema } from "@/lib/schemas/time";
import { requireApiContext } from "@/server/auth/guards";
import { adjustLeaveBalance } from "@/server/time/leave.service";
import { ok, parseBody, route } from "@/server/http/route";

/** Opening balances (from the old system) and one-off corrections. */
export const POST = route(async (req) => {
  const ctx = await requireApiContext("leave:approve");
  await adjustLeaveBalance(ctx, await parseBody(req, leaveAdjustmentSchema));
  return ok({ adjusted: true }, { status: 201 });
});
