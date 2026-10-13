import { z } from "zod";
import { locationManagersSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { listLocationManagers, setLocationManagers } from "@/server/services/location.service";
import { ok, parseBody, route } from "@/server/http/route";

type P = { id: string };

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireApiContext("locations:read");
  return ok(await listLocationManagers(ctx, z.uuid().parse((await params).id)));
});

export const PUT = route<P>(async (req, { params }) => {
  const ctx = await requireApiContext("users:manage");
  const { userIds } = await parseBody(req, locationManagersSchema);
  await setLocationManagers(ctx, z.uuid().parse((await params).id), userIds);
  return ok({ updated: true });
});
