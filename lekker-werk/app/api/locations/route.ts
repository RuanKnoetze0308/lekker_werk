import { locationInputSchema } from "@/lib/schemas/auth";
import { requireApiContext } from "@/server/auth/guards";
import { createLocation, listLocations } from "@/server/services/location.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("locations:read");
  return ok(await listLocations(ctx));
});

export const POST = route(async (req) => {
  const ctx = await requireApiContext("locations:write");
  const row = await createLocation(ctx, await parseBody(req, locationInputSchema));
  return ok(row, { status: 201 });
});
