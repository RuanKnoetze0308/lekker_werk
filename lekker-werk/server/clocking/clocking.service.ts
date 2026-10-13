import "server-only";
import { and, count, desc, eq, gte, lte, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, type Tx } from "@/db/client";
import {
  clockAttempts,
  clockEvents,
  employeeCredentials,
  employeeLocations,
  employees,
  locations,
} from "@/db/schema";
import { distanceMeters } from "@/lib/geo";
import { addDays, formatTime, localDate } from "@/lib/time";
import { getBillingAccess } from "../billing/billing.service";
import { getSettings } from "../services/company.service";
import { recomputeDay } from "../services/attendance.service";
import { notify } from "../services/notification.service";
import { resolveQrToken } from "../services/qr.service";
import { findLockedPeriod } from "../time/period-lock";
import { resolveIdentity } from "./identity";
import { ACTION_VERB, REJECTION_MESSAGES } from "./messages";
import type {
  ClockAction,
  ClockRequest,
  ClockResult,
  ClockState,
  RejectionReasonCode,
} from "./types";

/**
 * The clocking engine. Every clock-in method (chat, QR, RFID, biometric, kiosk, web) arrives
 * here as a ClockRequest. Pipeline:
 *
 *   billing gate -> when -> who (identity.ts) -> employee checks -> where (device / QR / primary)
 *   -> location checks (allowed, GPS) -> idempotency -> [per-employee lock] state machine -> write
 *
 * Transport concerns (rate limiting, webhook auth, device auth, reply formatting) belong to the
 * adapters that call this, not here, so the engine can also be driven by imports and simulations.
 */

/** Device clocks drift and buffer offline; accept their timestamps only inside this window. */
const DEVICE_MAX_BACKDATE_MS = 7 * 24 * 3600_000;
const DEVICE_MAX_FUTURE_MS = 2 * 60_000;

const superseding = alias(clockEvents, "superseding");

/**
 * State from the ledger as of `at` (default now). Taking a point in time lets buffered device
 * punches be validated against the state at the moment they happened, not the state today.
 * Stale open shifts (forgot to clock out) read as OUT.
 */
export async function getClockState(
  employeeId: string,
  maxShiftHours: number,
  at = new Date(),
  executor: Pick<typeof db, "select"> = db,
): Promise<{ state: ClockState; last: { eventType: ClockAction; occurredAt: Date } | null }> {
  const [last] = await executor
    .select({ eventType: clockEvents.eventType, occurredAt: clockEvents.occurredAt })
    .from(clockEvents)
    .where(
      and(
        eq(clockEvents.employeeId, employeeId),
        lte(clockEvents.occurredAt, at),
        eq(clockEvents.validationStatus, "ACCEPTED"),
        notExists(
          db.select({ x: sql`1` }).from(superseding).where(eq(superseding.correctsEventId, clockEvents.id)),
        ),
      ),
    )
    .orderBy(desc(clockEvents.occurredAt))
    .limit(1);

  if (!last || last.eventType === "CLOCK_OUT") return { state: "OUT", last: last ?? null };
  if (at.getTime() - last.occurredAt.getTime() > maxShiftHours * 3600_000) return { state: "OUT", last };
  return { state: last.eventType === "BREAK_START" ? "BREAK" : "IN", last };
}

interface Reject {
  companyId: string | null;
  employeeId: string | null;
  locationId: string | null;
  qrCodeId: string | null;
  credentialId?: string | null;
  req: ClockRequest;
  reason: RejectionReasonCode;
  extra?: Record<string, unknown>;
}

/** Chat identifier kept on attempts so support can trace "it didn't work" reports. */
function externalRef(req: ClockRequest): string | undefined {
  return req.identity.kind === "CHAT" ? req.identity.externalId : undefined;
}

async function logRejection(r: Reject): Promise<ClockResult> {
  await db.insert(clockAttempts).values({
    companyId: r.companyId,
    employeeId: r.employeeId,
    locationId: r.locationId,
    qrCodeId: r.qrCodeId,
    deviceId: r.req.device?.id,
    credentialId: r.credentialId ?? null,
    // The column needs a concrete action; a rejected AUTO tap never got far enough to pick one.
    // metadata.requested keeps what was really asked for.
    requestedAction: r.req.action === "AUTO" ? "CLOCK_IN" : r.req.action,
    source: r.req.source,
    status: "REJECTED",
    rejectionReason: r.reason,
    latitude: r.req.latitude,
    longitude: r.req.longitude,
    externalId: externalRef(r.req),
    idempotencyKey: r.req.idempotencyKey,
    metadata: { requested: r.req.action, ...(r.extra ?? {}) },
    createdAt: r.req.now,
  });

  // Repeated failures from one employee in a short window are worth a manager's attention.
  if (r.employeeId && r.companyId && r.reason !== "RATE_LIMITED") {
    const [{ n }] = await db
      .select({ n: count() })
      .from(clockAttempts)
      .where(
        and(
          eq(clockAttempts.employeeId, r.employeeId),
          eq(clockAttempts.status, "REJECTED"),
          gte(clockAttempts.createdAt, new Date((r.req.now ?? new Date()).getTime() - 10 * 60_000)),
        ),
      );
    if (n === 5) {
      await notify({
        companyId: r.companyId,
        type: "UNUSUAL_CLOCKING",
        title: "Repeated failed clocking attempts",
        body: `An employee failed to clock ${n} times in 10 minutes (${r.reason}).`,
        payload: { employeeId: r.employeeId },
      });
    }
  }
  return { ok: false, reason: r.reason, message: REJECTION_MESSAGES[r.reason] };
}

