import { z } from "zod";
import { employmentTermsSchema } from "@/lib/schemas/time";
import { requireApiContext } from "@/server/auth/guards";
import { listTerms, setTerms } from "@/server/time/terms.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireApiContext("employees:read");
  return ok(await listTerms(ctx, z.uuid().parse((await params).id)));
});

/** New terms from `effectiveFrom`; earlier terms end the day before. */
export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("employees:write");
  await setTerms(ctx, z.uuid().parse((await params).id), await parseBody(req, employmentTermsSchema));
  return ok({ updated: true }, { status: 201 });
});
