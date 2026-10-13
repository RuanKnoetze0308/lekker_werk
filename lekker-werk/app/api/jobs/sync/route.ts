import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { Errors } from "@/server/errors";
import { ok, route } from "@/server/http/route";
import { runSyncJobs } from "@/server/services/integration.service";

/** Scheduler entry point (cron / queue): `POST /api/jobs/sync` with `Authorization: Bearer $CRON_SECRET`. */
export const POST = route(
  async (req) => {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!safeEqual(token, env.cronSecret)) throw Errors.unauthenticated();
    return ok(await runSyncJobs());
  },
  { csrf: false, limit: 30 },
);
