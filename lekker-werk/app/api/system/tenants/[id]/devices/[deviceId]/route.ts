import { z } from "zod";
import { requirePlatformApi } from "@/server/auth/guards";
import { setTenantDeviceEnabled } from "@/server/services/platform.service";
import { ok, parseBody, route } from "@/server/http/route";

/** Enable / disable one of a tenant's clock devices from the System portal. */
export const POST = route<{ id: string; deviceId: string }>(async (req, { params }) => {
  const { ctx } = await requirePlatformApi();
  const { id, deviceId } = await params;
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  await setTenantDeviceEnabled(ctx, z.uuid().parse(id), z.uuid().parse(deviceId), enabled);
  return ok({ updated: true });
});
