/**
 * Local-development Telegram bridge. Telegram can only push webhooks to a public HTTPS URL, so
 * while the app runs on localhost this long-polls getUpdates for every company bot that was
 * connected in "polling" mode and feeds each update through the same code the webhook uses.
 *
 *   npm run telegram:poll
 *
 * In production (public HTTPS APP_URL) bots are connected in webhook mode and this isn't needed.
 */
import { loadEnv } from "./_env";

import type { communicationChannels as ChannelsTable } from "@/db/schema";

type Channel = typeof ChannelsTable.$inferSelect;

async function main() {
  loadEnv();
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("@/db/client");
  const { communicationChannels } = await import("@/db/schema");
  const { decryptJson } = await import("@/lib/crypto");
  const { getUpdates } = await import("@/server/channels/telegram/client");
  const { processTelegramUpdate } = await import("@/server/channels/telegram/handler");

  const running = new Map<string, AbortController>();
  let stopping = false;

  async function pollBot(channel: Channel, signal: AbortSignal) {
    const { botToken } = decryptJson<{ botToken: string }>(channel.encryptedCredentials);
    let offset = 0;
    console.log(`[telegram] polling @${channel.publicHandle} for company ${channel.companyId}`);
    while (!signal.aborted) {
      try {
        const updates = await getUpdates(botToken, offset, 25);
        for (const u of updates) {
          offset = u.update_id + 1;
          const text = u.message?.text ?? u.callback_query?.data ?? (u.message?.location ? "(location)" : "");
          console.log(`[telegram] @${channel.publicHandle} <- ${text}`);
          await processTelegramUpdate(channel, u).catch((err) => console.error("[telegram] handler error", err));
        }
      } catch (err) {
        if (signal.aborted) break;
        console.error(`[telegram] getUpdates failed for @${channel.publicHandle}:`, (err as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  /** Picks up bots connected / disconnected in the dashboard without restarting the poller. */
  async function refresh() {
    const rows = await db
      .select()
      .from(communicationChannels)
      .where(
        and(
          eq(communicationChannels.channel, "TELEGRAM"),
          eq(communicationChannels.enabled, true),
          sql`${communicationChannels.encryptedCredentials} is not null`,
          sql`${communicationChannels.config}->>'mode' = 'polling'`,
        ),
      );
    const live = new Set(rows.map((r) => r.id));
    for (const [id, ctrl] of running) {
      if (!live.has(id)) {
        ctrl.abort();
        running.delete(id);
      }
    }
    for (const row of rows) {
      if (running.has(row.id)) continue;
      const ctrl = new AbortController();
      running.set(row.id, ctrl);
      void pollBot(row, ctrl.signal);
    }
    if (!rows.length)
      console.log("[telegram] no bots in polling mode yet. Connect one under Settings > Communication.");
  }

  process.on("SIGINT", () => {
    stopping = true;
    for (const c of running.values()) c.abort();
    console.log("\n[telegram] stopped");
    process.exit(0);
  });

  while (!stopping) {
    await refresh();
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
