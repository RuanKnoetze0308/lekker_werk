import { z } from "zod";
import { env } from "@/lib/env";
import { requireApiContext } from "@/server/auth/guards";
import { simulateChat } from "@/server/channels/simulator";
import { Errors } from "@/server/errors";
import { ok, parseBody, route } from "@/server/http/route";

const body = z
  .object({
    channel: z.enum(["TELEGRAM", "WHATSAPP"]),
    externalId: z.string().regex(/^sim-[a-z0-9-]{1,40}$/, "Simulated chat ids look like sim-thabo"),
    displayName: z.string().trim().max(60).optional(),
    text: z.string().trim().min(1).max(500).optional(),
    location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
    scanQrId: z.uuid().optional(),
    linkEmployeeId: z.uuid().optional(),
  })
  .refine((b) => b.text || b.location || b.scanQrId || b.linkEmployeeId, "Nothing to send.");

/** Drives the real chat pipeline with a fake transport. Disabled in production. */
export const POST = route(async (req) => {
  if (!env.simulatorsEnabled) throw Errors.notFound();
  const ctx = await requireApiContext("settings:manage");
  return ok(await simulateChat(ctx, await parseBody(req, body)));
});
