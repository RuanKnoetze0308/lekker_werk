import "server-only";
import { desc, eq } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { auditLogs, users } from "@/db/schema";
import type { AuthContext } from "../auth/context";

export type AuditAction =
  | "employee.created"
  | "employee.updated"
  | "employee.deactivated"
  | "employee.reactivated"
  | "location.created"
  | "location.updated"
  | "location.deactivated"
  | "qr.created"
  | "qr.regenerated"
  | "qr.disabled"
  | "qr.enabled"
  | "settings.changed"
  | "channel.configured"
  | "permission.changed"
  | "integration.connected"
  | "integration.updated"
  | "integration.disconnected"
  | "clock_event.corrected"
  | "user.created"
  | "user.updated"
  | "schedule.changed"
  | "device.created"
  | "device.updated"
  | "device.key_rotated"
  | "credential.issued"
  | "credential.revoked"
  | "integration.requested"
  | "auth.login"
  | "auth.password_reset";

export async function audit(
  ctx: { userId: string | null; companyId: string | null },
  action: AuditAction,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
  executor: Db | Tx = db,
) {
  await executor.insert(auditLogs).values({
    companyId: ctx.companyId,
    userId: ctx.userId,
    action,
    entityType,
    entityId,
    metadata,
  });
}

export async function listAuditLogs(ctx: AuthContext, limit = 100) {
  return db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      userName: users.name,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(eq(auditLogs.companyId, ctx.companyId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}
