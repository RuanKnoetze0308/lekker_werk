import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/dashboard/ui";
import { DEVICE_KIND_LABEL, SHOP_ORDER_STATUS_LABEL, formatRand } from "@/lib/device-labels";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { listDevices } from "@/server/devices/device.service";
import { getCompany } from "@/server/services/company.service";
import { listLocations } from "@/server/services/location.service";
import { listShopOrders, listShopProducts } from "@/server/services/shop.service";
import type { AuthContext } from "@/server/auth/context";
import { AddDeviceButton, DeviceActions } from "./_components/DeviceForms";
import { HardwareShop } from "./_components/HardwareShop";

export const metadata = { title: "Clock devices · LekkerWerk" };

const TABS = [
  { id: "devices", label: "My devices" },
  { id: "shop", label: "Buy hardware" },
  { id: "orders", label: "Orders" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const ORDER_TONE = { PENDING_PAYMENT: "amber", PAID: "blue", SHIPPED: "green", CANCELLED: "red" } as const;

const MODE_LABEL = {
  CLOCK_IN: "In only",
  CLOCK_OUT: "Out only",
  BREAK_START: "Break start",
  BREAK_END: "Break end",
} as const;

export default async function DevicesPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string }> }) {
  const ctx = await requirePageContext("devices:manage");
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.id === sp.tab) ? (sp.tab as Tab) : "devices";

  return (
    <>
      <PageHeader
        title="Clock devices"
        description="RFID and NFC readers, biometric scanners and kiosks: another way to clock in besides WhatsApp and Telegram. Manage your devices or buy hardware here."
      />
      <nav className="mb-5 flex gap-1 overflow-x-auto rounded-[14px] border border-border bg-white p-1" aria-label="Devices sections">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.id === "devices" ? "/devices" : `/devices?tab=${t.id}`}
            aria-current={tab === t.id ? "page" : undefined}
            className={`flex-1 whitespace-nowrap rounded-[10px] px-3 py-2 text-center text-sm font-semibold ${tab === t.id ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {sp.status === "success" && tab === "orders" && (
        <p className="mb-4 rounded-xl bg-pale-green px-4 py-3 text-sm text-ink">Thanks! Your order shows as paid once PayFast confirms the payment (usually within a minute).</p>
      )}
      {sp.status === "cancelled" && tab === "shop" && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">Payment was cancelled. Nothing was charged; your order was not placed.</p>
      )}
      {tab === "devices" && <MyDevices ctx={ctx} />}
      {tab === "shop" && <Shop ctx={ctx} />}
      {tab === "orders" && <Orders ctx={ctx} />}
    </>
  );
}

async function Shop({ ctx }: { ctx: AuthContext }) {
  const products = await listShopProducts(ctx);
  return (
    <HardwareShop
      defaultName={ctx.name}
      products={products.map((p) => ({ id: p.id, name: p.name, description: p.description, category: p.category, priceCents: p.priceCents, imageUrl: p.imageUrl, inStock: p.inStock }))}
    />
  );
}

async function Orders({ ctx }: { ctx: AuthContext }) {
  const [orders, company] = await Promise.all([listShopOrders(ctx), getCompany(ctx)]);
  if (!orders.length) {
    return <Card><EmptyState title="No orders yet" hint="Hardware you buy under Buy hardware shows up here with its delivery status." /></Card>;
  }
  return (
    <div className="flex flex-col gap-3">
      {orders.map((o) => (
        <Card key={o.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-ink">{formatRand(o.totalCents)}</p>
              <p className="text-xs text-muted">Ordered {formatDateTime(o.createdAt, company.timezone)} · #{o.id.slice(-8)}</p>
            </div>
            <Badge tone={ORDER_TONE[o.status]}>{SHOP_ORDER_STATUS_LABEL[o.status]}</Badge>
          </div>
          <ul className="mt-3 text-sm text-ink">
            {o.items.map((i) => <li key={i.id}>{i.quantity}× {i.name}</li>)}
          </ul>
          <p className="mt-2 text-xs text-muted">Deliver to {o.deliveryName}, {o.deliveryAddress}</p>
          {o.trackingNote && <p className="mt-2 rounded-lg bg-soft-surface px-3 py-2 text-sm">{o.trackingNote}</p>}
        </Card>
      ))}
    </div>
  );
}

async function MyDevices({ ctx }: { ctx: AuthContext }) {
  const [devices, locations] = await Promise.all([listDevices(ctx), listLocations(ctx)]);
  const status = (d: (typeof devices)[number]) =>
    !d.enabled ? <Badge tone="red">disabled</Badge> : d.online ? <Badge tone="green">online</Badge> : <Badge tone="gray">{d.lastSeenAt ? "offline" : "never connected"}</Badge>;

  return (
    <>
      <div className="mb-4 flex justify-end">
        <AddDeviceButton locations={locations.map((l) => ({ id: l.id, name: l.name }))} />
      </div>

      <Card flush>
        {devices.length === 0 ? (
          <EmptyState
            title="No devices yet"
            hint="Add a device, then give its API key to the installer. Any terminal that can send an HTTPS request works."
          />
        ) : (
          <>
          {/* Phones: stacked so the actions are reachable without sideways scrolling. */}
          <ul className="divide-y divide-border/70 md:hidden">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-col gap-1.5 px-4 py-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-ink">{d.name}</p>
                  {status(d)}
                </div>
                <p className="text-xs text-muted">{DEVICE_KIND_LABEL[d.kind]} · {d.locationName} · {d.fixedAction ? MODE_LABEL[d.fixedAction] : "Tap in / tap out"}</p>
                <p className="text-xs text-muted">{d.punches24h} punches (24h){d.lastSeenAt ? ` · last seen ${formatDateTime(d.lastSeenAt, d.timezone)}` : ""}</p>
                <span className="self-start"><DeviceActions id={d.id} name={d.name} enabled={d.enabled} canSimulate={env.simulatorsEnabled} /></span>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
          <Table>
            <thead>
              <tr>
                <Th>Device</Th>
                <Th>Location</Th>
                <Th>Mode</Th>
                <Th>Status</Th>
                <Th>Last seen</Th>
                <Th className="text-right">Punches (24h)</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id}>
                  <Td>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted">
                      {DEVICE_KIND_LABEL[d.kind]} · key {d.keyHint}…{d.serialNumber ? ` · S/N ${d.serialNumber}` : ""}
                    </p>
                  </Td>
                  <Td>{d.locationName}</Td>
                  <Td className="text-muted">{d.fixedAction ? MODE_LABEL[d.fixedAction] : "Tap in / tap out"}</Td>
                  <Td>{status(d)}</Td>
                  <Td className="text-muted">{d.lastSeenAt ? formatDateTime(d.lastSeenAt, d.timezone) : "—"}</Td>
                  <Td className="text-right">{d.punches24h}</Td>
                  <Td className="text-right">
                    <DeviceActions id={d.id} name={d.name} enabled={d.enabled} canSimulate={env.simulatorsEnabled} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          </div>
          </>
        )}
      </Card>

      <Card title="Connecting a device" className="mt-6">
        <div className="flex flex-col gap-3 text-sm text-muted">
          <p>
            Terminals send each tap to{" "}
            <code className="break-all rounded bg-soft-surface px-1.5 py-0.5 text-ink">
              POST {env.appUrl}/api/device/v1/punches
            </code>{" "}
            with the header{" "}
            <code className="break-all rounded bg-soft-surface px-1.5 py-0.5 text-ink">
              Authorization: Bearer &lt;device key&gt;
            </code>
            . A device that was offline sends its stored taps in one batch, with the time each one happened.
          </p>
          <pre className="overflow-x-auto rounded-[12px] bg-ink p-4 text-xs leading-relaxed text-white">{`{
  "punches": [
    { "punchId": "reader7-000123", "credential": { "kind": "RFID_CARD", "value": "04A21F9C" },
      "capturedAt": "2026-10-10T06:58:12Z" }
  ]
}`}</pre>
          <p>Full reference: docs/api/API_CATALOG.md → Device API.</p>
        </div>
      </Card>
    </>
  );
}
