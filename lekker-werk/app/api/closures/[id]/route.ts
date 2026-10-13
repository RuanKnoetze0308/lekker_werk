import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { deleteClosure } from "@/server/time/closures.service";
import { ok, route } from "@/server/http/route";

export const DELETE = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireApiContext("attendance:correct");
  await deleteClosure(ctx, z.uuid().parse((await params).id));
  return ok({ deleted: true });
});
