import { z } from "zod";
import { locationUpdateSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { getLocation, updateLocation } from "@/server/services/location.service";
import { ok, parseBody, route } from "@/server/http/route";

type P = { id: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireApiContext("locations:read");
  return ok(await getLocation(ctx, z.uuid().parse((await params).id)));
});

export const PATCH = route<P>(async (req, { params }) => {
  const ctx = await requireApiContext("locations:write");
  const row = await updateLocation(ctx, z.uuid().parse((await params).id), await parseBody(req, locationUpdateSchema));
  return ok(row);
});
