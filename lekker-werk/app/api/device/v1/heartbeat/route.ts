import { NextResponse } from "next/server";
import { authenticateDevice } from "@/server/devices/device-ingest";
import { clientIp, route } from "@/server/http/route";

/** Terminals ping this so admins can see which are online, and to sync their clocks. */
export const POST = route(
  async (req) => {
    const device = await authenticateDevice(req.headers.get("authorization"), clientIp(req));
    return NextResponse.json({
      data: { deviceId: device.id, name: device.name, fixedAction: device.fixedAction, serverTime: new Date().toISOString() },
    });
  },
  { csrf: false, limit: 60, rateKey: "device-heartbeat" },
);
