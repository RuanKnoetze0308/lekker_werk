import "server-only";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  communicationAccounts,
  conversationStates,
  employees,
  linkCodes,
  locations,
} from "@/db/schema";
import { sha256 } from "@/lib/crypto";
import { EMPLOYEE_DATA_KEYS, type EmployeeDataKey } from "@/lib/defaults";
import { processClock, getClockState } from "../clocking/clocking.service";
import { REJECTION_MESSAGES } from "../clocking/messages";
import type { ClockAction } from "../clocking/types";
import { getEmployeeDataPermissions, getSettings } from "../services/company.service";
import { rateLimit } from "../services/rate-limit.service";
import { resolveQrToken } from "../services/qr.service";
import { answerInfoRequest } from "./employee-info.service";
import type { ChannelSender, InboundMessage, OutboundButton } from "./types";

/**
 * Channel-agnostic conversation logic. It receives normalised messages and replies through a
 * ChannelSender; it never contains attendance rules (those live in the clocking engine).
 */

type ConvState = {
  qrToken?: string;
  pendingAction?: ClockAction;
};

const CLOCK_ACTIONS: Record<string, ClockAction> = {
  CLOCK_IN: "CLOCK_IN",
  CLOCK_OUT: "CLOCK_OUT",
  BREAK_START: "BREAK_START",
  BREAK_END: "BREAK_END",
};

const WORD_ALIASES: Record<string, string> = {
  IN: "CLOCK_IN",
  "CLOCK IN": "CLOCK_IN",
  CLOCKIN: "CLOCK_IN",
  OUT: "CLOCK_OUT",
  "CLOCK OUT": "CLOCK_OUT",
  CLOCKOUT: "CLOCK_OUT",
  BREAK: "BREAK_START",
  "START BREAK": "BREAK_START",
  "END BREAK": "BREAK_END",
  BACK: "BREAK_END",
  STATUS: "INFO_current_status",
  HOURS: "INFO_today_hours",
  TODAY: "INFO_today_hours",
  WEEK: "INFO_weekly_hours",
  MONTH: "INFO_monthly_hours",
  SCHEDULE: "INFO_schedule",
  OVERTIME: "INFO_overtime",
  HELP: "MENU",
  MENU: "MENU",
  HI: "MENU",
  HELLO: "MENU",
  "/START": "MENU",
  "/MENU": "MENU",
};

async function getConv(msg: InboundMessage): Promise<ConvState> {
  const [row] = await db
    .select()
    .from(conversationStates)
    .where(
      and(
        eq(conversationStates.companyId, msg.companyId),
        eq(conversationStates.channel, msg.channel),
        eq(conversationStates.externalId, msg.externalId),
        gt(conversationStates.expiresAt, new Date()),
      ),
    );
  return (row?.state as ConvState) ?? {};
}

async function setConv(msg: InboundMessage, state: ConvState) {
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await db
    .insert(conversationStates)
    .values({ companyId: msg.companyId, channel: msg.channel, externalId: msg.externalId, state, expiresAt })
    .onConflictDoUpdate({
      target: [conversationStates.companyId, conversationStates.channel, conversationStates.externalId],
      set: { state, expiresAt },
    });
}

interface MenuItem {
  id: string;
  label: string;
}

async function buildMenu(companyId: string): Promise<MenuItem[]> {
  const settings = (await getSettings(companyId)).attendance;
  const perms = await getEmployeeDataPermissions(companyId);
  const items: MenuItem[] = [
    { id: "CLOCK_IN", label: "Clock in" },
    { id: "CLOCK_OUT", label: "Clock out" },
  ];
  if (settings.breaksEnabled) {
    items.push({ id: "BREAK_START", label: "Start break" }, { id: "BREAK_END", label: "End break" });
  }
  for (const k of EMPLOYEE_DATA_KEYS) {
    if (perms[k.key]) items.push({ id: `INFO_${k.key}`, label: k.label });
  }
  return items;
}

function menuText(name: string, items: MenuItem[]) {
  return `Hi ${name}, what would you like to do?\n\n${items.map((m, i) => `${i + 1}. ${m.label}`).join("\n")}\n\nReply with a number or tap a button.`;
}

/** Context-aware quick buttons: only offer what makes sense for the employee's current state. */
async function quickButtons(employeeId: string, companyId: string): Promise<OutboundButton[]> {
  const settings = (await getSettings(companyId)).attendance;
  const { state } = await getClockState(employeeId, settings.maxShiftHours);
  if (state === "OUT") return [{ id: "CLOCK_IN", label: "Clock in" }, { id: "INFO_today_hours", label: "My hours" }];
  if (state === "BREAK") return [{ id: "BREAK_END", label: "End break" }];
  return [
    { id: "CLOCK_OUT", label: "Clock out" },
    ...(settings.breaksEnabled ? [{ id: "BREAK_START", label: "Start break" }] : []),
    { id: "MENU", label: "More" },
  ];
}

