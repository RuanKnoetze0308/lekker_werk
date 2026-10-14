import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db/client";
import { companies, shopOrderItems, shopOrders, shopProducts } from "@/db/schema";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import type { shopOrderSchema, shopOrderUpdateSchema, shopProductSchema } from "@/lib/schemas/shop";
import { assertCan, type AuthContext } from "../auth/context";
import { assertCheckoutAllowed } from "../billing/billing.service";
import { buildCheckout, verifyItn } from "../billing/payfast";
import { AppError, Errors } from "../errors";
import { audit } from "./audit.service";
import { sendEmail } from "./notification.service";

/**
 * Hardware shop: RFID bands, tablets, mounts and other gear sold to tenants (Devices → Buy hardware).
 * The catalogue is platform-wide and managed by super admins; orders belong to a company and are
 * paid once-off through PayFast. An order only becomes PAID from a verified ITN, never the browser.
 */

const rands = (cents: number) => (cents / 100).toFixed(2);

function assertPlatform(ctx: AuthContext) {
  if (ctx.role !== "SUPER_ADMIN") throw Errors.notFound();
}

// ---- Tenant side ---------------------------------------------------------------------------------------

export async function listShopProducts(ctx: AuthContext) {
  assertCan(ctx, "devices:manage");
  return db
    .select()
    .from(shopProducts)
    .where(eq(shopProducts.active, true))
    .orderBy(asc(shopProducts.sortOrder), asc(shopProducts.name));
}

/** Creates the order at catalogue prices and returns the signed PayFast form to post. */
export async function createShopOrder(ctx: AuthContext, input: z.infer<typeof shopOrderSchema>) {
  assertCan(ctx, "devices:manage");
  assertCheckoutAllowed();

  // Merge duplicate lines, then price everything server-side: the browser only sends ids + quantities.
  const qty = new Map<string, number>();
  for (const i of input.items) qty.set(i.productId, (qty.get(i.productId) ?? 0) + i.quantity);
  const products = await db
    .select()
    .from(shopProducts)
    .where(and(inArray(shopProducts.id, [...qty.keys()]), eq(shopProducts.active, true)));
  if (products.length !== qty.size) throw Errors.invalid("Some items are no longer available. Refresh the page and try again.");
  const outOfStock = products.find((p) => !p.inStock);
  if (outOfStock) throw Errors.invalid(`${outOfStock.name} is out of stock.`);

  const lines = products.map((p) => ({ productId: p.id, name: p.name, unitPriceCents: p.priceCents, quantity: qty.get(p.id)! }));
  const totalCents = lines.reduce((n, l) => n + l.unitPriceCents * l.quantity, 0);
  const mPaymentId = `shop_${randomToken(12)}`;

  const order = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(shopOrders)
      .values({
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        totalCents,
        mPaymentId,
        deliveryName: input.deliveryName,
        deliveryPhone: input.deliveryPhone,
        deliveryAddress: input.deliveryAddress,
        notes: input.notes || null,
      })
      .returning({ id: shopOrders.id });
    await tx.insert(shopOrderItems).values(lines.map((l) => ({ ...l, orderId: row.id })));
    await audit(ctx, "shop.order_created", "shop_order", row.id, { totalCents, items: lines.length }, tx);
    return row;
  });

  const [first, ...rest] = ctx.name.trim().split(/\s+/);
  const summary = lines.map((l) => `${l.quantity}× ${l.name}`).join(", ");
  return {
    orderId: order.id,
    ...buildCheckout({
      returnUrl: `${env.appUrl}/devices?tab=orders&status=success`,
      cancelUrl: `${env.appUrl}/devices?tab=shop&status=cancelled`,
      notifyUrl: `${env.appUrl}/api/shop/payfast/itn`,
      nameFirst: first ?? "",
      nameLast: rest.join(" "),
      email: ctx.email,
      mPaymentId,
      amount: totalCents / 100,
      itemName: `LekkerWerk hardware order`,
      itemDescription: summary,
      companyId: ctx.companyId,
    }),
  };
}

async function withItems<T extends { id: string }>(orders: T[]) {
  if (!orders.length) return [];
  const items = await db
    .select()
    .from(shopOrderItems)
    .where(inArray(shopOrderItems.orderId, orders.map((o) => o.id)));
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}

export async function listShopOrders(ctx: AuthContext) {
  assertCan(ctx, "devices:manage");
  const orders = await db
    .select()
    .from(shopOrders)
    .where(eq(shopOrders.companyId, ctx.companyId))
    .orderBy(desc(shopOrders.createdAt))
    .limit(100);
  return withItems(orders);
}

// ---- PayFast ITN ---------------------------------------------------------------------------------------

