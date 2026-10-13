import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { setUserStatus } from "@/server/services/user.service";
import { ok, parseBody, route } from "@/server/http/route";

export const PATCH = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("users:manage");
  const { active } = await parseBody(req, z.object({ active: z.boolean() }));
  await setUserStatus(ctx, z.uuid().parse((await params).id), active);
  return ok({ updated: true });
});