/** "LINK ABCD2345", "/start LINK_ABCD2345" (Telegram deep link) -> the 8-char code. */
export function extractLinkCode(text: string): string | null {
  const m = /^\/?(?:LINK|START\s+LINK[_-]?)\s*([A-Z0-9]{8})$/i.exec(text.trim());
  return m ? m[1].toUpperCase() : null;
}

/** "/start q_TOKEN" (Telegram deep link) or "CLOCK TOKEN" (WhatsApp click-to-chat) -> QR token. */
export function extractQrToken(text: string): string | null {
  const raw = text.trim();
  const m = /^\/?start\s+q_([\w-]{20,})$/i.exec(raw) ?? /^clock\s+([\w-]{20,})$/i.exec(raw);
  return m ? m[1] : null;
}

export async function handleInbound(msg: InboundMessage, sender: ChannelSender) {
  // A failed reply (provider outage, revoked token) must never undo or retry a clocking that
  // already succeeded, so delivery errors are logged, not thrown back to the webhook.
  const reply = async (text: string, extra: { buttons?: OutboundButton[]; requestLocation?: boolean } = {}) => {
    try {
      await sender.send(msg.externalId, { text, ...extra });
    } catch (err) {
      console.error(`[${msg.channel}] reply to ${msg.externalId} failed:`, err instanceof Error ? err.message : err);
    }
  };

  // Drop provider retries and abusive senders before doing any work.
  if (msg.messageId && !(await rateLimit(`msg:${msg.companyId}:${msg.channel}:${msg.messageId}`, 1, 3600))) return;
  if (!(await rateLimit(`chat:${msg.companyId}:${msg.externalId}`, 60, 60))) return;

  const raw = (msg.text ?? "").trim();
  const upper = raw.toUpperCase();

  // ---- Linking: LINK <code> -----------------------------------------------------------------
  const linkCode = extractLinkCode(raw);
  if (linkCode) return handleLink(msg, linkCode, reply);

  // ---- QR scan: "/start q_TOKEN" (Telegram deep link) or "CLOCK TOKEN" (WhatsApp wa.me) --------------
  const qrToken = extractQrToken(raw);

  const [account] = await db
    .select({ id: communicationAccounts.id, employeeId: communicationAccounts.employeeId })
    .from(communicationAccounts)
    .where(
      and(
        eq(communicationAccounts.companyId, msg.companyId),
        eq(communicationAccounts.channel, msg.channel),
        eq(communicationAccounts.externalId, msg.externalId),
        isNull(communicationAccounts.revokedAt),
      ),
    );

  if (!account) {
    return reply(
      "Hi! This chat isn't linked to an employee yet.\nAsk your manager for a link code, then send:\nLINK <code>",
    );
  }
  await db
    .update(communicationAccounts)
    .set({ lastSeenAt: new Date() })
    .where(eq(communicationAccounts.id, account.id));

  const [emp] = await db
    .select({ id: employees.id, firstName: employees.firstName, status: employees.status })
    .from(employees)
    .where(and(eq(employees.id, account.employeeId), eq(employees.companyId, msg.companyId)));
  if (!emp || emp.status !== "ACTIVE") {
    return reply("Your employee profile is not active. Please contact your manager.");
  }

  const state = await getConv(msg);

  if (qrToken) {
    const qr = await resolveQrToken(qrToken);
    if (!qr || qr.companyId !== msg.companyId || !qr.enabled || (qr.expiresAt && qr.expiresAt < new Date())) {
      return reply("That QR code isn't valid any more. Ask your manager for a new one.");
    }
    const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, qr.locationId));
    await setConv(msg, { qrToken });
    return reply(`Hi ${emp.firstName}! You're at ${loc?.name ?? "your workplace"}. What would you like to do?`, {
      buttons: await quickButtons(emp.id, msg.companyId),
    });
  }

  // ---- Location share completes a pending clock attempt -------------------------------------------------
  if (msg.location) {
    if (!state.pendingAction) return reply("Thanks, got your location. Choose an action from the menu.", { buttons: await quickButtons(emp.id, msg.companyId) });
    await setConv(msg, { qrToken: state.qrToken });
    return runClock(msg, emp, state.pendingAction, state, reply, msg.location);
  }

  // ---- Intent resolution ---------------------------------------------------------------------------------
  const menu = await buildMenu(msg.companyId);
  let intent = WORD_ALIASES[upper] ?? (menu.some((m) => m.id === raw) || raw === "MENU" ? raw : undefined);
  if (!intent && /^\d{1,2}$/.test(raw)) intent = menu[Number(raw) - 1]?.id;

  if (!intent || intent === "MENU") {
    return reply(menuText(emp.firstName, menu), { buttons: await quickButtons(emp.id, msg.companyId) });
  }

  if (intent in CLOCK_ACTIONS) {
    return runClock(msg, emp, CLOCK_ACTIONS[intent], state, reply);
  }

  if (intent.startsWith("INFO_")) {
    const key = intent.slice(5) as EmployeeDataKey;
    const perms = await getEmployeeDataPermissions(msg.companyId);
    if (!perms[key]) return reply("That information isn't available. Please ask your manager.");
    return reply(await answerInfoRequest(key, emp.id), { buttons: await quickButtons(emp.id, msg.companyId) });
  }

  return reply(menuText(emp.firstName, menu));
}

