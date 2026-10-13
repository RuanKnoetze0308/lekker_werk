import "server-only";
import { AppError } from "../../errors";
import type { ChannelSender, OutboundMessage } from "../types";

const api = (token: string, method: string) => `https://api.telegram.org/bot${token}/${method}`;

async function call<T>(token: string, method: string, body?: unknown, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(api(token, method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new AppError(502, "TELEGRAM_ERROR", json.description ?? "Telegram request failed");
  return json.result;
}

export interface TelegramBot {
  id: number;
  username: string;
  first_name: string;
}

export function getBot(token: string) {
  return call<TelegramBot>(token, "getMe");
}

/**
 * Production: Telegram pushes updates to our webhook. Telegram only delivers to public HTTPS
 * (ports 443/80/88/8443) and echoes `secret_token` in X-Telegram-Bot-Api-Secret-Token.
 */
export async function registerTelegramWebhook(token: string, url: string, secret: string) {
  const me = await getBot(token);
  await call(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  return { username: me.username };
}

/** Local development: no public URL, so the poller (scripts/telegram-poll.ts) pulls updates. */
export async function enableTelegramPolling(token: string) {
  const me = await getBot(token);
  await call(token, "deleteWebhook", { drop_pending_updates: false });
  return { username: me.username };
}

/** Long-poll for updates. Only valid while no webhook is set. */
export function getUpdates(token: string, offset: number, timeoutSeconds = 25) {
  return call<TelegramUpdate[]>(
    token,
    "getUpdates",
    { offset, timeout: timeoutSeconds, allowed_updates: ["message", "callback_query"] },
    (timeoutSeconds + 10) * 1000,
  );
}

/** Menu commands + profile text employees see the first time they open the bot. */
export async function brandBot(token: string, companyName: string) {
  await call(token, "setMyCommands", {
    commands: [
      { command: "menu", description: "Clock in/out and my hours" },
      { command: "start", description: "Start or link my account" },
    ],
  });
  await call(token, "setMyShortDescription", {
    short_description: `${companyName} clock-in, powered by LekkerWerk`.slice(0, 120),
  });
  await call(token, "setMyDescription", {
    description: `Clock in and out for ${companyName}. Scan the QR code at your workplace, or send the link code your manager gave you to get started.`.slice(0, 512),
  });
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    from?: { first_name?: string; username?: string };
    text?: string;
    location?: { latitude: number; longitude: number };
  };
  callback_query?: {
    id: string;
    data?: string;
    from: { first_name?: string };
    message?: { chat: { id: number } };
  };
}

export function telegramSender(token: string): ChannelSender {
  return {
    async send(chatId: string, msg: OutboundMessage) {
      const reply_markup = msg.requestLocation
        ? {
            keyboard: [[{ text: "📍 Share my location", request_location: true }]],
            one_time_keyboard: true,
            resize_keyboard: true,
          }
        : msg.buttons?.length
          ? {
              inline_keyboard: chunk(
                msg.buttons.map((b) => ({ text: b.label, callback_data: b.id })),
                2,
              ),
            }
          : { remove_keyboard: true };
      await call(token, "sendMessage", { chat_id: chatId, text: msg.text, reply_markup });
    },
  };
}

export async function answerCallback(token: string, callbackId: string) {
  await call(token, "answerCallbackQuery", { callback_query_id: callbackId }).catch(() => {});
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
