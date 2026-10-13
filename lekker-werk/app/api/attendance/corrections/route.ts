import { correctionSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { createCorrection } from "@/server/services/attendance.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route(async (req) => {
  const ctx = await requireApiContext("attendance:correct");
  await createCorrection(ctx, await parseBody(req, correctionSchema));
  return ok({ corrected: true }, { status: 201 });
});
