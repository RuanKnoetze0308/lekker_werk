import Link from "next/link";
import { ChevronLeft, Package } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/dashboard/ui";
import { SHOP_CATEGORY_LABEL, SHOP_ORDER_STATUS_LABEL, formatRand } from "@/lib/device-labels";
import { formatDateTime } from "@/lib/time";
import { requirePlatformPage } from "@/server/auth/guards";
import { listAllShopOrders, listAllShopProducts } from "@/server/services/shop.service";
import { OrderStatusForm, ProductButton } from "./ShopAdmin";

export const metadata = { title: "Hardware shop · System portal · LekkerWerk" };

const ORDER_TONE = { PENDING_PAYMENT: "amber", PAID: "blue", SHIPPED: "green", CANCELLED: "red" } as const;
const TZ = "Africa/Johannesburg";

export default async function SystemShopPage() {
  const { ctx } = await requirePlatformPage();
  const [products, orders] = await Promise.all([listAllShopProducts(ctx), listAllShopOrders(ctx)]);
  const toForm = (p: (typeof products)[number]) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category: p.category,
    price: p.priceCents / 100,
    imageUrl: p.imageUrl ?? "",
    active: p.active,
    inStock: p.inStock,
    sortOrder: p.sortOrder,
  });

  return (
    <>
      <Link href="/system" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> System portal
      </Link>
      <PageHeader
        title="Hardware shop"
        description="The catalogue every tenant sees under Devices → Buy hardware, and every order placed. Prices are in rand incl. VAT."
        actions={<ProductButton />}
      />

      <Card title={`Products (${products.length})`} flush className="mb-6">
        {products.length === 0 ? (
          <EmptyState title="No products yet" hint="Add RFID bands, tablets, stands and anything else tenants can buy." />
        ) : (
          <ul className="divide-y divide-border/70">
            {products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-soft-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-5 text-muted" aria-hidden />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{p.name}</p>
                  <p className="text-xs text-muted">{SHOP_CATEGORY_LABEL[p.category]} · {formatRand(p.priceCents)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {!p.active && <Badge tone="gray">Hidden</Badge>}
                  {!p.inStock && <Badge tone="amber">Out of stock</Badge>}
                  <ProductButton product={toForm(p)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <h2 className="mb-3 text-[15px] font-semibold text-ink">Orders</h2>
      {orders.length === 0 ? (
        <Card><EmptyState title="No orders yet" /></Card>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((o) => (
            <Card key={o.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/system/tenants/${o.companyId}`} className="font-semibold text-ink hover:text-dark-green">{o.companyName}</Link>
                  <p className="text-xs text-muted">{formatRand(o.totalCents)} · {formatDateTime(o.createdAt, TZ)} · #{o.id.slice(-8)}</p>
                </div>
                <Badge tone={ORDER_TONE[o.status]}>{SHOP_ORDER_STATUS_LABEL[o.status]}</Badge>
              </div>
              <ul className="mt-3 text-sm">{o.items.map((i) => <li key={i.id}>{i.quantity}× {i.name} <span className="text-muted">@ {formatRand(i.unitPriceCents)}</span></li>)}</ul>
              <p className="mt-2 break-words text-sm text-muted">{o.deliveryName} · {o.deliveryPhone} · {o.deliveryAddress}</p>
              {o.notes && <p className="mt-1 text-sm text-muted">Note: {o.notes}</p>}
              <OrderStatusForm id={o.id} status={o.status} trackingNote={o.trackingNote ?? ""} />
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
