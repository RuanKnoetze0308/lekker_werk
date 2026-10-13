import { z } from "zod";

export const DEVICE_KINDS = ["RFID_READER", "NFC_READER", "BIOMETRIC", "KIOSK", "OTHER"] as const;
export const CREDENTIAL_KINDS = ["RFID_CARD", "NFC_TAG", "PIN", "BIOMETRIC_ID", "BARCODE"] as const;
const clockAction = z.enum(["CLOCK_IN", "CLOCK_OUT", "BREAK_START", "BREAK_END"]);

export const deviceCreateSchema = z.object({
  locationId: z.uuid(),
  kind: z.enum(DEVICE_KINDS),
  name: z.string().trim().min(1).max(80),
  serialNumber: z.string().trim().max(80).optional().nullable().transform((v) => v || null),
  fixedAction: clockAction.optional().nullable(),
});

export const deviceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  fixedAction: clockAction.nullable().optional(),
});

export const credentialInput = z
  .object({
    kind: z.enum(CREDENTIAL_KINDS),
    value: z.string().trim().min(1).max(128),
  })
  .refine((c) => c.kind !== "PIN" || /^\d{4,8}$/.test(c.value), {
    message: "PINs must be 4 to 8 digits.",
    path: ["value"],
  });

export const credentialIssueSchema = z.intersection(
  credentialInput,
  z.object({ label: z.string().trim().max(60).optional().nullable() }),
);

/**
 * Device API v1. Terminals send one or many punches; a terminal that was offline sends its
 * buffer in one batch. `punchId` must be unique per device so a resend is never double-counted.
 */
export const punchSchema = z.object({
  punchId: z.string().trim().min(1).max(100).optional(),
  credential: credentialInput,
  action: clockAction.optional(),
  capturedAt: z.coerce.date().optional(),
});

export const punchBatchSchema = z.object({
  punches: z.array(punchSchema).min(1).max(200),
});

export type PunchInput = z.infer<typeof punchSchema>;