export async function processClock(req: ClockRequest): Promise<ClockResult> {
  const now = req.now ?? new Date();
  const base = { companyId: req.companyId, employeeId: null, locationId: null, qrCodeId: null, req };

  // Clocking pauses (and says why) once the trial / subscription has lapsed.
  if ((await getBillingAccess(req.companyId)).locked) {
    return logRejection({ ...base, reason: "SUBSCRIPTION_INACTIVE" });
  }

  // ---- When ---------------------------------------------------------------------------------
  // Server time, always, except a trusted device replaying punches it buffered while offline.
  let occurredAt = now;
  if (req.capturedAt) {
    const skew = req.capturedAt.getTime() - now.getTime();
    if (req.source !== "DEVICE" || skew > DEVICE_MAX_FUTURE_MS || -skew > DEVICE_MAX_BACKDATE_MS) {
      return logRejection({
        ...base,
        locationId: req.device?.locationId ?? null,
        reason: "TIMESTAMP_OUT_OF_RANGE",
        extra: { capturedAt: req.capturedAt.toISOString() },
      });
    }
    occurredAt = req.capturedAt < now ? req.capturedAt : now;
  }

  // ---- Who ----------------------------------------------------------------------------------
  const who = await resolveIdentity(req.companyId, req.identity);
  if (typeof who === "string") {
    return logRejection({ ...base, locationId: req.device?.locationId ?? null, reason: who });
  }

  const [employee] = await db.select().from(employees).where(eq(employees.id, who.employeeId));
  if (!employee || employee.companyId !== req.companyId) {
    return logRejection({ ...base, reason: "WRONG_COMPANY" });
  }
  const withEmp = { ...base, employeeId: employee.id, locationId: employee.locationId, credentialId: who.credentialId };
  if (employee.status !== "ACTIVE") return logRejection({ ...withEmp, reason: "EMPLOYEE_INACTIVE" });

  const settings = (await getSettings(req.companyId)).attendance;

  // ---- Where --------------------------------------------------------------------------------
  // A device is bolted to one location, a QR code is printed for one; otherwise primary location.
  let locationId = employee.locationId;
  let qrCodeId: string | null = null;
  if (req.device) {
    locationId = req.device.locationId;
  } else if (req.qrToken) {
    const qr = await resolveQrToken(req.qrToken);
    if (!qr || qr.companyId !== req.companyId) return logRejection({ ...withEmp, reason: "QR_INVALID" });
    const typeMismatch =
      (qr.type === "CLOCK_IN" && req.action !== "CLOCK_IN") ||
      (qr.type === "CLOCK_OUT" && req.action !== "CLOCK_OUT");
    if (typeMismatch) return logRejection({ ...withEmp, qrCodeId: qr.id, reason: "QR_INVALID" });
    if (!qr.enabled) return logRejection({ ...withEmp, qrCodeId: qr.id, reason: "QR_DISABLED" });
    if (qr.expiresAt && qr.expiresAt < now) return logRejection({ ...withEmp, qrCodeId: qr.id, reason: "QR_EXPIRED" });
    locationId = qr.locationId;
    qrCodeId = qr.id;
  } else if (req.identity.kind === "CHAT" && settings.requireQrForClocking) {
    // Remote self-service has to prove presence by scanning the QR code on site.
    return logRejection({ ...withEmp, reason: "QR_INVALID" });
  }
  const ctxRej = { ...withEmp, locationId, qrCodeId };

  const allowed = await db
    .select({ id: employeeLocations.locationId })
    .from(employeeLocations)
    .where(eq(employeeLocations.employeeId, employee.id));
  const allowedIds = new Set([employee.locationId, ...allowed.map((a) => a.id)]);
  const [location] = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, locationId), eq(locations.companyId, req.companyId)));
  if (!location || location.status !== "ACTIVE" || !allowedIds.has(locationId)) {
    return logRejection({ ...ctxRej, reason: "NOT_ALLOWED_AT_LOCATION" });
  }

  // Payroll for this day is final (only reachable by a device replaying an old offline buffer).
  const day = localDate(occurredAt, location.timezone);
  if (await findLockedPeriod(req.companyId, day, day)) return logRejection({ ...ctxRej, reason: "PERIOD_LOCKED" });

  // ---- GPS (phones only: a fixed device's position is already known) ------------------------
  let distance: number | null = null;
  const gpsOn = location.gpsValidationEnabled ?? settings.gpsValidationEnabled;
  if (gpsOn && !req.device && location.latitude != null && location.longitude != null) {
    if (req.latitude == null || req.longitude == null) {
      return logRejection({ ...ctxRej, reason: "GPS_REQUIRED" });
    }
    distance = distanceMeters(req.latitude, req.longitude, location.latitude, location.longitude);
    const radius = location.allowedRadiusMeters ?? settings.allowedRadiusMeters;
    if (distance > radius) {
      return logRejection({ ...ctxRej, reason: "OUTSIDE_RADIUS", extra: { distance: Math.round(distance) } });
    }
  }

  if ((req.action === "BREAK_START" || req.action === "BREAK_END") && !settings.breaksEnabled) {
    return logRejection({ ...ctxRej, reason: "CLOCKING_NOT_ALLOWED" });
  }

  // ---- Idempotency (provider retries, devices re-sending a buffered batch) -------------------
  if (req.idempotencyKey) {
    const [seen] = await db
      .select({ id: clockAttempts.id })
      .from(clockAttempts)
      .where(and(eq(clockAttempts.idempotencyKey, req.idempotencyKey), eq(clockAttempts.status, "ACCEPTED")))
      .limit(1);
    if (seen) return logRejection({ ...ctxRej, reason: "DUPLICATE", extra: { replay: true } });
  }

  // ---- State machine + write (serialised per employee) ---------------------------------------
  type Outcome =
    | { reject: RejectionReasonCode }
    | { event: NonNullable<ClockResult["event"]>; state: ClockState };

  const outcome: Outcome = await db.transaction(async (tx: Tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${employee.id}, 0))`);

    const { state, last } = await getClockState(employee.id, settings.maxShiftHours, occurredAt, tx);
    const action = req.action === "AUTO" ? nextAction(state) : req.action;
    const withinDuplicateWindow =
      last !== null &&
      Math.abs(occurredAt.getTime() - last.occurredAt.getTime()) < settings.duplicateWindowSeconds * 1000;

    // A double tap on a reader must not clock someone straight back out.
    if (withinDuplicateWindow && (req.action === "AUTO" || last.eventType === action)) {
      return { reject: "DUPLICATE" as const };
    }

    const reject = transition(state, action);
    if (reject) return { reject };

    const [ev] = await tx
      .insert(clockEvents)
      .values({
        companyId: req.companyId,
        employeeId: employee.id,
        locationId,
        eventType: action,
        occurredAt,
        source: req.source,
        latitude: req.latitude,
        longitude: req.longitude,
        distanceMeters: distance,
        qrCodeId,
        communicationAccountId: who.communicationAccountId,
        deviceId: req.device?.id,
        credentialId: who.credentialId,
        createdAt: now,
      })
      .returning({ id: clockEvents.id });

    await tx.insert(clockAttempts).values({
      companyId: req.companyId,
      employeeId: employee.id,
      locationId,
      qrCodeId,
      deviceId: req.device?.id,
      credentialId: who.credentialId,
      requestedAction: action,
      source: req.source,
      status: "ACCEPTED",
      clockEventId: ev.id,
      latitude: req.latitude,
      longitude: req.longitude,
      externalId: externalRef(req),
      idempotencyKey: req.idempotencyKey,
      metadata: req.action === "AUTO" ? { requested: "AUTO" } : {},
      createdAt: now,
    });

    if (who.credentialId) {
      await tx
        .update(employeeCredentials)
        .set({ lastUsedAt: occurredAt })
        .where(eq(employeeCredentials.id, who.credentialId));
    }

    await recomputeDay(tx, employee.id, day, now);
    await recomputeDay(tx, employee.id, addDays(day, -1), now);

    const next: ClockState =
      action === "CLOCK_IN" || action === "BREAK_END" ? "IN" : action === "BREAK_START" ? "BREAK" : "OUT";
    return {
      event: { id: ev.id, eventType: action, occurredAt, locationName: location.name, timezone: location.timezone },
      state: next,
    };
  });

  if ("reject" in outcome) return logRejection({ ...ctxRej, reason: outcome.reject });

  return {
    ok: true,
    state: outcome.state,
    employee: { id: employee.id, firstName: employee.firstName },
    event: outcome.event,
    message: `You've ${ACTION_VERB[outcome.event.eventType]} at ${formatTime(outcome.event.occurredAt, outcome.event.timezone)} (${outcome.event.locationName}).`,
  };
}

/** What a single "tap" means given where the employee is in their day. */
function nextAction(state: ClockState): ClockAction {
  return state === "OUT" ? "CLOCK_IN" : state === "BREAK" ? "BREAK_END" : "CLOCK_OUT";
}

function transition(state: ClockState, action: ClockAction): RejectionReasonCode | null {
  switch (action) {
    case "CLOCK_IN":
      return state === "OUT" ? null : "ALREADY_CLOCKED_IN";
    case "CLOCK_OUT":
      return state === "IN" ? null : state === "BREAK" ? "ALREADY_ON_BREAK" : "NOT_CLOCKED_IN";
    case "BREAK_START":
      return state === "IN" ? null : state === "BREAK" ? "ALREADY_ON_BREAK" : "NOT_CLOCKED_IN";
    case "BREAK_END":
      return state === "BREAK" ? null : "NOT_ON_BREAK";
  }
}
