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
  | "employee.terms_changed"
  | "leave.type_changed"
  | "leave.requested"
  | "leave.approved"
  | "leave.declined"
  | "leave.cancelled"
  | "leave.balance_adjusted"
  | "absence.resolved"
  | "closure.created"
  | "closure.deleted"
  | "holiday.added"
  | "payroll.locked"
  | "payroll.reopened"
  | "payroll.exported"
  | "auth.login"
  | "auth.password_reset"
  | "auth.two_step_enabled"
  | "auth.two_step_disabled"
  | "platform.promoted"
  | "platform.demoted"
  | "platform.tenant_entered"
  | "platform.tenant_exited"
  | "shop.product_changed"
  | "shop.order_created"
  | "shop.order_paid"
  | "shop.order_updated";

export async function audit(
  ctx: { userId: string | null; companyId: string | null; impersonating?: boolean },
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
    // A super admin working inside a tenant through the System portal is marked on every entry.
    metadata: ctx.impersonating ? { ...metadata, viaSystemPortal: true } : metadata,
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
