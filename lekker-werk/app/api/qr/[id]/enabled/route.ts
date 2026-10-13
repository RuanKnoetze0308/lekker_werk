import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { setQrEnabled } from "@/server/services/qr.service";
import { ok, parseBody, route } from "@/server/http/route";

export const POST = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("qr:manage");
  const { enabled } = await parseBody(req, z.object({ enabled: z.boolean() }));
  await setQrEnabled(ctx, z.uuid().parse((await params).id), enabled);
  return ok({ updated: true });
});
