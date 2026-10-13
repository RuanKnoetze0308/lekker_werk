import { z } from "zod";
import { lockPeriodSchema } from "@/lib/schemas/time";
import { requireApiContext } from "@/server/auth/guards";
import { lockPayPeriod } from "@/server/time/payroll.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route<{ id: string }>(
  async (req, { params }) => {
    const ctx = await requireApiContext("payroll:manage");
    await lockPayPeriod(ctx, z.uuid().parse((await params).id), await parseBody(req, lockPeriodSchema));
    return ok({ locked: true });
  },
  { limit: 20 },
);
