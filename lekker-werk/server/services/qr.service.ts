import "server-only";
import QRCode from "qrcode";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { locations, qrCodes } from "@/db/schema";
import type { z } from "zod";
import type { qrCreateSchema } from "@/lib/schemas/workforce";
import { decrypt, encrypt, randomToken, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "./audit.service";
import { notify } from "./notification.service";

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
      tokenHash: t.tokenHash,
      encryptedToken: t.encryptedToken,
      tokenHint: t.tokenHint,
      expiresAt: input.type === "TEMPORARY" ? (input.expiresAt ?? new Date(Date.now() + 24 * 3600_000)) : null,
      createdBy: ctx.userId,
    })
    .returning({ id: qrCodes.id });
  await audit(ctx, "qr.created", "qr_code", row.id, { label: input.label, locationId: input.locationId });
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

/** For download / print / share. Renders the QR on demand from the decrypted token. */
export async function getQrAsset(ctx: AuthContext, id: string) {
  const row = await loadScoped(ctx, id);
  const url = qrUrl(decrypt(row.encryptedToken));
  const [loc] = await db.select({ name: locations.name }).from(locations).where(eq(locations.id, row.locationId));
  const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
  const png = await QRCode.toBuffer(url, { margin: 2, width: 1024, errorCorrectionLevel: "M" });
  return { url, svg, png, label: row.label, locationName: loc?.name ?? "", enabled: row.enabled };
}

/** Raw token for server-side tools that need to "scan" a code (chat simulator, demo seed). */
export async function getQrToken(ctx: AuthContext, id: string) {
  const row = await loadScoped(ctx, id);
  return decrypt(row.encryptedToken);
}

/** Public resolution of a scanned token. Returns null for unknown tokens (no detail leaked). */
export async function resolveQrToken(token: string) {
  if (!token || token.length > 100) return null;
  const [row] = await db.select().from(qrCodes).where(eq(qrCodes.tokenHash, sha256(token)));
  return row ?? null;
}
