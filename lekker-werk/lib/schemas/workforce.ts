import { z } from "zod";
import { locationInputSchema } from "./auth";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const employeeSchema = z.object({
  locationId: z.uuid(),
  employeeNumber: z.string().trim().min(1, "Employee number is required").max(40),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email()]).optional().nullable()
    .transform((v) => (v ? v : null)),
  phone: optionalText(30),
  department: optionalText(80),
  position: optionalText(80),
  managerId: z.uuid().optional().nullable(),
  preferredChannel: z.enum(["WHATSAPP", "TELEGRAM"]).optional().nullable(),
  platformIdentifier: optionalText(120),
  extraLocationIds: z.array(z.uuid()).max(50).default([]),
  /** Start date: drives leave accrual. Defaults to today for new employees. */
  hiredOn: z.union([z.literal(""), z.iso.date()]).optional().nullable().transform((v) => v || undefined),
});

export const employeeUpdateSchema = employeeSchema.partial();

export const employeeListQuery = z.object({
  q: z.string().trim().max(80).optional(),
  locationId: z.uuid().optional(),
  department: z.string().trim().max(80).optional(),
  managerId: z.uuid().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const locationUpdateSchema = locationInputSchema.partial().extend({
  timezone: z.string().max(60).optional(),
  gpsValidationEnabled: z.boolean().nullable().optional(),
  allowedRadiusMeters: z.coerce.number().int().min(10).max(5000).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

export const locationManagersSchema = z.object({
  userIds: z.array(z.uuid()).max(100),
});

export const qrCreateSchema = z.object({
  locationId: z.uuid(),
  label: z.string().trim().min(1).max(120),
  type: z.enum(["GENERAL", "CLOCK_IN", "CLOCK_OUT", "TEMPORARY"]).default("GENERAL"),
  mode: z.enum(["STATIC", "DYNAMIC"]).default("STATIC"),
  rotationSeconds: z.coerce.number().int().min(15).max(300).default(30),
  expiresAt: z.coerce.date().optional().nullable(),
});

export const userCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["COMPANY_ADMIN", "MANAGER"]),
  password: z.string().min(10).max(128),
  locationIds: z.array(z.uuid()).default([]),
});

export const attendanceQuery = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  locationId: z.uuid().optional(),
  employeeId: z.uuid().optional(),
  department: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const correctionSchema = z.object({
  employeeId: z.uuid(),
  eventType: z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]),
  occurredAt: z.coerce.date(),
  note: z.string().trim().min(3, "Explain the correction").max(500),
  correctsEventId: z.uuid().optional().nullable(),
});

export const scheduleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  locationId: z.uuid().optional().nullable(),
  graceMinutes: z.coerce.number().int().min(0).max(120).default(5),
  overtimeAfterMinutesPerDay: z.coerce.number().int().min(0).max(1440).optional().nullable(),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(7),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
        breakMinutes: z.number().int().min(0).max(240).optional(),
      }),
    )
    .max(7),
});

export const assignScheduleSchema = z.object({
  employeeId: z.uuid(),
  scheduleId: z.uuid(),
  effectiveFrom: z.iso.date(),
});
