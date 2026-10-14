import { NextResponse } from "next/server";
import { getDisplayFrame } from "@/server/services/qr.service";
import { ok, route } from "@/server/http/route";

/**
 * Polled by the display screen of a dynamic QR code. Public: the key in the URL is the credential
 * (derived from the code's secret, revoked by Regenerate). Returns the current QR and when it rotates.
 */
export const GET = route<{ key: string }>(
  async (_req, { params }) => {
    const frame = await getDisplayFrame((await params).key);
    if (!frame) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Display link not found." } }, { status: 404 });
    const res = ok(frame);
    res.headers.set("cache-control", "no-store");
    return res;
  },
  { limit: 30, rateKey: "qr-display" },
);
