import { z } from "zod";
import { siteClosureSchema } from "@/lib/schemas/time";
import { requireApiContext } from "@/server/auth/guards";
import { createClosure, listClosures } from "@/server/time/closures.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireApiContext("locations:read");
  return ok(await listClosures(ctx, z.uuid().parse((await params).id)));
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("attendance:correct");
  return ok(await createClosure(ctx, z.uuid().parse((await params).id), await parseBody(req, siteClosureSchema)), { status: 201 });
});
