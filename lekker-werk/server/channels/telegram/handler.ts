import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { communicationChannels } from "@/db/schema";
import { decryptJson, safeEqual } from "@/lib/crypto";
import { Errors } from "../../errors";
import { handleInbound } from "../messaging.service";
import type { InboundMessage } from "../types";
import { answerCallback, telegramSender, type TelegramUpdate } from "./client";

type ChannelRow = typeof communicationChannels.$inferSelect;

/** `secret` comes from the webhook URL path; the header is Telegram's own secret_token echo. */
export async function handleTelegramWebhook(secret: string, headerSecret: string | null, update: TelegramUpdate) {
  const [channel] = await db
    .select()
    .from(communicationChannels)
    .where(and(eq(communicationChannels.webhookSecret, secret), eq(communicationChannels.channel, "TELEGRAM")));
  if (!channel || !channel.enabled || !channel.encryptedCredentials) throw Errors.notFound("Channel");
  if (!headerSecret || !safeEqual(headerSecret, channel.webhookSecret)) throw Errors.forbidden("Bad secret.");
  await processTelegramUpdate(channel, update);
}

/** Pure: turns a Telegram update into our channel-neutral message (null for update types we ignore). */
export function parseTelegramUpdate(companyId: string, update: TelegramUpdate): InboundMessage | null {
  if (update.message) {
    const m = update.message;
    return {
      companyId,
      channel: "TELEGRAM",
      externalId: String(m.chat.id),
      displayName: m.from?.first_name ?? m.from?.username,
      messageId: `${update.update_id}`,
      text: m.text,
      location: m.location,
    };
  }
  const cb = update.callback_query;
  if (cb?.message) {
    return {
      companyId,
      channel: "TELEGRAM",
      externalId: String(cb.message.chat.id),
      displayName: cb.from.first_name,
      messageId: `${update.update_id}`,
      text: cb.data,
    };
  }
  return null;
}

/** Shared by the webhook (production) and the long-poller (local development). */
export async function processTelegramUpdate(channel: ChannelRow, update: TelegramUpdate) {
  const { botToken } = decryptJson<{ botToken: string }>(channel.encryptedCredentials);
  // Stops the button's loading spinner; cosmetic, so failures are ignored inside answerCallback.
  if (update.callback_query) await answerCallback(botToken, update.callback_query.id);
  const inbound = parseTelegramUpdate(channel.companyId, update);
  if (inbound) await handleInbound(inbound, telegramSender(botToken));
}
