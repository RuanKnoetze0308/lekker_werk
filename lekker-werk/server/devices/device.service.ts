import "server-only";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { clockDevices, clockEvents, locations } from "@/db/schema";
import type { z } from "zod";
import type { deviceCreateSchema, deviceUpdateSchema } from "@/lib/schemas/devices";
import { randomToken, sha256 } from "@/lib/crypto";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "../services/audit.service";

/** Device keys are long random secrets with a recognisable prefix (easy to spot if leaked). */
function newDeviceKey() {
  const key = `lwd_${randomToken(32)}`;
  return { key, keyHash: sha256(key), keyHint: key.slice(0, 10) };
}

async function loadScoped(ctx: AuthContext, id: string) {
  assertCan(ctx, "devices:manage");
  const [row] = await db
    .select()
    .from(clockDevices)
    .where(and(eq(clockDevices.id, id), eq(clockDevices.companyId, ctx.companyId)));
  if (!row) throw Errors.notFound("Device");
  assertLocationAccess(ctx, row.locationId);
  return row;
}

/** A terminal counts as online if it called in within this window (heartbeat or punch). */
const ONLINE_WINDOW_MS = 10 * 60_000;

/** Devices with online status and their punch count over the last 24 hours. */
export async function listDevices(ctx: AuthContext) {
  assertCan(ctx, "devices:manage");
  const now = Date.now();
  const since = new Date(now - 24 * 3600_000);
  const rows = await db
    .select({
      id: clockDevices.id,
      name: clockDevices.name,
      kind: clockDevices.kind,
      serialNumber: clockDevices.serialNumber,
      enabled: clockDevices.enabled,
      fixedAction: clockDevices.fixedAction,
      keyHint: clockDevices.keyHint,
      lastSeenAt: clockDevices.lastSeenAt,
      locationId: clockDevices.locationId,
      locationName: locations.name,
      timezone: locations.timezone,
    })
    .from(clockDevices)
    .innerJoin(locations, eq(locations.id, clockDevices.locationId))
    .where(
      and(
        eq(clockDevices.companyId, ctx.companyId),
        ctx.locationScope === null
          ? undefined
          : ctx.locationScope.length
            ? inArray(clockDevices.locationId, ctx.locationScope)
            : sql`false`,
      ),
    )
    .orderBy(locations.name, clockDevices.name);

  if (!rows.length) return [];
  const counts = await db
    .select({ deviceId: clockEvents.deviceId, n: sql<number>`count(*)::int` })
    .from(clockEvents)
    .where(
      and(
        eq(clockEvents.companyId, ctx.companyId),
        inArray(clockEvents.deviceId, rows.map((r) => r.id)),
        gte(clockEvents.occurredAt, since),
      ),
    )
    .groupBy(clockEvents.deviceId);
  const byId = new Map(counts.map((c) => [c.deviceId, c.n]));
  return rows.map((r) => ({
    ...r,
    online: r.lastSeenAt !== null && now - r.lastSeenAt.getTime() < ONLINE_WINDOW_MS,
    punches24h: byId.get(r.id) ?? 0,
  }));
}

/** Returns the API key exactly once. Only its hash is stored. */
export async function createDevice(ctx: AuthContext, input: z.infer<typeof deviceCreateSchema>) {
  assertCan(ctx, "devices:manage");
  assertLocationAccess(ctx, input.locationId);
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, input.locationId), eq(locations.companyId, ctx.companyId)));
  if (!loc) throw Errors.notFound("Location");

  const k = newDeviceKey();
  const [row] = await db
    .insert(clockDevices)
    .values({
      companyId: ctx.companyId,
      locationId: input.locationId,
      kind: input.kind,
      name: input.name,
      serialNumber: input.serialNumber,
      fixedAction: input.fixedAction ?? null,
      keyHash: k.keyHash,
      keyHint: k.keyHint,
      createdBy: ctx.userId,
    })
    .returning({ id: clockDevices.id });
  await audit(ctx, "device.created", "clock_device", row.id, { name: input.name, kind: input.kind, locationId: input.locationId });
  return { id: row.id, apiKey: k.key };
}

export async function updateDevice(ctx: AuthContext, id: string, input: z.infer<typeof deviceUpdateSchema>) {
  await loadScoped(ctx, id);
  await db.update(clockDevices).set(input).where(eq(clockDevices.id, id));
  await audit(ctx, "device.updated", "clock_device", id, input as Record<string, unknown>);
}

/** The old key stops working immediately. */
export async function rotateDeviceKey(ctx: AuthContext, id: string) {
  await loadScoped(ctx, id);
  const k = newDeviceKey();
  await db.update(clockDevices).set({ keyHash: k.keyHash, keyHint: k.keyHint }).where(eq(clockDevices.id, id));
  await audit(ctx, "device.key_rotated", "clock_device", id);
  return { apiKey: k.key };
}

export async function getDeviceForSimulation(ctx: AuthContext, id: string) {
  return loadScoped(ctx, id);
}

