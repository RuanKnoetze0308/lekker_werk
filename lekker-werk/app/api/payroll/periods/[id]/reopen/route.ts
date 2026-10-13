import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { reopenPayPeriod } from "@/server/time/payroll.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("settings:manage");
  const { note } = await parseBody(req, z.object({ note: z.string().trim().min(3, "Say why").max(500) }));
  await reopenPayPeriod(ctx, z.uuid().parse((await params).id), note);
  return ok({ reopened: true });
});
