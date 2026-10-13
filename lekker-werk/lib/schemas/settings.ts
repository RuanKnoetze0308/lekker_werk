import { z } from "zod";

export const attendanceSettingsSchema = z.object({
  mealBreak: z.object({
    policy: z.enum(["AUTO_DEDUCT", "CLOCKED"]),
    minutes: z.coerce.number().int().min(0).max(240),
    afterMinutes: z.coerce.number().int().min(0).max(1440),
    paid: z.boolean(),
  }),
  gpsValidationEnabled: z.boolean(),
  requireQrForClocking: z.boolean(),
  allowedRadiusMeters: z.coerce.number().int().min(10).max(5000),
  duplicateWindowSeconds: z.coerce.number().int().min(0).max(600),
  maxShiftHours: z.coerce.number().int().min(1).max(48),
  breaksEnabled: z.boolean(),
  overtimeAfterMinutesPerDay: z.coerce.number().int().min(0).max(1440),
  workingWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
});

export const companyUpdateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  registrationNumber: z.string().trim().max(60).nullable().optional(),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().toLowerCase().email(),
  contactPhone: z.string().trim().min(7).max(30),
  timezone: z.string().max(60),
  preferredChannel: z.enum(["WHATSAPP", "TELEGRAM"]),
});

export const channelConfigSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("TELEGRAM"),
    enabled: z.boolean(),
    botToken: z.string().trim().min(20).max(200).optional(),
  }),
  z.object({
    channel: z.literal("WHATSAPP"),
    enabled: z.boolean(),
    /** SHARED = the LekkerWerk number (no Meta setup); DEDICATED = the company's own number. */
    mode: z.enum(["SHARED", "DEDICATED"]).default("SHARED"),
    phoneNumberId: z.string().trim().min(5).max(40).optional(),
    displayNumber: z.string().trim().min(5).max(30).optional(),
    accessToken: z.string().trim().min(20).max(1000).optional(),
  }),
]);

export const employeePermissionsSchema = z.object({
  permissions: z.record(z.string(), z.boolean()),
});

export const integrationSchema = z.object({
  provider: z.enum(["CUSTOM_API", "SYSPRO", "ODOO", "SAGE", "XERO", "QUICKBOOKS", "SIMPLEPAY", "PAYSPACE"]),
  category: z.enum(["ERP", "ACCOUNTING", "PAYROLL", "HR"]),
  name: z.string().trim().min(1).max(100),
  enabled: z.boolean().default(false),
  syncFrequencyMinutes: z.coerce.number().int().min(15).max(10080).default(60),
  config: z.record(z.string(), z.string().max(500)).default({}),
  // Write-only: stored encrypted, never returned.
  credentials: z.record(z.string(), z.string().max(2000)).optional(),
});

export const integrationRequestSchema = z.object({
  systemName: z.string().trim().min(2, "Which system do you use?").max(100),
  category: z.enum(["ERP", "ACCOUNTING", "PAYROLL", "HR"]),
  website: z.union([z.literal(""), z.string().trim().url().max(200)]).optional().transform((v) => v || null),
  contactEmail: z.string().trim().toLowerCase().email(),
  dataNeeded: z.string().trim().max(500).optional().transform((v) => v || null),
  notes: z.string().trim().max(2000).optional().transform((v) => v || null),
});

export type AttendanceSettingsInput = z.infer<typeof attendanceSettingsSchema>;
