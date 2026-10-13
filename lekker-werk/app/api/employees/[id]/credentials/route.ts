import { z } from "zod";
import { credentialIssueSchema } from "@/lib/schemas/devices";
import { requireApiContext } from "@/server/auth/guards";
import { issueCredential, listCredentials, revokeCredential } from "@/server/devices/credential.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireApiContext("employees:read");
  return ok(await listCredentials(ctx, z.uuid().parse((await params).id)));
});

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("employees:write");
  const row = await issueCredential(ctx, z.uuid().parse((await params).id), await parseBody(req, credentialIssueSchema));
  return ok(row, { status: 201 });
});

export const DELETE = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("employees:write");
  const { credentialId } = await parseBody(req, z.object({ credentialId: z.uuid() }));
  await revokeCredential(ctx, z.uuid().parse((await params).id), credentialId);
  return ok({ revoked: true });
});
