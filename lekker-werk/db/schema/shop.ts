import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { companies, users } from "./tenancy";

export const shopCategory = pgEnum("shop_category", ["RFID", "TABLET", "MOUNT", "NFC", "BIOMETRIC", "OTHER"]);
export const shopOrderStatus = pgEnum("shop_order_status", [
  "PENDING_PAYMENT",
  "PAID",
  "SHIPPED",
  "CANCELLED",
]);

// Platform-wide hardware catalogue, managed by super admins in the System portal.
// Prices are in cents (ZAR, VAT inclusive) so totals never suffer float rounding.
export const shopProducts = pgTable(
  "shop_products",
  {
    id: id(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: shopCategory("category").notNull().default("OTHER"),
    priceCents: integer("price_cents").notNull(),
    imageUrl: text("image_url"),
    active: boolean("active").notNull().default(true),
    inStock: boolean("in_stock").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("shop_products_active_idx").on(t.active, t.sortOrder)],
);

export const shopOrders = pgTable(
  "shop_orders",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    createdBy: uuid("created_by").references(() => users.id),
    status: shopOrderStatus("status").notNull().default("PENDING_PAYMENT"),
    totalCents: integer("total_cents").notNull(),
    // Sent to PayFast as m_payment_id ("shop_…").
    mPaymentId: text("m_payment_id").notNull(),
    // PayFast's id; unique so a replayed ITN can never mark an order paid twice.
    pfPaymentId: text("pf_payment_id"),
    deliveryName: text("delivery_name").notNull(),
    deliveryPhone: text("delivery_phone").notNull(),
    deliveryAddress: text("delivery_address").notNull(),
    notes: text("notes"),
    trackingNote: text("tracking_note"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    itn: jsonb("itn").$type<Record<string, string>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("shop_orders_m_payment_uq").on(t.mPaymentId),
    uniqueIndex("shop_orders_pf_payment_uq").on(t.pfPaymentId),
    index("shop_orders_company_idx").on(t.companyId, t.createdAt),
    index("shop_orders_status_idx").on(t.status, t.createdAt),
  ],
);

// Name and price are copied at order time so later catalogue edits don't rewrite history.
export const shopOrderItems = pgTable(
  "shop_order_items",
  {
    id: id(),
    orderId: uuid("order_id").notNull().references(() => shopOrders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => shopProducts.id),
    name: text("name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (t) => [index("shop_order_items_order_idx").on(t.orderId)],
);