/** Server-to-server from PayFast. Signature, source, confirmation and amount are all checked. */
export async function handleShopItn(rawBody: string, ip: string) {
  const { pairs, get } = await verifyItn(rawBody, ip);
  const [order] = await db.select().from(shopOrders).where(eq(shopOrders.mPaymentId, get("m_payment_id")));
  if (!order) return { ignored: true }; // not ours; acknowledge so PayFast stops retrying
  const itn = Object.fromEntries(pairs);
  const status = get("payment_status");

  if (status !== "COMPLETE") {
    if (order.status === "PENDING_PAYMENT" && status === "CANCELLED") {
      await db.update(shopOrders).set({ status: "CANCELLED", itn }).where(eq(shopOrders.id, order.id));
    }
    return { status };
  }
  if (order.status !== "PENDING_PAYMENT") return { duplicate: true };
  if (Math.abs(Number(get("amount_gross")) - order.totalCents / 100) > 0.01) {
    throw new AppError(400, "AMOUNT_MISMATCH", "Amount does not match the order");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(shopOrders)
      .set({ status: "PAID", paidAt: new Date(), pfPaymentId: get("pf_payment_id") || null, itn })
      .where(and(eq(shopOrders.id, order.id), eq(shopOrders.status, "PENDING_PAYMENT")));
    await audit({ userId: null, companyId: order.companyId }, "shop.order_paid", "shop_order", order.id, { totalCents: order.totalCents }, tx);
  });

  if (env.opsEmail) {
    const [c] = await db.select({ name: companies.name }).from(companies).where(eq(companies.id, order.companyId));
    await sendEmail(
      env.opsEmail,
      `New hardware order: ${c?.name ?? order.companyId} (R ${rands(order.totalCents)})`,
      `Order ${order.id} is paid. Deliver to ${order.deliveryName}, ${order.deliveryPhone}, ${order.deliveryAddress}. See System portal → Hardware shop.`,
    ).catch((e) => console.error("Could not email ops about shop order", e));
  }
  return { status: "PAID" };
}

// ---- System portal: catalogue + all orders -------------------------------------------------------------

export async function listAllShopProducts(ctx: AuthContext) {
  assertPlatform(ctx);
  return db.select().from(shopProducts).orderBy(asc(shopProducts.sortOrder), asc(shopProducts.name));
}

function productValues(input: z.infer<typeof shopProductSchema>) {
  return {
    name: input.name,
    description: input.description,
    category: input.category,
    priceCents: Math.round(input.price * 100),
    imageUrl: input.imageUrl || null,
    active: input.active,
    inStock: input.inStock,
    sortOrder: input.sortOrder,
  };
}

export async function createShopProduct(ctx: AuthContext, input: z.infer<typeof shopProductSchema>) {
  assertPlatform(ctx);
  const [row] = await db.insert(shopProducts).values(productValues(input)).returning();
  await audit({ userId: ctx.userId, companyId: null }, "shop.product_changed", "shop_product", row.id, { event: "created", name: row.name });
  return row;
}

export async function updateShopProduct(ctx: AuthContext, id: string, input: z.infer<typeof shopProductSchema>) {
  assertPlatform(ctx);
  const [row] = await db.update(shopProducts).set(productValues(input)).where(eq(shopProducts.id, id)).returning();
  if (!row) throw Errors.notFound("Product");
  await audit({ userId: ctx.userId, companyId: null }, "shop.product_changed", "shop_product", row.id, { event: "updated", name: row.name });
  return row;
}

export async function listAllShopOrders(ctx: AuthContext) {
  assertPlatform(ctx);
  const orders = await db
    .select({
      id: shopOrders.id,
      companyId: shopOrders.companyId,
      companyName: companies.name,
      status: shopOrders.status,
      totalCents: shopOrders.totalCents,
      deliveryName: shopOrders.deliveryName,
      deliveryPhone: shopOrders.deliveryPhone,
      deliveryAddress: shopOrders.deliveryAddress,
      notes: shopOrders.notes,
      trackingNote: shopOrders.trackingNote,
      paidAt: shopOrders.paidAt,
      shippedAt: shopOrders.shippedAt,
      createdAt: shopOrders.createdAt,
    })
    .from(shopOrders)
    .innerJoin(companies, eq(companies.id, shopOrders.companyId))
    .orderBy(desc(shopOrders.createdAt))
    .limit(200);
  return withItems(orders);
}

/** Fulfilment: mark shipped (with a tracking note) or cancel. PAID is only set by the ITN or here manually (e.g. EFT). */
export async function updateShopOrder(ctx: AuthContext, id: string, input: z.infer<typeof shopOrderUpdateSchema>) {
  assertPlatform(ctx);
  const [current] = await db.select().from(shopOrders).where(eq(shopOrders.id, id));
  if (!current) throw Errors.notFound("Order");
  const now = new Date();
  await db
    .update(shopOrders)
    .set({
      status: input.status,
      trackingNote: input.trackingNote || current.trackingNote,
      shippedAt: input.status === "SHIPPED" ? (current.shippedAt ?? now) : current.shippedAt,
      paidAt: input.status === "PAID" ? (current.paidAt ?? now) : current.paidAt,
    })
    .where(eq(shopOrders.id, id));
  await audit({ userId: ctx.userId, companyId: current.companyId, impersonating: true }, "shop.order_updated", "shop_order", id, {
    from: current.status,
    to: input.status,
  });
}
