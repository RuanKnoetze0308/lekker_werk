import { qrCreateSchema } from "@/lib/schemas/workforce";
import { requireApiContext } from "@/server/auth/guards";
import { createQrCode, listQrCodes } from "@/server/services/qr.service";
import { ok, parseBody, route } from "@/server/http/route";

export const GET = route(async (req) => {
  const ctx = await requireApiContext("qr:manage");
  return ok(await listQrCodes(ctx, req.nextUrl.searchParams.get("locationId") ?? undefined));
});

export const POST = route(async (req) => {
  const ctx = await requireApiContext("qr:manage");
  return ok(await createQrCode(ctx, await parseBody(req, qrCreateSchema)), { status: 201 });
});
