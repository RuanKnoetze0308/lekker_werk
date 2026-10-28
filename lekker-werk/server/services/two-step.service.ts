import "server-only";
import { createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import QRCode from "qrcode";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { decrypt, encrypt, safeEqual, sha256 } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { AuthContext } from "../auth/context";
import { createSession } from "../auth/session";
import { newBackupCodes, newTotpSecret, normaliseBackupCode, otpauthUrl, verifyTotp } from "../auth/totp";
import { AppError, Errors } from "../errors";
import { audit } from "./audit.service";
import { isRateLimited, recordHit } from "./rate-limit.service";

/**
 * Optional two-step login for super admins: an authenticator-app code (TOTP) after the password.
 *
 * Between the two steps the browser holds only a short-lived signed "challenge" cookie naming the
 * user; no session exists until the code is accepted.
 */

const CHALLENGE_COOKIE = "lw_2fa";
const CHALLENGE_TTL_MS = 5 * 60_000;
/** Wrong codes per user: 5 per 15 minutes (a 6-digit code can't be brute forced at that rate). */
const FAIL_LIMIT = { limit: 5, windowSeconds: 15 * 60 };

function challengeMac(payload: string) {
  return createHmac("sha256", `two-step-challenge:${env.encryptionKey}`).update(payload).digest("base64url");
}

/** Called by login() once the password is right, instead of creating a session. */
export async function startChallenge(userId: string) {
  const payload = `${userId}.${Date.now() + CHALLENGE_TTL_MS}`;
  const jar = await cookies();
  jar.set(CHALLENGE_COOKIE, `${payload}.${challengeMac(payload)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: env.isProd,
    path: "/api/auth",
    maxAge: CHALLENGE_TTL_MS / 1000,
  });
}

async function challengeUserId(): Promise<string | null> {
  const raw = (await cookies()).get(CHALLENGE_COOKIE)?.value ?? "";
  const [userId, exp, mac] = raw.split(".");
  if (!userId || !exp || !mac) return null;
  if (!safeEqual(mac, challengeMac(`${userId}.${exp}`)) || Number(exp) < Date.now()) return null;
  return userId;
}

type UserRow = typeof users.$inferSelect;

/**
 * Accepts a valid authenticator code or an unused backup code and marks it used. The "used"
 * check is part of the UPDATE, so two simultaneous requests can't both spend the same code.
 * Wrong codes count towards FAIL_LIMIT.
 */
async function consumeCode(user: UserRow, code: string): Promise<"totp" | "backup"> {
  const failKey = `two-step-fail:${user.id}`;
  if (await isRateLimited(failKey, FAIL_LIMIT.limit, FAIL_LIMIT.windowSeconds)) {
    throw new AppError(429, "TOO_MANY_ATTEMPTS", "Too many wrong codes. Wait a few minutes and try again.");
  }
  if (user.totpSecret) {
    const step = verifyTotp(decrypt(user.totpSecret), code, user.totpLastStep);
    if (step !== null) {
      const ok = await db
        .update(users)
        .set({ totpLastStep: step })
        .where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
        .returning({ id: users.id });
      if (ok.length) return "totp";
    }
    const backup = normaliseBackupCode(code);
    if (backup.length === 10) {
      const hash = sha256(backup);
      const ok = await db
        .update(users)
        .set({ totpBackupCodes: sql`${users.totpBackupCodes} - ${hash}::text` })
        .where(and(eq(users.id, user.id), sql`${users.totpBackupCodes} ? ${hash}`))
        .returning({ id: users.id });
      if (ok.length) return "backup";
    }
  }
  await recordHit(failKey, FAIL_LIMIT.windowSeconds);
  throw new AppError(422, "BAD_CODE", "That code isn't right. Check your authenticator app and try again.");
}

/** Second login step. Creates the session when the code is right. */
export async function completeChallenge(code: string) {
  const userId = await challengeUserId();
  if (!userId) throw new AppError(401, "TWO_STEP_EXPIRED", "Your sign-in timed out. Enter your password again.");
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || user.status !== "ACTIVE" || !user.totpEnabledAt) {
    throw new AppError(401, "TWO_STEP_EXPIRED", "Your sign-in timed out. Enter your password again.");
  }
  const used = await consumeCode(user, code);
  (await cookies()).delete({ name: CHALLENGE_COOKIE, path: "/api/auth" });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  await createSession(user.id);
  await audit({ userId: user.id, companyId: user.companyId }, "auth.login", "user", user.id, { twoStep: used });
  return { role: user.role };
}

// ---- Setup (System portal -> Security) ----------------------------------------------------------

function assertSuperAdmin(ctx: AuthContext) {
  if (ctx.role !== "SUPER_ADMIN") throw Errors.notFound();
}

async function loadUser(ctx: AuthContext) {
  const [user] = await db.select().from(users).where(eq(users.id, ctx.userId));
  if (!user) throw Errors.notFound("User");
  return user;
}

export async function twoStepStatus(ctx: AuthContext) {
  assertSuperAdmin(ctx);
  const user = await loadUser(ctx);
  return { enabled: Boolean(user.totpEnabledAt), enabledAt: user.totpEnabledAt, backupCodesLeft: user.totpBackupCodes.length };
}

/** Step 1: a new secret (not active yet) and the QR code to scan it. */
export async function beginTwoStepSetup(ctx: AuthContext) {
  assertSuperAdmin(ctx);
  const user = await loadUser(ctx);
  if (user.totpEnabledAt) throw Errors.conflict("Two-step login is already on. Turn it off first to set up a new phone.");
  const secret = newTotpSecret();
  await db.update(users).set({ totpSecret: encrypt(secret), totpLastStep: null }).where(eq(users.id, user.id));
  const url = otpauthUrl(secret, user.email);
  const qrSvg = await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return { secret, qrSvg };
}

/** Step 2: the first code from the app proves it's set up. Returns backup codes, shown once. */
export async function enableTwoStep(ctx: AuthContext, code: string) {
  assertSuperAdmin(ctx);
  const user = await loadUser(ctx);
  if (user.totpEnabledAt) throw Errors.conflict("Two-step login is already on.");
  if (!user.totpSecret) throw Errors.invalid("Start the setup first.");
  const step = verifyTotp(decrypt(user.totpSecret), code, null);
  if (step === null) throw new AppError(422, "BAD_CODE", "That code isn't right. Check the time on your phone and try again.");
  const backupCodes = newBackupCodes();
  await db
    .update(users)
    .set({
      totpEnabledAt: new Date(),
      totpLastStep: step,
      totpBackupCodes: backupCodes.map((c) => sha256(normaliseBackupCode(c))),
    })
    .where(eq(users.id, user.id));
  await audit(ctx, "auth.two_step_enabled", "user", user.id);
  return { backupCodes };
}

/** Needs a current code (or backup code), so a hijacked session alone can't turn it off. */
export async function disableTwoStep(ctx: AuthContext, code: string) {
  assertSuperAdmin(ctx);
  const user = await loadUser(ctx);
  if (!user.totpEnabledAt) return;
  await consumeCode(user, code);
  await db
    .update(users)
    .set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpBackupCodes: [] })
    .where(eq(users.id, user.id));
  await audit(ctx, "auth.two_step_disabled", "user", user.id);
}
