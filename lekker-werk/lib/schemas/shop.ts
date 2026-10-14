import { z } from "zod";

export const SHOP_CATEGORIES = ["RFID", "TABLET", "MOUNT", "NFC", "BIOMETRIC", "OTHER"] as const;

export const shopOrderSchema = z.object({
  items: z
    .array(z.object({ productId: z.uuid(), quantity: z.coerce.number().int().min(1).max(500) }))
    .min(1, "Your cart is empty.")
    .max(50),
  deliveryName: z.string().trim().min(2, "Who should we deliver to?").max(120),
  deliveryPhone: z.string().trim().min(7, "Enter a valid phone number").max(30),
  deliveryAddress: z.string().trim().min(10, "Enter the full delivery address").max(500),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export const shopProductSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(""),
  category: z.enum(SHOP_CATEGORIES),
  // Rands in the form, stored as cents.
  price: z.coerce.number().min(1).max(1_000_000),
  imageUrl: z.url().max(500).optional().or(z.literal("")),
  active: z.boolean().default(true),
  inStock: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export const shopOrderUpdateSchema = z.object({
  status: z.enum(["PAID", "SHIPPED", "CANCELLED"]),
  trackingNote: z.string().trim().max(500).optional().or(z.literal("")),
});
