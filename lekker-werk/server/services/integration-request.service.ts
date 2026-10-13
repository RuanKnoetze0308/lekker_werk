import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrationRequests } from "@/db/schema";
import type { z } from "zod";
import type { integrationRequestSchema } from "@/lib/schemas/settings";
import { env } from "@/lib/env";
import { assertCan, type AuthContext } from "../auth/context";
import { audit } from "./audit.service";
import { getCompany } from "./company.service";
import { notify, sendEmail } from "./notification.service";

/**
 * "My system isn't listed." Stored so we can scope, quote and bill the connector work, and so
 * demand tells us which connectors to build next. Status is moved along by us, not the customer.
 */
export async function createIntegrationRequest(ctx: AuthContext, input: z.infer<typeof integrationRequestSchema>) {
  assertCan(ctx, "integrations:manage");
  const [row] = await db
    .insert(integrationRequests)
    .values({ ...input, companyId: ctx.companyId, requestedBy: ctx.userId })
    .returning({ id: integrationRequests.id });

  await audit(ctx, "integration.requested", "integration_request", row.id, { systemName: input.systemName });
  await notify({
    companyId: ctx.companyId,
    type: "INTEGRATION_REQUESTED",
    title: `Integration request received: ${input.systemName}`,
    body: "We'll review it and come back to you with scope and a quote.",
    payload: { integrationRequestId: row.id },
  });
  if (env.opsEmail) {
    const company = await getCompany(ctx);
    await sendEmail(
      env.opsEmail,
      `Integration request: ${input.systemName} (${company.name})`,
      [
        `Company: ${company.name}`,
        `Requested by: ${ctx.name} <${input.contactEmail}>`,
        `System: ${input.systemName} (${input.category})`,
        `Website: ${input.website ?? "-"}`,
        `Data needed: ${input.dataNeeded ?? "-"}`,
        `Notes: ${input.notes ?? "-"}`,
      ].join("\n"),
    );
  }
  return row;
}

export async function listIntegrationRequests(ctx: AuthContext) {
  assertCan(ctx, "integrations:manage");
  return db
    .select({
      id: integrationRequests.id,
      systemName: integrationRequests.systemName,
      category: integrationRequests.category,
      status: integrationRequests.status,
      quotedAmount: integrationRequests.quotedAmount,
      createdAt: integrationRequests.createdAt,
    })
    .from(integrationRequests)
    .where(eq(integrationRequests.companyId, ctx.companyId))
    .orderBy(desc(integrationRequests.createdAt));
}
