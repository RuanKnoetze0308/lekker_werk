/**
 * End-to-end check of the shared WhatsApp number against the local database, before Meta keys
 * exist: real webhook handler -> tenant resolution -> conversation -> clocking engine -> DB.
 * Outbound replies go to the development logging sender, which we capture.
 *
 * Needs demo data (`npm run demo:seed`). Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../scripts/_env";

loadEnv();
process.env.WHATSAPP_PHONE_NUMBER_ID = "TEST_SHARED_NUMBER";
process.env.WHATSAPP_DISPLAY_NUMBER = "27600000000";
process.env.WHATSAPP_ACCESS_TOKEN = ""; // forces the logging sender: nothing is sent to Meta

const { and, eq, sql } = await import("drizzle-orm");
const { db } = await import("@/db/client");
const S = await import("@/db/schema");
const { decrypt } = await import("@/lib/crypto");
const { handleWhatsAppWebhook } = await import("@/server/channels/whatsapp/handler");

const WA_ID = "sim-demo-fatima"; // Fatima's linked WhatsApp identity in the demo data

let companyId = "";
let qrToken = "";
let channelBefore: { enabled: boolean; config: Record<string, unknown> } | null = null;
const replies: string[] = [];

type Payload = Parameters<typeof handleWhatsAppWebhook>[0];

function inbound(id: string, message: Record<string, unknown>): Payload {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "TEST_SHARED_NUMBER" },
              contacts: [{ wa_id: WA_ID, profile: { name: "Fatima" } }],
              messages: [{ id, from: WA_ID, type: "text", ...message }],
            },
          },
        ],
      },
    ],
  };
}

const [acct] = await db
  .select()
  .from(S.communicationAccounts)
  .where(and(eq(S.communicationAccounts.externalId, WA_ID), sql`${S.communicationAccounts.revokedAt} is null`));

describe.skipIf(!acct)("shared WhatsApp number (demo data)", () => {
  beforeAll(async () => {
    companyId = acct.companyId;
    const [emp] = await db.select().from(S.employees).where(eq(S.employees.id, acct.employeeId));
    const [qr] = await db
      .select()
      .from(S.qrCodes)
      .where(and(eq(S.qrCodes.locationId, emp.locationId), eq(S.qrCodes.enabled, true)));
    qrToken = decrypt(qr.encryptedToken);

    const [ch] = await db
      .select()
      .from(S.communicationChannels)
      .where(and(eq(S.communicationChannels.companyId, companyId), eq(S.communicationChannels.channel, "WHATSAPP")));
    channelBefore = { enabled: ch.enabled, config: ch.config };
    await db
      .update(S.communicationChannels)
      .set({ enabled: true, config: { ...ch.config, mode: "shared" } })
      .where(eq(S.communicationChannels.id, ch.id));

    vi.spyOn(console, "info").mockImplementation((line: string) => {
      if (String(line).startsWith("[whatsapp:dev]")) replies.push(String(line));
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (channelBefore) {
      await db
        .update(S.communicationChannels)
        .set(channelBefore)
        .where(and(eq(S.communicationChannels.companyId, companyId), eq(S.communicationChannels.channel, "WHATSAPP")));
    }
  });

  it("routes a QR scan on the shared number to the right company", async () => {
    replies.length = 0;
    await handleWhatsAppWebhook(inbound(`wamid.scan.${Date.now()}`, { type: "text", text: { body: `CLOCK ${qrToken}` } }));
    expect(replies.join("\n")).toMatch(/You're at Durban Depot/);
  });

  it("clocks in from a button tap and writes the event", async () => {
    replies.length = 0;
    await handleWhatsAppWebhook(
      inbound(`wamid.in.${Date.now()}`, { type: "interactive", interactive: { button_reply: { id: "CLOCK_IN" } } }),
    );
    expect(replies.join("\n")).toMatch(/clocked in|already clocked in/i);
    const [last] = await db
      .select({ source: S.clockEvents.source })
      .from(S.clockEvents)
      .where(eq(S.clockEvents.employeeId, acct.employeeId))
      .orderBy(sql`${S.clockEvents.occurredAt} desc`)
      .limit(1);
    expect(last.source).toBe("WHATSAPP");
  });

  it("clocks out again so the demo data is left tidy", async () => {
    replies.length = 0;
    await handleWhatsAppWebhook(
      inbound(`wamid.out.${Date.now()}`, { type: "interactive", interactive: { button_reply: { id: "CLOCK_OUT" } } }),
    );
    expect(replies.join("\n")).toMatch(/clocked out/i);
  });

  it("answers strangers on the shared number without touching any company", async () => {
    replies.length = 0;
    await handleWhatsAppWebhook(inbound(`wamid.x.${Date.now()}`, { from: "27999999999", text: { body: "hello" } }));
    expect(replies.join("\n")).toMatch(/link code/i);
  });
});
