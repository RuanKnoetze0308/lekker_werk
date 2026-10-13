import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { getQrAsset } from "@/server/services/qr.service";
import { route } from "@/server/http/route";

export const GET = route<{ id: string }>(async (req, { params }) => {
  const ctx = await requireApiContext("qr:manage");
  const asset = await getQrAsset(ctx, z.uuid().parse((await params).id));
  const format = req.nextUrl.searchParams.get("format") === "svg" ? "svg" : "png";
  const filename = `${asset.locationName}-${asset.label}`.replace(/[^\w-]+/g, "_");
  const headers = {
    "content-disposition": `attachment; filename="${filename}.${format}"`,
    "cache-control": "private, no-store",
  };
  return format === "svg"
    ? new NextResponse(asset.svg, { headers: { ...headers, "content-type": "image/svg+xml" } })
    : new NextResponse(new Uint8Array(asset.png), { headers: { ...headers, "content-type": "image/png" } });
});
