import { loginSchema } from "@/lib/schemas/auth";
import { login } from "@/server/services/authentication.service";
import { ok, parseBody, route } from "@/server/http/route";

// Strict limit per IP; the service adds per-account lockout on top.
export const POST = route(
  async (req) => {
    const input = await parseBody(req, loginSchema);
    const { role, twoStep } = await login(input);
    if (twoStep) return ok({ twoStep: true });
    return ok({ redirect: role === "EMPLOYEE" ? "/" : "/dashboard" });
  },
  { limit: 10, csrf: false },
);
