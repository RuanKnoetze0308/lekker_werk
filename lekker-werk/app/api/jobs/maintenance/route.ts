import { env } from "@/lib/env";
import { safeEqual } from "@/lib/crypto";
import { Errors } from "@/server/errors";
import { ok, route } from "@/server/http/route";
import { runMaintenance } from "@/server/services/maintenance.service";

export const POST = route(
  async (req) => {
    const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!safeEqual(token, env.cronSecret)) throw Errors.unauthenticated();
    return ok(await runMaintenance());
  },
  { csrf: false, limit: 30 },
);
