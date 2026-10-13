import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { extractLinkCode, extractQrToken } from "@/server/channels/messaging.service";
import { parseTelegramUpdate } from "@/server/channels/telegram/handler";
import { parseWhatsAppPayload, verifyWhatsAppSignature } from "@/server/channels/whatsapp/handler";

const wa = (message: Record<string, unknown>) => ({
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: "PNID" },
            contacts: [{ wa_id: "27821234567", profile: { name: "Thabo" } }],
            messages: [{ id: "wamid.1", from: "27821234567", ...message }],
          },
        },
      ],
    },
  ],
});

describe("WhatsApp payload parsing", () => {
  it("reads a text message with sender name", () => {
    const [m] = parseWhatsAppPayload(wa({ type: "text", text: { body: "MENU" } }));
    expect(m).toMatchObject({ phoneNumberId: "PNID", from: "27821234567", name: "Thabo", messageId: "wamid.1", text: "MENU" });
  });

  it("reads reply-button and list taps as their ids", () => {
    expect(parseWhatsAppPayload(wa({ type: "interactive", interactive: { button_reply: { id: "CLOCK_IN" } } }))[0].text).toBe("CLOCK_IN");
    expect(parseWhatsAppPayload(wa({ type: "interactive", interactive: { list_reply: { id: "INFO_today_hours" } } }))[0].text).toBe("INFO_today_hours");
  });

  it("reads template quick-reply buttons", () => {
    expect(parseWhatsAppPayload(wa({ type: "button", button: { payload: "CLOCK_OUT", text: "Clock out" } }))[0].text).toBe("CLOCK_OUT");
  });

  it("reads a shared location", () => {
    const [m] = parseWhatsAppPayload(wa({ type: "location", location: { latitude: -29.9, longitude: 30.99 } }));
    expect(m.location).toEqual({ latitude: -29.9, longitude: 30.99 });
    expect(m.text).toBeUndefined();
  });

  it("ignores delivery/read status callbacks", () => {
    const statuses = { entry: [{ changes: [{ value: { metadata: { phone_number_id: "PNID" }, statuses: [{ status: "read" }] } }] }] };
    expect(parseWhatsAppPayload(statuses)).toEqual([]);
  });
});

describe("WhatsApp signature", () => {
  it("accepts Meta's HMAC and rejects anything else", () => {
    process.env.WHATSAPP_APP_SECRET = "test-secret";
    const body = JSON.stringify(wa({ type: "text", text: { body: "hi" } }));
    const sig = `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
    expect(verifyWhatsAppSignature(body, sig)).toBe(true);
    expect(verifyWhatsAppSignature(body + " ", sig)).toBe(false);
    expect(verifyWhatsAppSignature(body, null)).toBe(false);
    process.env.WHATSAPP_APP_SECRET = "";
    expect(verifyWhatsAppSignature(body, sig)).toBe(false); // no secret configured = reject all
  });
});

describe("Telegram update parsing", () => {
  it("turns a message into an inbound message", () => {
    const m = parseTelegramUpdate("co", {
      update_id: 9,
      message: { message_id: 1, chat: { id: 555 }, from: { first_name: "Lerato" }, text: "/start q_abcdefghijklmnopqrstuvwxyz" },
    });
    expect(m).toMatchObject({ companyId: "co", channel: "TELEGRAM", externalId: "555", displayName: "Lerato", messageId: "9" });
  });

  it("turns a button tap into its callback data", () => {
    const m = parseTelegramUpdate("co", {
      update_id: 10,
      callback_query: { id: "cb", data: "CLOCK_OUT", from: { first_name: "Lerato" }, message: { chat: { id: 555 } } },
    });
    expect(m?.text).toBe("CLOCK_OUT");
  });
});

describe("deep-link parsing", () => {
  it("finds link codes in every form employees send them", () => {
    expect(extractLinkCode("LINK abcd2345")).toBe("ABCD2345");
    expect(extractLinkCode("/start LINK_ABCD2345")).toBe("ABCD2345");
    expect(extractLinkCode("hello")).toBeNull();
  });

  it("finds QR tokens from Telegram and WhatsApp scans", () => {
    const token = "Abc_def-0123456789xyzABC";
    expect(extractQrToken(`/start q_${token}`)).toBe(token);
    expect(extractQrToken(`CLOCK ${token}`)).toBe(token);
    expect(extractQrToken("CLOCK short")).toBeNull();
  });
});
