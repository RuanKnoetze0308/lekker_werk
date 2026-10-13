import { signupSchema } from "@/lib/schemas/auth";
import { signup } from "@/server/services/authentication.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route(
  async (req) => {
    const input = await parseBody(req, signupSchema);
    await signup(input);
    return ok({ redirect: "/dashboard" }, { status: 201 });
  },
  { limit: 5, csrf: false },
);
