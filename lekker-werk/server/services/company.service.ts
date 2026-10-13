import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  communicationChannels,
  companies,
  companySettings,
  employeeDataPermissions,
} from "@/db/schema";
import type { CompanySettingsShape } from "@/db/schema/system";
import { DEFAULT_COMPANY_SETTINGS, EMPLOYEE_DATA_KEYS } from "@/lib/defaults";
import { encryptJson } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { z } from "zod";
import type {
  attendanceSettingsSchema,
  channelConfigSchema,
  companyUpdateSchema,
} from "@/lib/schemas/settings";
import { assertCan, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { assertWhatsappAllowed } from "../billing/billing.service";
import { audit } from "./audit.service";
import { brandBot, registerTelegramWebhook, enableTelegramPolling } from "../channels/telegram/client";

/**
 * Telegram can only push to public HTTPS. Anywhere else (localhost, LAN) the bot runs in polling
 * mode and scripts/telegram-poll.ts fetches updates instead.
 */
export function canReceiveWebhooks(appUrl = env.appUrl) {
  const url = new URL(appUrl);
  const local = /^(localhost|127\.|10\.|192\.168\.|\[::1\])/.test(url.hostname) || /\.(local|localhost|test)$/.test(url.hostname);
  return url.protocol === "https:" && !local;
}

export async function getCompany(ctx: AuthContext) {
  const [company] = await db.select().from(companies).where(eq(companies.id, ctx.companyId));
  if (!company) throw Errors.notFound("Company");
  return company;
}

export async function updateCompany(ctx: AuthContext, input: z.infer<typeof companyUpdateSchema>) {
  assertCan(ctx, "settings:manage");
  await db.transaction(async (tx) => {
    await tx
      .update(companies)
      .set({
        name: input.name,
        registrationNumber: input.registrationNumber ?? null,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        timezone: input.timezone,
        preferredChannel: input.preferredChannel,
      })
      .where(eq(companies.id, ctx.companyId));
    await tx
      .update(communicationChannels)
      .set({ isDefault: false })
      .where(eq(communicationChannels.companyId, ctx.companyId));
    await tx
      .update(communicationChannels)
      .set({ isDefault: true })
      .where(
        and(
          eq(communicationChannels.companyId, ctx.companyId),
          eq(communicationChannels.channel, input.preferredChannel),
        ),
      );
    await audit(ctx, "settings.changed", "company", ctx.companyId, { section: "company" }, tx);
  });
}

export async function getSettings(companyId: string): Promise<CompanySettingsShape> {
  const [row] = await db
    .select({ settings: companySettings.settings })
    .from(companySettings)
    .where(eq(companySettings.companyId, companyId));
  const stored = row?.settings?.attendance;
  return {
    attendance: {
      ...DEFAULT_COMPANY_SETTINGS.attendance,
      ...(stored ?? {}),
      // Nested: companies saved before a field existed still get its default.
      mealBreak: { ...DEFAULT_COMPANY_SETTINGS.attendance.mealBreak, ...(stored?.mealBreak ?? {}) },
    },
  };
}

export async function updateAttendanceSettings(
  ctx: AuthContext,
  input: z.infer<typeof attendanceSettingsSchema>,
) {
  assertCan(ctx, "settings:manage");
  const next: CompanySettingsShape = { attendance: input };
  await db
    .insert(companySettings)
    .values({ companyId: ctx.companyId, settings: next, updatedBy: ctx.userId })
    .onConflictDoUpdate({
      target: companySettings.companyId,
      set: { settings: next, updatedBy: ctx.userId },
    });
  await audit(ctx, "settings.changed", "company_settings", ctx.companyId, { section: "attendance" });
}

// ---- Employee self-service data permissions -------------------------------------------

export async function getEmployeeDataPermissions(companyId: string) {
  const rows = await db
    .select()
    .from(employeeDataPermissions)
    .where(eq(employeeDataPermissions.companyId, companyId));
  const map: Record<string, boolean> = {};
  for (const k of EMPLOYEE_DATA_KEYS) map[k.key] = k.defaultOn;
  for (const r of rows) if (!r.roleOverride) map[r.permissionKey] = r.enabled;
  return map;
}

export async function updateEmployeeDataPermissions(
  ctx: AuthContext,
  permissions: Record<string, boolean>,
) {
  assertCan(ctx, "settings:manage");
  const valid = new Set<string>(EMPLOYEE_DATA_KEYS.map((k) => k.key));
  await db.transaction(async (tx) => {
    for (const [key, enabled] of Object.entries(permissions)) {
      if (!valid.has(key)) continue;
      const existing = await tx
        .select({ id: employeeDataPermissions.id })
        .from(employeeDataPermissions)
        .where(
          and(
            eq(employeeDataPermissions.companyId, ctx.companyId),
            eq(employeeDataPermissions.permissionKey, key),
          ),
        );
      if (existing.length) {
        await tx
          .update(employeeDataPermissions)
          .set({ enabled })
          .where(eq(employeeDataPermissions.id, existing[0].id));
      } else {
        await tx
          .insert(employeeDataPermissions)
          .values({ companyId: ctx.companyId, permissionKey: key, enabled });
      }
    }
    await audit(ctx, "permission.changed", "employee_data_permissions", null, { permissions }, tx);
  });
}

// ---- Communication channels ------------------------------------------------------------

type ChannelRow = typeof communicationChannels.$inferSelect;

/** WhatsApp runs on the shared LekkerWerk number unless the company connected its own. */
export function whatsappMode(row: ChannelRow): "shared" | "dedicated" {
  return row.config.mode === "dedicated" ? "dedicated" : "shared";
}

/**
 * The handle employees message: Telegram bot username, or the WhatsApp number in international
 * digits (the shared number in shared mode). null when the channel can't receive messages yet.
 */
export function channelHandle(row: ChannelRow): string | null {
  if (row.channel === "WHATSAPP" && whatsappMode(row) === "shared") return env.whatsappShared.displayNumber || null;
  return row.publicHandle?.replace(/^@/, "") || null;
}

/** Safe view for the browser: never includes credentials or the webhook secret itself. */
export async function listChannels(ctx: AuthContext) {
  const rows = await db
    .select()
    .from(communicationChannels)
    .where(eq(communicationChannels.companyId, ctx.companyId));
  return rows.map((r) => ({
    channel: r.channel,
    enabled: r.enabled,
    isDefault: r.isDefault,
    publicHandle: channelHandle(r),
    // Shared WhatsApp is ready when LekkerWerk's own number is configured on the server.
    configured:
      r.channel === "WHATSAPP" && whatsappMode(r) === "shared"
        ? Boolean(env.whatsappShared.phoneNumberId && env.whatsappShared.accessToken)
        : Boolean(r.encryptedCredentials),
    mode:
      r.channel === "WHATSAPP"
        ? whatsappMode(r)
        : ((r.config.mode as "webhook" | "polling" | undefined) ?? null),
    botLink: r.channel === "TELEGRAM" && r.publicHandle ? `https://t.me/${r.publicHandle.replace(/^@/, "")}` : null,
    phoneNumberId: (r.config.phoneNumberId as string | undefined) ?? null,
    webhookUrl:
      r.channel === "TELEGRAM"
        ? `${env.appUrl}/api/webhooks/telegram/${r.webhookSecret}`
        : `${env.appUrl}/api/webhooks/whatsapp`,
  }));
}

export async function configureChannel(ctx: AuthContext, input: z.infer<typeof channelConfigSchema>) {
  assertCan(ctx, "settings:manage");
  const [row] = await db
    .select()
    .from(communicationChannels)
    .where(
      and(
        eq(communicationChannels.companyId, ctx.companyId),
        eq(communicationChannels.channel, input.channel),
      ),
    );
  if (!row) throw Errors.notFound("Channel");
  if (input.channel === "WHATSAPP" && input.enabled) await assertWhatsappAllowed(ctx.companyId);

  if (input.channel === "TELEGRAM") {
    let handle = row.publicHandle;
    let encrypted = row.encryptedCredentials;
    const config = { ...row.config };
    if (input.botToken) {
      const webhook = canReceiveWebhooks();
      const bot = webhook
        ? await registerTelegramWebhook(
            input.botToken,
            `${env.appUrl}/api/webhooks/telegram/${row.webhookSecret}`,
            row.webhookSecret,
          )
        : await enableTelegramPolling(input.botToken);
      const company = await getCompany(ctx);
      // Cosmetic; a failure here must not block connecting the bot.
      await brandBot(input.botToken, company.name).catch((err) => console.warn("Telegram branding failed", err));
      handle = bot.username;
      encrypted = encryptJson({ botToken: input.botToken });
      config.mode = webhook ? "webhook" : "polling";
    }
    await db
      .update(communicationChannels)
      .set({ enabled: input.enabled, publicHandle: handle, encryptedCredentials: encrypted, config })
      .where(eq(communicationChannels.id, row.id));
  } else {
    const config: Record<string, unknown> = { ...row.config, mode: input.mode === "DEDICATED" ? "dedicated" : "shared" };
    if (input.phoneNumberId) {
      if (input.phoneNumberId === env.whatsappShared.phoneNumberId) throw Errors.invalid("That is the shared LekkerWerk number.");
      config.phoneNumberId = input.phoneNumberId;
    }
    if (config.mode === "dedicated" && input.enabled && (!config.phoneNumberId || !(input.accessToken || row.encryptedCredentials))) {
      throw Errors.invalid("Your own WhatsApp number needs a phone number ID and an access token.");
    }
    await db
      .update(communicationChannels)
      .set({
        enabled: input.enabled,
        publicHandle: input.displayNumber ?? row.publicHandle,
        config,
        encryptedCredentials: input.accessToken
          ? encryptJson({ accessToken: input.accessToken })
          : row.encryptedCredentials,
      })
      .where(eq(communicationChannels.id, row.id));
  }
  await audit(ctx, "channel.configured", "communication_channel", row.id, {
    channel: input.channel,
    enabled: input.enabled,
  });
}
