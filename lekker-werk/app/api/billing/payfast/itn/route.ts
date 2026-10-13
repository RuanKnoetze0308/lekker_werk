import { NextResponse } from "next/server";
import { handleItn } from "@/server/billing/billing.service";
import { clientIp, route } from "@/server/http/route";

/**
 * PayFast instant transaction notification. Server-to-server, so no session or CSRF; instead
 * handleItn verifies the signature, PayFast's source IP, PayFast's own confirmation and the amount.
 */
export const POST = route(
  async (req) => {
    await handleItn(await req.text(), clientIp(req));
    return new NextResponse("OK", { status: 200 });
  },
  { csrf: false, limit: 300, rateKey: "payfast-itn" },
);
