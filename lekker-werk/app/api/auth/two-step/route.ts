import { z } from "zod";
import { completeChallenge } from "@/server/services/two-step.service";
import { ok, parseBody, route } from "@/server/http/route";

/** Second login step: the authenticator (or backup) code. Needs the challenge cookie from /auth/login. */
export const POST = route(
  async (req) => {
    const { code } = await parseBody(req, z.object({ code: z.string().trim().min(6).max(20) }));
    const { role } = await completeChallenge(code);
    return ok({ redirect: role === "EMPLOYEE" ? "/" : "/dashboard" });
  },
  { limit: 10, csrf: false },
);
