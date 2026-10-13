import { z } from "zod";
import { resolveAbsenceSchema } from "@/lib/schemas/time";
import { requireApiContext } from "@/server/auth/guards";
import { resolveAbsence } from "@/server/time/exceptions.service";
import { ok, parseBody, route } from "@/server/http/route";

/** `id` is the attendance record of the absent day. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("leave:approve");
  return ok(await resolveAbsence(ctx, z.uuid().parse((await params).id), await parseBody(req, resolveAbsenceSchema)));
});
