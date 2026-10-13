import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, importedHours, integrations, integrationSyncs } from "@/db/schema";
import type { z } from "zod";
import type { integrationSchema } from "@/lib/schemas/settings";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { catalogByProvider } from "@/lib/integration-catalog";
import { assertCan, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { providers } from "../integrations/registry";
import type { ProviderSettings } from "../integrations/types";
import { assertWithinPlan } from "../billing/billing.service";
import { audit } from "./audit.service";
import { notify } from "./notification.service";

type IntegrationRow = typeof integrations.$inferSelect;

/** Browser-safe view. Credentials are never included, only whether they exist. */
function toPublic(r: IntegrationRow) {
  return {
    id: r.id,
    provider: r.provider,
    category: r.category,
    name: r.name,
    enabled: r.enabled,
    config: r.config as Record<string, string>,
    hasCredentials: Boolean(r.encryptedCredentials),
    syncFrequencyMinutes: r.syncFrequencyMinutes,
    lastSuccessfulSyncAt: r.lastSuccessfulSyncAt,
    lastFailedSyncAt: r.lastFailedSyncAt,
    lastError: r.lastError,
    nextSyncAt: r.nextSyncAt,
  };
}

async function load(ctx: AuthContext, id: string) {
  assertCan(ctx, "integrations:manage");
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.id, id), eq(integrations.companyId, ctx.companyId)));
  if (!row) throw Errors.notFound("Integration");
  return row;
}

export async function listIntegrations(ctx: AuthContext) {
  assertCan(ctx, "integrations:manage");
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.companyId, ctx.companyId))
    .orderBy(desc(integrations.createdAt));
  return rows.map(toPublic);
}

function validateFields(input: z.infer<typeof integrationSchema>, existingHasCreds: boolean) {
  const meta = catalogByProvider[input.provider];
  for (const f of meta.configFields) {
    if (f.required && !input.config[f.key]) throw Errors.invalid(`${f.label} is required.`);
  }
  if (!existingHasCreds || input.credentials) {
    for (const f of meta.credentialFields) {
      if (f.required && !input.credentials?.[f.key]) throw Errors.invalid(`${f.label} is required.`);
    }
  }
}

export async function saveIntegration(
  ctx: AuthContext,
  input: z.infer<typeof integrationSchema>,
  id?: string,
) {
  assertCan(ctx, "integrations:manage");
  const existing = id ? await load(ctx, id) : null;
  validateFields(input, Boolean(existing?.encryptedCredentials));
  // Only count against the plan when this save turns on an integration that wasn't already on.
  if (input.enabled && !existing?.enabled) await assertWithinPlan(ctx.companyId, "integrations");

  // Partial credential updates merge with what is stored; blank values keep the old secret.
  let encrypted = existing?.encryptedCredentials ?? null;
  if (input.credentials) {
    const prev = decryptJson<Record<string, string>>(existing?.encryptedCredentials);
    const merged = { ...prev };
    for (const [k, v] of Object.entries(input.credentials)) if (v) merged[k] = v;
    encrypted = encryptJson(merged);
  }

  const values = {
    companyId: ctx.companyId,
    provider: input.provider,
    category: input.category,
    name: input.name,
    enabled: input.enabled,
    config: input.config,
    encryptedCredentials: encrypted,
    syncFrequencyMinutes: input.syncFrequencyMinutes,
    nextSyncAt: input.enabled ? (existing?.nextSyncAt ?? new Date()) : null,
  };

  if (existing) {
    await db.update(integrations).set(values).where(eq(integrations.id, existing.id));
    await audit(ctx, "integration.updated", "integration", existing.id, { provider: input.provider, enabled: input.enabled });
    return existing.id;
  }
  const [row] = await db.insert(integrations).values(values).returning({ id: integrations.id });
  await audit(ctx, "integration.connected", "integration", row.id, { provider: input.provider });
  return row.id;
}

export async function disconnectIntegration(ctx: AuthContext, id: string) {
  const row = await load(ctx, id);
  await db
    .update(integrations)
    .set({ enabled: false, encryptedCredentials: null, nextSyncAt: null })
    .where(eq(integrations.id, row.id));
  await audit(ctx, "integration.disconnected", "integration", id, { provider: row.provider });
}

function settingsOf(row: IntegrationRow): ProviderSettings {
  return {
    config: row.config as Record<string, string>,
    credentials: decryptJson<Record<string, string>>(row.encryptedCredentials),
  };
}

export async function testIntegration(ctx: AuthContext, id: string) {
  const row = await load(ctx, id);
  await providers[row.provider].testConnection(settingsOf(row));
}

export async function requestSync(ctx: AuthContext, id: string) {
  const row = await load(ctx, id);
  const [open] = await db
    .select({ id: integrationSyncs.id })
    .from(integrationSyncs)
    .where(and(eq(integrationSyncs.integrationId, id), sql`${integrationSyncs.status} in ('QUEUED','RUNNING')`))
    .limit(1);
  if (open) throw Errors.conflict("A sync is already queued or running.");
  await db.insert(integrationSyncs).values({ companyId: row.companyId, integrationId: id });
}

