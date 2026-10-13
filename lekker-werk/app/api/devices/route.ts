import { deviceCreateSchema } from "@/lib/schemas/devices";
import { requireApiContext } from "@/server/auth/guards";
import { createDevice, listDevices } from "@/server/devices/device.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("devices:manage");
  return ok(await listDevices(ctx));
});

/** Response includes `apiKey` once. It cannot be retrieved again, only rotated. */
export const POST = route(async (req) => {
  const ctx = await requireApiContext("devices:manage");
  return ok(await createDevice(ctx, await parseBody(req, deviceCreateSchema)), { status: 201 });
});
