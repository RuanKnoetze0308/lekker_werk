import "server-only";
import { randomToken } from "@/lib/crypto";
import { assertCan, type AuthContext } from "../auth/context";
import { generateLinkCode } from "../services/employee.service";
import { getQrToken } from "../services/qr.service";
import { handleInbound } from "./messaging.service";
import type { ChannelKind, ChannelSender, OutboundMessage } from "./types";

/**
 * A fake transport for the real conversation pipeline. Messages go through exactly the same
 * handleInbound -> clocking engine path as Telegram/WhatsApp webhooks; only the "send reply"
 * step is swapped for an in-memory outbox. Used by the dashboard simulator and the demo seed.
 */
export function recordingSender(): ChannelSender & { outbox: OutboundMessage[] } {
  const outbox: OutboundMessage[] = [];
  return {
    outbox,
    async send(_externalId, message) {
      outbox.push(message);
    },
  };
}

export interface SimulatedMessage {
  channel: ChannelKind;
  /** Simulated chats are namespaced so they can never collide with a real Telegram/WhatsApp id. */
  externalId: string;
  displayName?: string;
  text?: string;
  location?: { latitude: number; longitude: number };
  /** Convenience: "scan" this QR code (sends the same text the real deep link would). */
  scanQrId?: string;
  /** Convenience: create a link code for this employee and send it. */
  linkEmployeeId?: string;
}

export async function simulateChat(ctx: AuthContext, msg: SimulatedMessage) {
  assertCan(ctx, "settings:manage");
  let text = msg.text;
  if (msg.scanQrId) {
    const token = await getQrToken(ctx, msg.scanQrId);
    text = msg.channel === "TELEGRAM" ? `/start q_${token}` : `CLOCK ${token}`;
  } else if (msg.linkEmployeeId) {
    const { code } = await generateLinkCode(ctx, msg.linkEmployeeId, msg.channel);
    text = `LINK ${code}`;
  }

  const sender = recordingSender();
  await handleInbound(
    {
      companyId: ctx.companyId,
      channel: msg.channel,
      externalId: msg.externalId,
      displayName: msg.displayName,
      messageId: `sim-${randomToken(9)}`,
      text,
      location: msg.location,
    },
    sender,
  );
  // Never echo raw QR tokens back to the browser.
  const shown = msg.scanQrId ? "(scanned QR code)" : text ?? (msg.location ? "(shared location)" : "");
  return { sent: shown, replies: sender.outbox };
}