export async function listSyncs(ctx: AuthContext, integrationId: string, limit = 20) {
  await load(ctx, integrationId);
  return db
    .select()
    .from(integrationSyncs)
    .where(and(eq(integrationSyncs.integrationId, integrationId), eq(integrationSyncs.companyId, ctx.companyId)))
    .orderBy(desc(integrationSyncs.createdAt))
    .limit(limit);
}

export async function importedHoursSummary(ctx: AuthContext, from: string, to: string) {
  assertCan(ctx, "integrations:manage");
  const [r] = await db
    .select({
      records: sql<number>`count(*)::int`,
      hours: sql<number>`coalesce(sum(${importedHours.hours}),0)::float`,
    })
    .from(importedHours)
    .where(
      and(
        eq(importedHours.companyId, ctx.companyId),
        sql`${importedHours.workDate} >= ${from}`,
        sql`${importedHours.workDate} <= ${to}`,
      ),
    );
  return r;
}

// ---- Background jobs (invoked by /api/jobs/sync; the dashboard never waits on an ERP) ---------------

export async function runSyncJobs(maxPerRun = 10) {
  // Unstick syncs whose worker died.
  await db.execute(sql`update integration_syncs set status='FAILED', finished_at=now(), error_message='Timed out'
    where status='RUNNING' and started_at < now() - interval '30 minutes'`);

  // Enqueue anything due that isn't already in flight.
  await db.execute(sql`insert into integration_syncs (company_id, integration_id, status)
    select i.company_id, i.id, 'QUEUED' from integrations i
    where i.enabled and (i.next_sync_at is null or i.next_sync_at <= now())
      and not exists (select 1 from integration_syncs s where s.integration_id = i.id and s.status in ('QUEUED','RUNNING'))`);

  // Claim work without double-processing when several workers run.
  const claimed = (
    await db.execute(sql`update integration_syncs set status='RUNNING', started_at=now()
      where id in (select id from integration_syncs where status='QUEUED' order by created_at limit ${maxPerRun} for update skip locked)
      returning id, integration_id, company_id`)
  ).rows as { id: string; integration_id: string; company_id: string }[];

  let ok = 0;
  for (const c of claimed) {
    if (await processSync(c.id, c.integration_id, c.company_id)) ok++;
  }
  return { processed: claimed.length, succeeded: ok };
}

async function processSync(syncId: string, integrationId: string, companyId: string) {
  const started = Date.now();
  const [row] = await db.select().from(integrations).where(eq(integrations.id, integrationId));
  try {
    if (!row) throw new Error("Integration missing");
    const provider = providers[row.provider];
    const now = new Date();
    const from = new Date((row.lastSuccessfulSyncAt ?? new Date(now.getTime() - 30 * 86400_000)).getTime() - 86400_000);
    const hours = await provider.fetchHours(settingsOf(row), { from, to: now });

    const emps = await db
      .select({ id: employees.id, num: employees.employeeNumber })
      .from(employees)
      .where(eq(employees.companyId, companyId));
    const byNumber = new Map(emps.map((e) => [e.num, e.id]));

    for (let i = 0; i < hours.length; i += 500) {
      const batch = hours.slice(i, i + 500).map((h) => ({
        companyId,
        integrationId,
        employeeId: byNumber.get(h.externalEmployeeRef) ?? null,
        externalEmployeeRef: h.externalEmployeeRef,
        workDate: h.workDate,
        hours: String(h.hours),
        externalRecordId: h.externalRecordId,
        raw: h.raw ?? null,
      }));
      await db
        .insert(importedHours)
        .values(batch)
        .onConflictDoUpdate({
          target: [importedHours.integrationId, importedHours.externalRecordId],
          set: {
            employeeId: sql`excluded.employee_id`,
            workDate: sql`excluded.work_date`,
            hours: sql`excluded.hours`,
            raw: sql`excluded.raw`,
            importedAt: sql`now()`,
          },
        });
    }

    const duration = Date.now() - started;
    await db
      .update(integrationSyncs)
      .set({ status: "SUCCEEDED", finishedAt: new Date(), durationMs: duration, recordsImported: hours.length })
      .where(eq(integrationSyncs.id, syncId));
    await db
      .update(integrations)
      .set({
        lastSuccessfulSyncAt: new Date(),
        lastError: null,
        nextSyncAt: new Date(Date.now() + row.syncFrequencyMinutes * 60_000),
      })
      .where(eq(integrations.id, integrationId));
    if (hours.length) {
      await notify({ companyId, type: "SYNC_COMPLETED", title: `${row.name} synced`, body: `${hours.length} records imported.` });
    }
    return true;
  } catch (err) {
    const message = (err instanceof Error ? err.message : "Unknown error").slice(0, 500);
    await db
      .update(integrationSyncs)
      .set({ status: "FAILED", finishedAt: new Date(), durationMs: Date.now() - started, errorMessage: message })
      .where(eq(integrationSyncs.id, syncId));
    if (row) {
      await db
        .update(integrations)
        .set({
          lastFailedSyncAt: new Date(),
          lastError: message,
          nextSyncAt: new Date(Date.now() + row.syncFrequencyMinutes * 60_000),
        })
        .where(eq(integrations.id, integrationId));
      await notify({ companyId, type: "INTEGRATION_FAILED", title: `${row.name} sync failed`, body: message });
    }
    return false;
  }
}
