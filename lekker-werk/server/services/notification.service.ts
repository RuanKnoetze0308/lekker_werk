import "server-only";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { notifications } from "@/db/schema";
import type { AuthContext } from "../auth/context";

type NotificationType = (typeof notifications.$inferInsert)["type"];

/**
 * In-app notifications are persisted here. Email/WhatsApp/Telegram delivery plugs in via
 * `deliverers` later without callers changing: they only ever call `notify()`.
 */
export async function notify(
  input: {
    companyId: string;
    type: NotificationType;
    title: string;
    body?: string;
    userId?: string | null;
    payload?: Record<string, unknown>;
  },
  executor: Db | Tx = db,
) {
  await executor.insert(notifications).values({
    companyId: input.companyId,
    userId: input.userId ?? null,
    type: input.type,
    title: input.title,
    body: input.body,
    payload: input.payload ?? {},
  });
}

export async function listNotifications(ctx: AuthContext, limit = 30) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.companyId, ctx.companyId),
        or(isNull(notifications.userId), eq(notifications.userId, ctx.userId)),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function markAllRead(ctx: AuthContext) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.companyId, ctx.companyId),
        isNull(notifications.readAt),
        or(isNull(notifications.userId), eq(notifications.userId, ctx.userId)),
      ),
    );
}

/** Transactional email is not wired yet; log in dev so reset links can be tested locally. */
export async function sendEmail(to: string, subject: string, body: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[email:dev] to=${to} subject="${subject}"\n${body}`);
  }
  // TODO: plug in SMTP / Resend / Postmark here.
}
