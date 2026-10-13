import { userCreateSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { createUser, listUsers } from "@/server/services/user.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async () => {
  const ctx = await requireApiContext("users:manage");
  return ok(await listUsers(ctx));
});

export const POST = route(async (req) => {
  const ctx = await requireApiContext("users:manage");
  return ok(await createUser(ctx, await parseBody(req, userCreateSchema)), { status: 201 });
});
