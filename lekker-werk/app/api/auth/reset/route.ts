import { resetPasswordSchema } from "@/lib/schemas/auth";
import { resetPassword } from "@/server/services/authentication.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route(
  async (req) => {
    const { token, password } = await parseBody(req, resetPasswordSchema);
    await resetPassword(token, password);
    return ok({ reset: true });
  },
  { limit: 10, csrf: false },
);
