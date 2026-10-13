import { requireApiContext } from "@/server/auth/guards";
import { listPayPeriods } from "@/server/time/payroll.service";
import { ok, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("payroll:manage");
  return ok(await listPayPeriods(ctx));
});
