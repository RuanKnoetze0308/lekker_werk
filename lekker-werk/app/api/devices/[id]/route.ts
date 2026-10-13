import { z } from "zod";
import { deviceUpdateSchema } from "@/lib/schemas/devices";
import { requireApiContext } from "@/server/auth/guards";
import { updateDevice } from "@/server/devices/device.service";
import { ok, parseBody, route } from "@/server/http/route";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("devices:manage");
  await updateDevice(ctx, z.uuid().parse((await params).id), await parseBody(req, deviceUpdateSchema));
  return ok({ updated: true });
});
