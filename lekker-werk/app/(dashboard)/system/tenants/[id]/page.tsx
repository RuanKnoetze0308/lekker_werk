import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, statusTone } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/time";
import { requirePlatformPage } from "@/server/auth/guards";
import { AppError } from "@/server/errors";
import { getTenant } from "@/server/services/platform.service";
import { EnterTenantButton, TenantDeviceToggle } from "../../_components/SystemActions";

export const metadata = { title: "Tenant · System portal · LekkerWerk" };

const KIND_LABEL: Record<string, string> = {
  RFID_READER: "RFID reader",
  NFC_READER: "NFC reader",
  BIOMETRIC: "Biometric",
};

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { ctx } = await requirePlatformPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tenant = await getTenant(ctx, id).catch((e) => {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  });
  const { company, subscription, locations, devices, users } = tenant;
  const tz = company.timezone;

  return (
    <>
      <Link href="/system" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> All tenants
      </Link>
      <PageHeader
        title={company.name}
        description={`${company.contactName} · ${company.contactEmail} · ${company.contactPhone}`}
        actions={<EnterTenantButton companyId={company.id} size="md" />}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Subscription</p>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(subscription?.status === "ACTIVE" ? "ACTIVE" : subscription?.status ?? "")}>{subscription?.status ?? "None"}</Badge>
            {subscription?.plan && <span className="text-sm capitalize">{subscription.plan.toLowerCase()}</span>}
          </p>
          {subscription?.status === "TRIALING" && <p className="mt-1 text-xs text-muted">Trial ends {formatDateTime(subscription.trialEndsAt, tz)}</p>}
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Signed up</p>
          <p className="mt-1 text-sm">{formatDateTime(company.createdAt, tz)}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Users</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {users.map((u) => (
              <li key={u.id} className="break-all">{u.name} <span className="text-xs text-muted">({u.role.toLowerCase().replace("_", " ")})</span></li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        {locations.length === 0 && <Card><EmptyState title="No locations" /></Card>}
        {locations.map((l) => {
          const locDevices = devices.filter((d) => d.locationId === l.id);
          return (
            <Card
              key={l.id}
              title={l.name}
              action={<span className="flex items-center gap-2 text-sm text-muted">{l.employees} staff <Badge tone={statusTone(l.status)}>{l.status === "ACTIVE" ? "Active" : "Inactive"}</Badge></span>}
              flush
            >
              {l.address && <p className="border-b border-border/70 px-5 py-2 text-sm text-muted">{l.address}</p>}
              {locDevices.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted">No clock devices at this location.</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {locDevices.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{d.name}</p>
                        <p className="text-xs text-muted">
                          {KIND_LABEL[d.kind] ?? d.kind.toLowerCase().replace(/_/g, " ")} · {d.lastSeenAt ? `last seen ${formatDateTime(d.lastSeenAt, tz)}` : "never connected"}
                        </p>
                      </div>
                      <TenantDeviceToggle companyId={company.id} deviceId={d.id} enabled={d.enabled} name={d.name} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
