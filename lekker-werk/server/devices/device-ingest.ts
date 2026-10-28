import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clockDevices } from "@/db/schema";
import type { PunchInput } from "@/lib/schemas/devices";
import { sha256 } from "@/lib/crypto";
import { formatTime } from "@/lib/time";
import { AppError, Errors } from "../errors";
import { processClock } from "../clocking/clocking.service";
import { REJECTION_MESSAGES } from "../clocking/messages";
import { notify } from "../services/notification.service";
import { isRateLimited, rateLimit, recordHit } from "../services/rate-limit.service";

/**
 * Device adapter: the bridge between physical terminals (RFID/NFC readers, biometric scanners,
 * kiosks) and the clocking engine. Authenticates the terminal, then turns each punch into a
 * ClockRequest. Any hardware vendor can integrate by speaking this small JSON API
 * (see docs/api/API_CATALOG.md -> Device API).
 */

export type Device = typeof clockDevices.$inferSelect;

export async function authenticateDevice(authorization: string | null, ip: string): Promise<Device> {
  const key = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!key.startsWith("lwd_")) throw Errors.unauthenticated();
  const [device] = await db.select().from(clockDevices).where(eq(clockDevices.keyHash, sha256(key)));
  if (!device) throw Errors.unauthenticated();
  if (!device.enabled) throw new AppError(403, "DEVICE_DISABLED", REJECTION_MESSAGES.DEVICE_DISABLED);
  await db.update(clockDevices).set({ lastSeenAt: new Date(), lastIp: ip }).where(eq(clockDevices.id, device.id));
  return device;
}

/**
 * Unknown cards / PINs per terminal: 10 per 10 minutes, then the terminal refuses punches until the
 * window ends. A 4-digit PIN would otherwise be guessable through a stolen device key. Admins
 * get one notification per window.
 */
const BAD_CREDENTIAL_LIMIT = { limit: 10, windowSeconds: 600 };

function badCredentialGuard(device: Device) {
  const key = `device-bad-credential:${device.id}`;
  return {
    blocked: () => isRateLimited(key, BAD_CREDENTIAL_LIMIT.limit, BAD_CREDENTIAL_LIMIT.windowSeconds),
    async record() {
      await recordHit(key, BAD_CREDENTIAL_LIMIT.windowSeconds);
      if (!(await isRateLimited(key, BAD_CREDENTIAL_LIMIT.limit, BAD_CREDENTIAL_LIMIT.windowSeconds))) return;
      // rateLimit(…, 1, …) is true only for the first call in the window: one alert per window.
      if (!(await rateLimit(`device-bad-credential-alert:${device.id}`, 1, BAD_CREDENTIAL_LIMIT.windowSeconds))) return;
      await notify({
        companyId: device.companyId,
        type: "UNUSUAL_CLOCKING",
        title: `Many unknown cards or PINs on ${device.name}`,
        body: `${BAD_CREDENTIAL_LIMIT.limit} unrecognised cards or PINs in ${BAD_CREDENTIAL_LIMIT.windowSeconds / 60} minutes. The terminal is paused for a few minutes. If this wasn't staff, rotate its key under Devices.`,
        payload: { deviceId: device.id },
      });
    },
  };
}

export interface PunchResult {
  punchId: string | null;
  status: "ACCEPTED" | "REJECTED" | "DUPLICATE";
  reason: string | null;
  /** Short text for the terminal's screen / speaker. */
  display: string;
  eventType?: string;
  occurredAt?: string;
}

/**
 * Processes punches oldest-first so a buffered offline batch replays in the order it happened.
 * `now` is only overridden by simulations; real devices always get server receipt time.
 */
export async function submitPunches(device: Device, punches: PunchInput[], opts: { now?: Date } = {}) {
  // Punches without a capture time happened "now", i.e. after any buffered ones.
  const order = punches
    .map((p, i) => ({ p, i, t: p.capturedAt?.getTime() ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.t - b.t);
  // Results go back in the order the device sent them, so it can match them up by position too.
  const results: PunchResult[] = new Array(punches.length);
  const guard = badCredentialGuard(device);
  for (const { p, i } of order) {
    if (await guard.blocked()) {
      results[i] = { punchId: p.punchId ?? null, status: "REJECTED", reason: "RATE_LIMITED", display: REJECTION_MESSAGES.RATE_LIMITED };
      continue;
    }
    const r = await processClock({
      companyId: device.companyId,
      action: p.action ?? device.fixedAction ?? "AUTO",
      source: "DEVICE",
      identity: { kind: "CREDENTIAL", credentialKind: p.credential.kind, value: p.credential.value },
      device: { id: device.id, locationId: device.locationId },
      capturedAt: p.capturedAt,
      idempotencyKey: p.punchId ? `device:${device.id}:${p.punchId}` : undefined,
      now: opts.now,
    });
    if (r.ok && r.event) {
      results[i] = {
        punchId: p.punchId ?? null,
        status: "ACCEPTED",
        reason: null,
        display: `${r.employee?.firstName ?? ""}: ${DISPLAY_VERB[r.event.eventType]} ${formatTime(r.event.occurredAt, r.event.timezone)}`,
        eventType: r.event.eventType,
        occurredAt: r.event.occurredAt.toISOString(),
      };
    } else {
      if (r.reason === "CREDENTIAL_UNKNOWN") await guard.record();
      results[i] = {
        punchId: p.punchId ?? null,
        status: r.reason === "DUPLICATE" ? "DUPLICATE" : "REJECTED",
        reason: r.reason ?? null,
        display: r.message,
      };
    }
  }
  return results;
}

const DISPLAY_VERB = {
  CLOCK_IN: "clocked in",
  CLOCK_OUT: "clocked out",
  BREAK_START: "break started",
  BREAK_END: "break ended",
} as const;
