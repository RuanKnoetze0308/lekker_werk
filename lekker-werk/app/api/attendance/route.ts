import { attendanceQuery } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { listAttendance } from "@/server/services/attendance.service";
import { ok, parseQuery, route } from "@/server/http/route";

export const GET = route(async (req) => {
  const ctx = await requireApiContext("attendance:read");
  return ok(await listAttendance(ctx, parseQuery(req, attendanceQuery)));
});
