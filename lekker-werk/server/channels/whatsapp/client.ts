import "server-only";
import { env } from "@/lib/env";
import { AppError } from "../../errors";
import type { ChannelSender, OutboundMessage } from "../types";

async function post(phoneNumberId: string, accessToken: string, body: unknown) {
  const res = await fetch(`https://graph.facebook.com/${env.whatsappGraphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", ...(body as object) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new AppError(502, "WHATSAPP_ERROR", `WhatsApp send failed: ${text.slice(0, 200)}`);
  }
}

/**
 * Development stand-in when no access token is configured: prints what would be sent, so the
 * whole inbound flow can run locally before Meta approval. Never used in production.
 */
export function loggingWhatsAppSender(): ChannelSender {
  return {
    async send(to: string, msg: OutboundMessage) {
      const buttons = msg.buttons?.length ? ` [${msg.buttons.map((b) => b.label).join(" | ")}]` : "";
      console.info(`[whatsapp:dev] -> ${to}: ${msg.text.split("\n")[0]}${buttons}${msg.requestLocation ? " [location request]" : ""}`);
    },
  };
}

/**
 * WhatsApp Business Cloud API sender. Unlike Telegram there is no bot identity or chat keyboard:
 * we use reply buttons (max 3) and a location-request message, otherwise plain text.
 */
export function whatsappSender(phoneNumberId: string, accessToken: string): ChannelSender {
  return {
    async send(to: string, msg: OutboundMessage) {
      if (msg.requestLocation) {
        await post(phoneNumberId, accessToken, {
          to,
          type: "interactive",
          interactive: {
            type: "location_request_message",
            body: { text: msg.text },
            action: { name: "send_location" },
          },
        });
        return;
      }
      if (msg.buttons?.length) {
        await post(phoneNumberId, accessToken, {
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: msg.text.slice(0, 1024) },
            action: {
              buttons: msg.buttons.slice(0, 3).map((b) => ({
                type: "reply",
                reply: { id: b.id, title: b.label.slice(0, 20) },
              })),
            },
          },
        });
        return;
      }
      await post(phoneNumberId, accessToken, { to, type: "text", text: { body: msg.text.slice(0, 4096) } });
    },
  };
}
