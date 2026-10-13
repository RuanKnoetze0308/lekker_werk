import { NextResponse, type NextRequest } from "next/server";
import { checkVerifyChallenge, handleWhatsAppWebhook, verifyWhatsAppSignature } from "@/server/channels/whatsapp/handler";
import { Errors } from "@/server/errors";
import { route } from "@/server/http/route";

/** Meta's one-time webhook verification handshake. */
export const GET = route(
  async (req: NextRequest) => {
    const p = req.nextUrl.searchParams;
    checkVerifyChallenge(p.get("hub.mode"), p.get("hub.verify_token"));
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  },
  { csrf: false },
);

export const POST = route(
  async (req) => {
    const raw = await req.text();
    if (!verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"))) {
      throw Errors.forbidden("Bad signature.");
    }
    await handleWhatsAppWebhook(JSON.parse(raw));
    return NextResponse.json({ ok: true });
  },
  { csrf: false, limit: 600, rateKey: "whatsapp-webhook" },
);
