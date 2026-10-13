import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { exportPayPeriod } from "@/server/time/payroll.service";
import { route } from "@/server/http/route";

/** CSV download. A GET that also records the export, so it's rate limited. */
export const GET = route<{ id: string }>(
  async (req, { params }) => {
    const ctx = await requireApiContext("payroll:manage");
    const format = z.enum(["lines", "wide"]).parse(req.nextUrl.searchParams.get("format") ?? "lines");
    const { csv, filename } = await exportPayPeriod(ctx, z.uuid().parse((await params).id), format);
    return new NextResponse(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"` },
    });
  },
  { limit: 20 },
);
