import "server-only";
import { createHmac } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { communicationAccounts, communicationChannels, linkCodes } from "@/db/schema";
import { decryptJson, safeEqual, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { Errors } from "../../errors";
import { resolveQrToken } from "../../services/qr.service";
import { extractLinkCode, extractQrToken, handleInbound } from "../messaging.service";
import type { ChannelSender } from "../types";
import { loggingWhatsAppSender, whatsappSender } from "./client";

interface WhatsAppPayload {
  entry?: {
    changes?: {
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: {
          id: string;
          from: string;
          type: string;
          text?: { body: string };
          interactive?: { button_reply?: { id: string }; list_reply?: { id: string } };
          button?: { payload?: string; text?: string };
          location?: { latitude: number; longitude: number };
        }[];
      };
    }[];
  }[];
}

export interface ParsedWhatsAppMessage {
  /** The business number that received it: identifies the tenant (dedicated) or the shared line. */
  phoneNumberId: string;
  from: string;
  name?: string;
  messageId: string;
  text?: string;
  location?: { latitude: number; longitude: number };
}

/**
 * Pure: flattens Meta's nested webhook payload into the messages we act on. Status updates
 * (sent / delivered / read) carry no `messages` and are skipped.
 */
export function parseWhatsAppPayload(payload: WhatsAppPayload): ParsedWhatsAppMessage[] {
  const out: ParsedWhatsAppMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!value?.messages?.length || !phoneNumberId) continue;
      for (const m of value.messages) {
        out.push({
          phoneNumberId,
          from: m.from,
          name: value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name,
          messageId: m.id,
          text:
            m.type === "text"
              ? m.text?.body
              : m.type === "interactive"
                ? (m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id)
                : m.type === "button"
                  ? (m.button?.payload ?? m.button?.text)
                  : undefined,
          location: m.type === "location" ? m.location : undefined,
        });
      }
    }
  }
  return out;
}

/** Meta signs the raw body with the app secret. Reject anything that doesn't verify. */
export function verifyWhatsAppSignature(rawBody: string, header: string | null): boolean {
  const secret = env.whatsappAppSecret;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(header.slice(7), expected);
}

export function checkVerifyChallenge(mode: string | null, token: string | null) {
  if (mode !== "subscribe" || !token || !env.whatsappVerifyToken || !safeEqual(token, env.whatsappVerifyToken)) {
    throw Errors.forbidden("Verification failed.");
  }
}

function sharedSender(): ChannelSender {
  const shared = env.whatsappShared;
  if (shared.accessToken && shared.phoneNumberId) return whatsappSender(shared.phoneNumberId, shared.accessToken);
  if (env.isProd) throw new Error("WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not configured.");
  return loggingWhatsAppSender();
}

/** Companies that switched WhatsApp on in shared mode. */
async function sharedChannelEnabled(companyId: string) {
  const [row] = await db
    .select({ id: communicationChannels.id })
    .from(communicationChannels)
    .where(
      and(
        eq(communicationChannels.companyId, companyId),
        eq(communicationChannels.channel, "WHATSAPP"),
        eq(communicationChannels.enabled, true),
        sql`coalesce(${communicationChannels.config}->>'mode', 'shared') = 'shared'`,
      ),
    );
  return Boolean(row);
}

/**
 * On the shared number every company's employees write to the same WhatsApp line, so the
 * company is worked out from the message itself, in order of certainty:
 *   1. a link code (unique across all companies),
 *   2. a QR scan (the token belongs to one company),
 *   3. the sender's linked account (most recently used, if they work for several companies).
 */
export async function resolveSharedTenant(from: string, text: string | undefined): Promise<string | null> {
  const code = text ? extractLinkCode(text) : null;
  if (code) {
    const [row] = await db
      .select({ companyId: linkCodes.companyId })
      .from(linkCodes)
      .where(
        and(
          eq(linkCodes.codeHash, sha256(code)),
          eq(linkCodes.channel, "WHATSAPP"),
          isNull(linkCodes.usedAt),
          gt(linkCodes.expiresAt, new Date()),
        ),
      );
    if (row) return row.companyId;
  }
  const qrToken = text ? extractQrToken(text) : null;
  if (qrToken) {
    const qr = await resolveQrToken(qrToken);
    if (qr) return qr.companyId;
  }
  const [acct] = await db
    .select({ companyId: communicationAccounts.companyId })
    .from(communicationAccounts)
    .where(
      and(
        eq(communicationAccounts.channel, "WHATSAPP"),
        eq(communicationAccounts.externalId, from),
        isNull(communicationAccounts.revokedAt),
      ),
    )
    .orderBy(sql`${communicationAccounts.lastSeenAt} desc nulls last`, desc(communicationAccounts.createdAt))
    .limit(1);
  return acct?.companyId ?? null;
}

export async function handleWhatsAppWebhook(payload: WhatsAppPayload) {
  const shared = env.whatsappShared;
  for (const m of parseWhatsAppPayload(payload)) {
    let companyId: string | null;
    let sender: ChannelSender;

    if (shared.phoneNumberId && m.phoneNumberId === shared.phoneNumberId) {
      sender = sharedSender();
      companyId = await resolveSharedTenant(m.from, m.text);
      if (!companyId || !(await sharedChannelEnabled(companyId))) {
        await sender
          .send(m.from, {
            text: "Hi! This is the LekkerWerk clock-in line. Ask your manager for a link code, then send: LINK <code>",
          })
          .catch((err) => console.error("[whatsapp] reply failed:", err instanceof Error ? err.message : err));
        continue;
      }
    } else {
      // Dedicated number: the company connected its own WhatsApp Business number.
      const [channel] = await db
        .select()
        .from(communicationChannels)
        .where(
          and(
            eq(communicationChannels.channel, "WHATSAPP"),
            eq(communicationChannels.enabled, true),
            sql`${communicationChannels.config}->>'phoneNumberId' = ${m.phoneNumberId}`,
          ),
        );
      if (!channel?.encryptedCredentials) continue;
      const { accessToken } = decryptJson<{ accessToken: string }>(channel.encryptedCredentials);
      companyId = channel.companyId;
      sender = whatsappSender(m.phoneNumberId, accessToken);
    }

    await handleInbound(
      {
        companyId,
        channel: "WHATSAPP",
        externalId: m.from,
        displayName: m.name,
        messageId: m.messageId,
        text: m.text,
        location: m.location,
      },
      sender,
    );
  }
}
