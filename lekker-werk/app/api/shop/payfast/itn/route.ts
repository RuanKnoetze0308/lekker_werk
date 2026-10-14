import { NextResponse } from "next/server";
import { handleShopItn } from "@/server/services/shop.service";
import { clientIp, route } from "@/server/http/route";

/** PayFast notification for hardware orders. No session/CSRF: handleShopItn verifies everything. */
export const POST = route(
  async (req) => {
    await handleShopItn(await req.text(), clientIp(req));
    return new NextResponse("OK", { status: 200 });
  },
  { csrf: false, limit: 300, rateKey: "payfast-shop-itn" },
);
