import { NextResponse } from "next/server";
import { handleTelegramWebhook } from "@/server/channels/telegram/handler";
import { route } from "@/server/http/route";

// Authenticated by the per-company secret in the URL AND Telegram's secret-token header.
// No session cookie is involved, so CSRF does not apply.
export const POST = route<{ secret: string }>(
  async (req, { params }) => {
    const { secret } = await params;
    const update = await req.json();
    await handleTelegramWebhook(secret, req.headers.get("x-telegram-bot-api-secret-token"), update);
    return NextResponse.json({ ok: true });
  },
  { csrf: false, limit: 600, rateKey: "telegram-webhook" },
);
