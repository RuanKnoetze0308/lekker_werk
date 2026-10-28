import "server-only";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  communicationChannels,
  companies,
  companySettings,
  employeeDataPermissions,
  locations,
  passwordResets,
  sessions,
  users,
  workSchedules,
} from "@/db/schema";
import {
  DUMMY_HASH,
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from "@/lib/crypto";
import { env } from "@/lib/env";
import {
  DEFAULT_COMPANY_SETTINGS,
  DEFAULT_SCHEDULE_DAYS,
  EMPLOYEE_DATA_KEYS,
} from "@/lib/defaults";
import type { LoginInput, SignupInput } from "@/lib/schemas/auth";
import { AppError, Errors } from "../errors";
import { audit } from "./audit.service";
import { createTrial } from "../billing/billing.service";
import { ensureLeaveTypes } from "../time/leave.service";
import { sendEmail } from "./notification.service";
import { createSession } from "../auth/session";
import { clientIpFrom } from "../http/client-ip";
import { isRateLimited, recordHit } from "./rate-limit.service";
import { headers } from "next/headers";

/**
 * Failed sign-ins are throttled per identifier (what was typed, so unknown and real accounts
 * behave the same and nobody can probe which exist):
 * - from one IP: 5 per 15 minutes, which stops password guessing;
 * - from all IPs: 30 per hour, which stops a botnet without letting one attacker lock out a user.
 */
const FAIL_PER_IP = { limit: 5, windowSeconds: 15 * 60 };
const FAIL_PER_ACCOUNT = { limit: 30, windowSeconds: 3600 };

export async function signup(input: SignupInput) {
  const exists = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
  if (exists.length) throw Errors.conflict("An account with this email already exists.");

  const passwordHash = await hashPassword(input.password);

  const { userId, companyId } = await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({
        name: input.companyName,
        registrationNumber: input.registrationNumber || null,
        contactName: input.contactName,
        contactEmail: input.email,
        contactPhone: input.phone,
        preferredChannel: input.preferredChannel,
        hasMultipleLocations: input.locationMode === "MULTIPLE",
        timezone: input.timezone,
      })
      .returning({ id: companies.id });

    const [user] = await tx
      .insert(users)
      .values({
        companyId: company.id,
        email: input.email,
        name: input.contactName,
        passwordHash,
        // Never SUPER_ADMIN from signup: platform access is granted only by scripts/platform-admin.ts.
        role: "COMPANY_ADMIN",
      })
      .returning({ id: users.id });

    const locs = input.locationMode === "ONE" ? input.locations.slice(0, 1) : input.locations;
    await tx.insert(locations).values(
      locs.map((l) => ({
        companyId: company.id,
        name: l.name,
        address: l.address || null,
        latitude: l.latitude ?? null,
        longitude: l.longitude ?? null,
        timezone: input.timezone,
      })),
    );

    await tx.insert(companySettings).values({
      companyId: company.id,
      settings: DEFAULT_COMPANY_SETTINGS,
    });

    // 7-day free trial starts now; the dates are stored and enforced by the billing module.
    await createTrial(tx, company.id);
    await ensureLeaveTypes(company.id, tx);

    // Both channels exist from day one (disabled) so the admin can switch later.
    await tx.insert(communicationChannels).values(
      (["TELEGRAM", "WHATSAPP"] as const).map((channel) => ({
        companyId: company.id,
        channel,
        isDefault: channel === input.preferredChannel,
        webhookSecret: randomToken(24),
      })),
    );

    await tx.insert(employeeDataPermissions).values(
      EMPLOYEE_DATA_KEYS.map((k) => ({
        companyId: company.id,
        permissionKey: k.key,
        enabled: k.defaultOn,
      })),
    );

    await tx.insert(workSchedules).values({
      companyId: company.id,
      name: "Standard week",
      days: DEFAULT_SCHEDULE_DAYS,
      overtimeAfterMinutesPerDay: DEFAULT_COMPANY_SETTINGS.attendance.overtimeAfterMinutesPerDay,
    });

    await audit({ userId: user.id, companyId: company.id }, "settings.changed", "company", company.id, {
      event: "company_created",
    }, tx);

    return { userId: user.id, companyId: company.id };
  });

  await createSession(userId);
  return { userId, companyId };
}

export async function login(input: LoginInput) {
  const identifier = input.identifier.trim().toLowerCase();
  const ip = clientIpFrom(await headers());
  const ipKey = `login-fail:${identifier}:${ip}`;
  const accountKey = `login-fail:${identifier}`;
  if (
    (await isRateLimited(ipKey, FAIL_PER_IP.limit, FAIL_PER_IP.windowSeconds)) ||
    (await isRateLimited(accountKey, FAIL_PER_ACCOUNT.limit, FAIL_PER_ACCOUNT.windowSeconds))
  ) {
    throw new AppError(429, "TOO_MANY_ATTEMPTS", "Too many sign-in attempts. Wait a few minutes and try again.");
  }

  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.email, identifier), eq(users.username, identifier)))
    .limit(1);

  // Always do a hash comparison so response time does not reveal valid accounts.
  const valid = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !valid || user.status !== "ACTIVE") {
    await recordHit(ipKey, FAIL_PER_IP.windowSeconds);
    await recordHit(accountKey, FAIL_PER_ACCOUNT.windowSeconds);
    throw new AppError(401, "BAD_CREDENTIALS", "Incorrect email/username or password.");
  }

  await db
    .update(users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  await createSession(user.id);
  await audit({ userId: user.id, companyId: user.companyId }, "auth.login", "user", user.id);
  return { userId: user.id, role: user.role };
}

export async function requestPasswordReset(email: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!user) return; // never reveal whether the email exists

  const token = randomToken(32);
  await db.insert(passwordResets).values({
    userId: user.id,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  await sendEmail(
    email,
    "Reset your LekkerWerk password",
    `Use this link within one hour: ${env.appUrl}/reset-password?token=${token}`,
  );
}

export async function resetPassword(token: string, password: string) {
  const [row] = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, sha256(token)),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) throw Errors.invalid("This reset link is invalid or has expired.");

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, row.userId));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId)); // force re-login everywhere
  });
  const [u] = await db.select({ companyId: users.companyId }).from(users).where(eq(users.id, row.userId));
  await audit({ userId: row.userId, companyId: u?.companyId ?? null }, "auth.password_reset", "user", row.userId);
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(sql`${sessions.expiresAt} < now()`);
}
