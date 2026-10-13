import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { listSyncs, requestSync } from "@/server/services/integration.service";
import { ok, route } from "@/server/http/route";

type P = { id: string };

/** Queues a background sync; the worker (/api/jobs/sync) picks it up. */
export const POST = route<P>(
  async (_req, { params }) => {
    const ctx = await requireApiContext("integrations:manage");
    await requestSync(ctx, z.uuid().parse((await params).id));
    return ok({ queued: true }, { status: 202 });
  },
  { limit: 10 },
);

export const GET = route<P>(async (_req, { params }) => {
  const ctx = await requireApiContext("integrations:manage");
  return ok(await listSyncs(ctx, z.uuid().parse((await params).id)));
});
