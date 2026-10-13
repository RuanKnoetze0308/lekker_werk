import { NextResponse } from "next/server";
import { punchBatchSchema } from "@/lib/schemas/devices";
import { authenticateDevice, submitPunches } from "@/server/devices/device-ingest";
import { clientIp, parseBody, route } from "@/server/http/route";

/**
 * Device API v1: hardware terminals post card taps / PIN entries / fingerprint matches here.
 * Auth: `Authorization: Bearer lwd_...` (per-device key). No cookies, so CSRF does not apply.
 * Always 200 with a per-punch result list, so a partly rejected batch is never retried whole.
 */
export const POST = route(
  async (req) => {
    const device = await authenticateDevice(req.headers.get("authorization"), clientIp(req));
    const { punches } = await parseBody(req, punchBatchSchema);
    const results = await submitPunches(device, punches);
    return NextResponse.json({ data: { deviceId: device.id, serverTime: new Date().toISOString(), results } });
  },
  { csrf: false, limit: 300, rateKey: "device-punches" },
);
