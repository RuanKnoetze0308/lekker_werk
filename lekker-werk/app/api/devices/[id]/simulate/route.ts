import { z } from "zod";
import { credentialInput } from "@/lib/schemas/devices";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { requireApiContext } from "@/server/auth/guards";
import { getDeviceForSimulation } from "@/server/devices/device.service";
import { submitPunches } from "@/server/devices/device-ingest";
import { Errors } from "@/server/errors";
import { ok, parseBody, route } from "@/server/http/route";

/**
 * Test a terminal from the dashboard: behaves exactly like the device tapping a card, but is
 * authorised by the admin session instead of the device key. Disabled in production.
 */
export const POST = route<{ id: string }>(async (req, { params }) => {
  if (!env.simulatorsEnabled) throw Errors.notFound();
  const ctx = await requireApiContext("devices:manage");
  const device = await getDeviceForSimulation(ctx, z.uuid().parse((await params).id));
  const { credential } = await parseBody(req, z.object({ credential: credentialInput }));
  const [result] = await submitPunches(device, [{ credential, punchId: `sim-${randomToken(8)}` }]);
  return ok(result);
});
