import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { regenerateQrCode } from "@/server/services/qr.service";
import { ok, route } from "@/server/http/route";

export const POST = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireApiContext("qr:manage");
  return ok(await regenerateQrCode(ctx, z.uuid().parse((await params).id)), { status: 201 });
});
