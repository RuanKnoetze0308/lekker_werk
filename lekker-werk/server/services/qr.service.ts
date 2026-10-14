import "server-only";
import QRCode from "qrcode";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { locations, qrCodes } from "@/db/schema";
import type { z } from "zod";
import type { qrCreateSchema } from "@/lib/schemas/workforce";
import { createHmac } from "node:crypto";
import { decrypt, encrypt, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "./audit.service";
import { notify } from "./notification.service";
import { isDynamicToken, mintDynamicToken, parseDynamicToken, verifyDynamicToken } from "../clocking/dynamic-qr";

/**
 * How long a dynamic token stays usable after it leaves the screen:
 * - "scan": opening the link / first chat message. Short, so a forwarded photo is useless.
 * - "clock": the employee then taps Clock in / out in the chat, which can take a few minutes.
 */
const DYNAMIC_MAX_AGE = { scan: 120, clock: 15 * 60 } as const;
export type QrStage = keyof typeof DYNAMIC_MAX_AGE;

export function qrUrl(token: string) {
  return `${env.appUrl}/q/${token}`;
}

function newToken() {
  const token = randomToken(32);
  return { token, tokenHash: sha256(token), encryptedToken: encrypt(token), tokenHint: token.slice(0, 6) };
}

async function loadScoped(ctx: AuthContext, id: string) {
  assertCan(ctx, "qr:manage");
  const [row] = await db
    .select()
    .from(qrCodes)
    .where(and(eq(qrCodes.id, id), eq(qrCodes.companyId, ctx.companyId)));
  if (!row) throw Errors.notFound("QR code");
  assertLocationAccess(ctx, row.locationId);
  return row;
}

export async function listQrCodes(ctx: AuthContext, locationId?: string) {
  assertCan(ctx, "qr:manage");
  if (locationId) assertLocationAccess(ctx, locationId);
  return db
    .select({
      id: qrCodes.id,
      label: qrCodes.label,
      type: qrCodes.type,
      mode: qrCodes.mode,
      rotationSeconds: qrCodes.rotationSeconds,
      enabled: qrCodes.enabled,
      tokenHint: qrCodes.tokenHint,
      expiresAt: qrCodes.expiresAt,
      createdAt: qrCodes.createdAt,
      locationId: qrCodes.locationId,
      locationName: locations.name,
    })
    .from(qrCodes)
    .innerJoin(locations, eq(locations.id, qrCodes.locationId))
    .where(
      and(
        eq(qrCodes.companyId, ctx.companyId),
        locationId ? eq(qrCodes.locationId, locationId) : undefined,
        ctx.locationScope === null
          ? undefined
          : ctx.locationScope.length
            ? inArray(qrCodes.locationId, ctx.locationScope)
            : sql`false`,
      ),
    )
    .orderBy(desc(qrCodes.createdAt));
}

export async function createQrCode(ctx: AuthContext, input: z.infer<typeof qrCreateSchema>) {
  assertCan(ctx, "qr:manage");
  assertLocationAccess(ctx, input.locationId);
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, input.locationId), eq(locations.companyId, ctx.companyId)));
  if (!loc) throw Errors.notFound("Location");

  const t = newToken();
  const [row] = await db
    .insert(qrCodes)
    .values({
      companyId: ctx.companyId,
      locationId: input.locationId,
      label: input.label,
      type: input.type,
      mode: input.mode,
      rotationSeconds: input.rotationSeconds,
      tokenHash: t.tokenHash,
      encryptedToken: t.encryptedToken,
      tokenHint: t.tokenHint,
      expiresAt: input.type === "TEMPORARY" ? (input.expiresAt ?? new Date(Date.now() + 24 * 3600_000)) : null,
      createdBy: ctx.userId,
    })
    .returning({ id: qrCodes.id });
  await audit(ctx, "qr.created", "qr_code", row.id, { label: input.label, locationId: input.locationId, mode: input.mode });
  return row;
}

/** Old code is disabled immediately; the new one points at the same location/config. */
export async function regenerateQrCode(ctx: AuthContext, id: string) {
  const old = await loadScoped(ctx, id);
  const t = newToken();
  return db.transaction(async (tx) => {
    await tx.update(qrCodes).set({ enabled: false, disabledAt: new Date() }).where(eq(qrCodes.id, old.id));
    const [row] = await tx
      .insert(qrCodes)
      .values({
        companyId: old.companyId,
        locationId: old.locationId,
        label: old.label,
        type: old.type,
        mode: old.mode,
        rotationSeconds: old.rotationSeconds,
        expiresAt: old.expiresAt,
        tokenHash: t.tokenHash,
        encryptedToken: t.encryptedToken,
        tokenHint: t.tokenHint,
        regeneratedFromId: old.id,
        createdBy: ctx.userId,
      })
      .returning({ id: qrCodes.id });
    await audit(ctx, "qr.regenerated", "qr_code", row.id, { previous: old.id }, tx);
    return row;
  });
}

