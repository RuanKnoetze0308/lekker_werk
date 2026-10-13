import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/server/auth/guards";
import { runReport, toCsv } from "@/server/services/reporting.service";
import { ok, parseQuery, route } from "@/server/http/route";

const query = z.object({
  kind: z.enum([
    "daily_attendance",
    "weekly_hours",
    "monthly_hours",
    "overtime",
    "late_arrivals",
    "location_attendance",
    "erp_reconciliation",
  ]),
  from: z.iso.date(),
  to: z.iso.date(),
  locationId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  department: z.string().max(80).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

export const GET = route(
  async (req) => {
    const ctx = await requireApiContext("reports:read");
    const { format, ...params } = parseQuery(req, query);
    const result = await runReport(ctx, params);
    if (format === "csv") {
      return new NextResponse(toCsv(result), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${params.kind}_${params.from}_${params.to}.csv"`,
        },
      });
    }
    return ok(result);
  },
  { limit: 30 },
);
