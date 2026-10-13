import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or username").max(254),
  password: z.string().min(1, "Enter your password").max(128),
});

export const locationInputSchema = z.object({
  name: z.string().trim().min(1, "Location name is required").max(120),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
});

export const signupSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is required").max(160),
  registrationNumber: z.string().trim().max(60).optional().or(z.literal("")),
  contactName: z.string().trim().min(2, "Contact name is required").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(30),
  password: passwordSchema,
  preferredChannel: z.enum(["WHATSAPP", "TELEGRAM"]),
  locationMode: z.enum(["ONE", "MULTIPLE"]),
  locations: z.array(locationInputSchema).min(1, "Add at least one location").max(50),
  timezone: z.string().default("Africa/Johannesburg"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type LocationInput = z.infer<typeof locationInputSchema>;
