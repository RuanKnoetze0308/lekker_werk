import { z } from "zod";

export const employmentTermsSchema = z.object({
  effectiveFrom: z.iso.date(),
  payType: z.enum(["HOURLY", "SALARIED"]),
  contractedMinutesPerWeek: z.coerce.number().int().min(60).max(4200),
  daysPerWeek: z.coerce.number().int().min(1).max(7),
  overtimeEligible: z.boolean(),
});

export const leaveTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{1,19}$/, "Use letters, digits and _ (e.g. STUDY)"),
  name: z.string().trim().min(2).max(60),
  paid: z.boolean(),
  accrual: z.enum(["NONE", "MONTHLY", "CYCLE_UPFRONT"]),
  entitlementDays: z.coerce.number().min(0).max(366),
  cycleMonths: z.coerce.number().int().min(1).max(60),
  documentAfterDays: z.coerce.number().int().min(0).max(60).nullable().optional(),
  employeeRequestable: z.boolean(),
  active: z.boolean().default(true),
});

export const leaveRequestSchema = z
  .object({
    employeeId: z.uuid(),
    leaveTypeId: z.uuid(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    dayFraction: z.union([z.literal(1), z.literal(0.5)]).default(1),
    reason: z.string().trim().max(500).optional().nullable(),
    documentRef: z.string().trim().max(300).optional().nullable(),
    /** Managers recording leave can approve it in the same step. */
    approve: z.boolean().default(false),
  })
  .refine((r) => r.endDate >= r.startDate, { message: "End date is before start date.", path: ["endDate"] });

export const leaveDecisionSchema = z.object({
  approve: z.boolean(),
  note: z.string().trim().max(500).optional().nullable(),
});

export const leaveAdjustmentSchema = z.object({
  employeeId: z.uuid(),
  leaveTypeId: z.uuid(),
  days: z.coerce.number().min(-366).max(366).refine((d) => d !== 0, "Enter a number of days."),
  kind: z.enum(["OPENING", "ADJUSTMENT"]),
  note: z.string().trim().min(3, "Say why").max(300),
});

export const siteClosureSchema = z
  .object({
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    paid: z.boolean(),
    reason: z.string().trim().min(3).max(200),
  })
  .refine((r) => r.endDate >= r.startDate, { message: "End date is before start date.", path: ["endDate"] });

export const resolveAbsenceSchema = z.object({
  leaveTypeId: z.uuid(),
  note: z.string().trim().max(300).optional().nullable(),
});

export const lockPeriodSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  /** Lock even though exceptions are still open (they are reported as-is). */
  force: z.boolean().default(false),
});
