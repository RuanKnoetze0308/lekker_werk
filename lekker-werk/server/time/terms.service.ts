import "server-only";
import { and, desc, eq, isNull, lte, or, gte } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import { employees, employmentTerms } from "@/db/schema";
import type { z } from "zod";
import type { employmentTermsSchema } from "@/lib/schemas/time";
import { addDays } from "@/lib/time";
import { assertCan, assertLocationAccess, type AuthContext } from "../auth/context";
import { Errors } from "../errors";
import { audit } from "../services/audit.service";
import { getSettings } from "../services/company.service";

export interface EffectiveTerms {
  payType: "HOURLY" | "SALARIED";
  contractedMinutesPerWeek: number;
  daysPerWeek: number;
  overtimeEligible: boolean;
  /** false = no terms recorded, company defaults apply. */
  recorded: boolean;
  effectiveFrom: string | null;
}

/** Terms in force on a date; falls back to the company's payroll defaults. */
export async function getEffectiveTerms(
  companyId: string,
  employeeId: string,
  date: string,
  executor: Db | Tx = db,
): Promise<EffectiveTerms> {
  const [row] = await executor
    .select()
    .from(employmentTerms)
    .where(
      and(
        eq(employmentTerms.employeeId, employeeId),
        eq(employmentTerms.companyId, companyId),
        lte(employmentTerms.effectiveFrom, date),
        or(isNull(employmentTerms.effectiveTo), gte(employmentTerms.effectiveTo, date)),
      ),
    )
    .orderBy(desc(employmentTerms.effectiveFrom))
    .limit(1);
  if (row) {
    return {
      payType: row.payType,
      contractedMinutesPerWeek: row.contractedMinutesPerWeek,
      daysPerWeek: row.daysPerWeek,
      overtimeEligible: row.overtimeEligible,
      recorded: true,
      effectiveFrom: row.effectiveFrom,
    };
  }
  const { payroll } = await getSettings(companyId);
  return {
    payType: "HOURLY",
    contractedMinutesPerWeek: payroll.defaultWeeklyMinutes,
    daysPerWeek: payroll.defaultDaysPerWeek,
    overtimeEligible: true,
    recorded: false,
    effectiveFrom: null,
  };
}

async function loadEmployee(ctx: AuthContext, employeeId: string) {
  const [emp] = await db
    .select({ id: employees.id, locationId: employees.locationId })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.companyId, ctx.companyId)));
  if (!emp) throw Errors.notFound("Employee");
  assertLocationAccess(ctx, emp.locationId);
}

export async function listTerms(ctx: AuthContext, employeeId: string) {
  assertCan(ctx, "employees:read");
  await loadEmployee(ctx, employeeId);
  return db
    .select()
    .from(employmentTerms)
    .where(and(eq(employmentTerms.employeeId, employeeId), eq(employmentTerms.companyId, ctx.companyId)))
    .orderBy(desc(employmentTerms.effectiveFrom));
}

/** New terms from a date. The previous open-ended terms end the day before. */
export async function setTerms(ctx: AuthContext, employeeId: string, input: z.infer<typeof employmentTermsSchema>) {
  assertCan(ctx, "employees:write");
  await loadEmployee(ctx, employeeId);
  await db.transaction(async (tx) => {
    // Terms starting on/after the new date are replaced by it.
    await tx
      .delete(employmentTerms)
      .where(
        and(
          eq(employmentTerms.employeeId, employeeId),
          eq(employmentTerms.companyId, ctx.companyId),
          gte(employmentTerms.effectiveFrom, input.effectiveFrom),
        ),
      );
    await tx
      .update(employmentTerms)
      .set({ effectiveTo: addDays(input.effectiveFrom, -1) })
      .where(
        and(
          eq(employmentTerms.employeeId, employeeId),
          eq(employmentTerms.companyId, ctx.companyId),
          or(isNull(employmentTerms.effectiveTo), gte(employmentTerms.effectiveTo, input.effectiveFrom)),
        ),
      );
    await tx.insert(employmentTerms).values({ ...input, companyId: ctx.companyId, employeeId, createdBy: ctx.userId });
    await audit(ctx, "employee.terms_changed", "employee", employeeId, input as Record<string, unknown>, tx);
  });
}
