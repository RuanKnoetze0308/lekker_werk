import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { listExceptions } from "@/server/time/exceptions.service";
import { ok, parseQuery, route } from "@/server/http/route";

export const GET = route(async (req) => {
  const ctx = await requireApiContext("attendance:read");
  const { from, to } = parseQuery(req, z.object({ from: z.iso.date(), to: z.iso.date() }));
  return ok(await listExceptions(ctx, from, to));
});