export async function setQrEnabled(ctx: AuthContext, id: string, enabled: boolean) {
  const row = await loadScoped(ctx, id);
  await db
    .update(qrCodes)
    .set({ enabled, disabledAt: enabled ? null : new Date() })
    .where(eq(qrCodes.id, id));
  await audit(ctx, enabled ? "qr.enabled" : "qr.disabled", "qr_code", id, { label: row.label });
  if (!enabled) {
    await notify({
      companyId: ctx.companyId,
      type: "QR_DISABLED",
      title: `QR code disabled: ${row.label}`,
      payload: { qrCodeId: id },
    });
  }
}

/** The token a scanner should see right now: the fixed one, or the current rotation of a dynamic code. */
function currentToken(row: typeof qrCodes.$inferSelect) {
  const secret = decrypt(row.encryptedToken);
  return row.mode === "DYNAMIC" ? mintDynamicToken(row.id, secret, row.rotationSeconds) : { token: secret, rotatesAt: null };
}

/** For download / print / share. Renders the QR on demand (a dynamic code renders its current rotation). */
export async function getQrAsset(ctx: AuthContext, id: string) {
  const row = await loadScoped(ctx, id);
  const url = qrUrl(currentToken(row).token);
  const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, row.locationId));
  const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
  const png = await QRCode.toBuffer(url, { margin: 2, width: 1024, errorCorrectionLevel: "M" });
  return { url, svg, png, label: row.label, locationName: loc?.name ?? "", enabled: row.enabled, mode: row.mode };
}

/** Token for server-side tools that need to "scan" a code (chat simulator, demo seed). */
export async function getQrToken(ctx: AuthContext, id: string) {
  const row = await loadScoped(ctx, id);
  return currentToken(row).token;
}

/**
 * Public resolution of a scanned token. Returns null for unknown tokens (no detail leaked).
 * Dynamic codes only resolve through a fresh rotating token: their underlying secret is never a QR.
 */
export async function resolveQrToken(token: string, stage: QrStage = "clock") {
  if (!token || token.length > 100) return null;
  if (isDynamicToken(token)) {
    const parsed = parseDynamicToken(token);
    if (!parsed) return null;
    const [row] = await db.select().from(qrCodes).where(eq(qrCodes.id, parsed.codeId));
    if (!row || row.mode !== "DYNAMIC") return null;
    const ok = verifyDynamicToken(token, decrypt(row.encryptedToken), row.rotationSeconds, DYNAMIC_MAX_AGE[stage]);
    return ok ? row : null;
  }
  const [row] = await db.select().from(qrCodes).where(eq(qrCodes.tokenHash, sha256(token)));
  return row && row.mode === "STATIC" ? row : null;
}

// ---- Display screen for dynamic codes -------------------------------------------------------------------

/**
 * Unguessable link for the screen that shows a dynamic code (a tablet at the door needs no login).
 * Derived from the code's secret, so "Regenerate" also revokes every display link.
 */
function displayKey(row: typeof qrCodes.$inferSelect) {
  if (row.mode !== "DYNAMIC") return null;
  const idPart = Buffer.from(row.id.replace(/-/g, ""), "hex").toString("base64url");
  const mac = createHmac("sha256", decrypt(row.encryptedToken)).update(`display:${row.id}`).digest("base64url").slice(0, 22);
  return `${idPart}${mac}`;
}

export function qrDisplayUrl(key: string) {
  return `${env.appUrl}/qr-display/${key}`;
}

export async function getQrDisplayLink(ctx: AuthContext, id: string) {
  const row = await loadScoped(ctx, id);
  const key = displayKey(row);
  if (!key) throw Errors.invalid("Only dynamic QR codes have a display screen. Print static codes instead.");
  return { url: qrDisplayUrl(key) };
}

/** What the display screen polls: the current QR plus when it changes. Null for a bad / revoked key. */
export async function getDisplayFrame(key: string) {
  if (!/^[\w-]{44}$/.test(key)) return null;
  const hex = Buffer.from(key.slice(0, 22), "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const [row] = await db.select().from(qrCodes).where(eq(qrCodes.id, id));
  const expected = row ? displayKey(row) : null;
  if (!row || !expected || !safeEqual(expected, key)) return null;
  const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, row.locationId));
  const active = row.enabled && !(row.expiresAt && row.expiresAt < new Date());
  if (!active) return { active: false as const, label: row.label, locationName: loc?.name ?? "" };
  const { token, rotatesAt } = mintDynamicToken(row.id, decrypt(row.encryptedToken), row.rotationSeconds);
  const svg = await QRCode.toString(qrUrl(token), { type: "svg", margin: 2, errorCorrectionLevel: "M" });
  return {
    active: true as const,
    label: row.label,
    locationName: loc?.name ?? "",
    svg,
    rotatesAt,
    rotationSeconds: row.rotationSeconds,
    // Lets the screen correct for its own clock being off.
    serverNow: Date.now(),
  };
}
