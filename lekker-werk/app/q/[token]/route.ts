import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { communicationChannels } from "@/db/schema";
import { channelHandle } from "@/server/services/company.service";
import { env } from "@/lib/env";
import { rateLimit } from "@/server/services/rate-limit.service";
import { resolveQrToken } from "@/server/services/qr.service";

/**
 * Target of every printed QR code. The token is opaque: we resolve it server-side, then send the
 * employee into the company's configured chat (Telegram deep link or WhatsApp click-to-chat).
 * The actual clocking is validated later by the clocking engine, not here.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(`qr-scan:${ip}`, 60, 60))) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  const fail = () => NextResponse.redirect(new URL("/?qr=invalid", env.appUrl), 302);
  const qr = await resolveQrToken(token, "scan");
  if (!qr || !qr.enabled || (qr.expiresAt && qr.expiresAt < new Date())) return fail();

  const channels = await db
    .select()
    .from(communicationChannels)
    .where(and(eq(communicationChannels.companyId, qr.companyId), eq(communicationChannels.enabled, true)));
  const channel = channels.find((c) => c.isDefault && channelHandle(c)) ?? channels.find((c) => channelHandle(c));
  const handle = channel ? channelHandle(channel) : null;
  if (!channel || !handle) return fail();

  const target =
    channel.channel === "TELEGRAM"
      ? `https://t.me/${handle}?start=q_${token}`
      : `https://wa.me/${handle.replace(/\D/g, "")}?text=${encodeURIComponent(`CLOCK ${token}`)}`;
  return NextResponse.redirect(target, 302);
}
