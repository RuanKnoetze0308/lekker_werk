import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { getPayPeriodReport } from "@/server/time/payroll.service";
import { ok, route } from "@/server/http/route";

/** `?refresh=1` re-derives the open period's days before totalling. */
export const GET = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("payroll:manage");
  return ok(
    await getPayPeriodReport(ctx, z.uuid().parse((await params).id), {
      refresh: req.nextUrl.searchParams.get("refresh") === "1",
    }),
  );
});
