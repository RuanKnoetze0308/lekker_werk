import { forgotPasswordSchema } from "@/lib/schemas/auth";
import { requestPasswordReset } from "@/server/services/authentication.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route(
  async (req) => {
    const { email } = await parseBody(req, forgotPasswordSchema);
    await requestPasswordReset(email);
    // Same response whether or not the email exists.
    return ok({ sent: true });
  },
  { limit: 5, csrf: false },
);
