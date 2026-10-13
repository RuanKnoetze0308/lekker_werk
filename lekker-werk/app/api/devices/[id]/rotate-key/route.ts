import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { rotateDeviceKey } from "@/server/devices/device.service";
import { ok, route } from "@/server/http/route";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireApiContext("devices:manage");
  return ok(await rotateDeviceKey(ctx, z.uuid().parse((await params).id)));
});
