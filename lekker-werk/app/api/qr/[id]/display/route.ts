import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { getQrDisplayLink } from "@/server/services/qr.service";
import { ok, route } from "@/server/http/route";

/** Display-screen link for a dynamic QR code (open it on the tablet / TV at the entrance). */
export const GET = route<{ id: string }>(async (_req, { params }) => {
  const ctx = await requireApiContext("qr:manage");
  return ok(await getQrDisplayLink(ctx, z.uuid().parse((await params).id)));
});