async function runClock(
  msg: InboundMessage,
  emp: { id: string; firstName: string },
  action: ClockAction,
  state: ConvState,
  reply: (t: string, e?: { buttons?: OutboundButton[]; requestLocation?: boolean }) => Promise<void>,
  location?: { latitude: number; longitude: number },
) {
  // Ingress throttle lives here (not in the engine) so imports and simulations aren't throttled.
  if (!(await rateLimit(`clock:${msg.companyId}:${msg.channel}:${msg.externalId}`, 20, 60))) {
    return reply(REJECTION_MESSAGES.RATE_LIMITED);
  }
  const result = await processClock({
    companyId: msg.companyId,
    action,
    source: msg.channel,
    identity: { kind: "CHAT", channel: msg.channel, externalId: msg.externalId },
    qrToken: state.qrToken,
    latitude: location?.latitude,
    longitude: location?.longitude,
    idempotencyKey: msg.messageId ? `${msg.channel}:${msg.messageId}` : undefined,
  });

  if (!result.ok && result.reason === "GPS_REQUIRED") {
    await setConv(msg, { qrToken: state.qrToken, pendingAction: action });
    return reply(result.message, { requestLocation: true });
  }
  await setConv(msg, { qrToken: state.qrToken });
  return reply(result.message, { buttons: await quickButtons(emp.id, msg.companyId) });
}

async function handleLink(
  msg: InboundMessage,
  code: string,
  reply: (t: string, e?: { buttons?: OutboundButton[] }) => Promise<void>,
) {
  if (!(await rateLimit(`link:${msg.companyId}:${msg.externalId}`, 5, 600))) {
    return reply("Too many attempts. Please wait a few minutes.");
  }
  const [row] = await db
    .select()
    .from(linkCodes)
    .where(
      and(
        eq(linkCodes.codeHash, sha256(code)),
        eq(linkCodes.companyId, msg.companyId),
        eq(linkCodes.channel, msg.channel),
        isNull(linkCodes.usedAt),
        gt(linkCodes.expiresAt, new Date()),
      ),
    );
  if (!row) return reply("That code isn't valid or has expired. Ask your manager for a new one.");

  const [emp] = await db
    .select({ firstName: employees.firstName, status: employees.status })
    .from(employees)
    .where(and(eq(employees.id, row.employeeId), eq(employees.companyId, msg.companyId)));
  if (!emp || emp.status !== "ACTIVE") return reply("This employee profile is not active.");

  const [taken] = await db
    .select({ employeeId: communicationAccounts.employeeId })
    .from(communicationAccounts)
    .where(
      and(
        eq(communicationAccounts.companyId, msg.companyId),
        eq(communicationAccounts.channel, msg.channel),
        eq(communicationAccounts.externalId, msg.externalId),
        isNull(communicationAccounts.revokedAt),
      ),
    );
  if (taken && taken.employeeId !== row.employeeId) {
    return reply("This chat is already linked to another employee. Ask your manager for help.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(communicationAccounts)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(communicationAccounts.employeeId, row.employeeId),
          eq(communicationAccounts.channel, msg.channel),
          isNull(communicationAccounts.revokedAt),
        ),
      );
    await tx
      .insert(communicationAccounts)
      .values({
        companyId: msg.companyId,
        employeeId: row.employeeId,
        channel: msg.channel,
        externalId: msg.externalId,
        displayName: msg.displayName,
        verifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [communicationAccounts.companyId, communicationAccounts.channel, communicationAccounts.externalId],
        set: { employeeId: row.employeeId, revokedAt: null, verifiedAt: new Date(), displayName: msg.displayName },
      });
    await tx.update(linkCodes).set({ usedAt: new Date() }).where(eq(linkCodes.id, row.id));
  });

  return reply(`Welcome ${emp.firstName}! Your chat is now linked. Scan your workplace QR code to clock in, or reply MENU.`);
}
