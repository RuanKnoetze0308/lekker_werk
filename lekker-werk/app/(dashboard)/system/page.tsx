import Link from "next/link";
import { Search, ShieldCheck, ShoppingBag } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, statusTone } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/Button";
import { requirePlatformPage } from "@/server/auth/guards";
import { listTenants } from "@/server/services/platform.service";
import { EnterTenantButton } from "./_components/SystemActions";

export const metadata = { title: "System portal · LekkerWerk" };

export default async function SystemPortalPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx } = await requirePlatformPage();
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const tenants = await listTenants(ctx, q);

  return (
    <>
      <PageHeader
        title="System portal"
        description="Every tenant on LekkerWerk. Open one to work inside it with all its data; everything you change is logged under your name."
        actions={
          <>
            <Button href="/system/security" variant="secondary-light" icon={<ShieldCheck className="size-4" />}>Security</Button>
            <Button href="/system/shop" variant="secondary-light" icon={<ShoppingBag className="size-4" />}>Hardware shop</Button>
          </>
        }
      />
      <form className="mb-4 flex gap-2" action="/system">
        <label className="relative flex-1">
          <span className="sr-only">Search tenants</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search company, contact or email"
            className="w-full rounded-[13px] border border-border bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-dark-green"
          />
        </label>
        <Button type="submit" variant="ink">Search</Button>
      </form>
      <Card flush>
        {tenants.length === 0 ? (
          <EmptyState title={q ? "No tenants match" : "No tenants yet"} />
        ) : (
          <>
            <ul className="divide-y divide-border/70 md:hidden">
              {tenants.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 px-4 py-4 text-sm">
                  <Link href={`/system/tenants/${t.id}`} className="font-semibold text-ink hover:text-dark-green">{t.name}</Link>
                  <span className="break-all text-muted">{t.contactName} · {t.contactEmail}</span>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={statusTone(t.subscriptionStatus === "ACTIVE" ? "ACTIVE" : t.subscriptionStatus ?? "")}>{t.subscriptionStatus ?? "No plan"}</Badge>
                    <Badge>{t.locations} loc</Badge><Badge>{t.employees} staff</Badge><Badge>{t.devices} devices</Badge>
                  </span>
                  <span className="self-start"><EnterTenantButton companyId={t.id} /></span>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr><Th>Tenant</Th><Th>Contact</Th><Th>Plan</Th><Th className="text-right">Locations</Th><Th className="text-right">Staff</Th><Th className="text-right">Devices</Th><Th /></tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr key={t.id} className="hover:bg-soft-surface/50">
                      <Td><Link href={`/system/tenants/${t.id}`} className="font-medium hover:text-dark-green">{t.name}</Link></Td>
                      <Td className="text-muted">{t.contactName}<p className="text-xs">{t.contactEmail}</p></Td>
                      <Td>
                        <Badge tone={statusTone(t.subscriptionStatus === "ACTIVE" ? "ACTIVE" : t.subscriptionStatus ?? "")}>{t.subscriptionStatus ?? "No plan"}</Badge>
                        {t.plan && <p className="mt-0.5 text-xs capitalize text-muted">{t.plan.toLowerCase()}</p>}
                      </Td>
                      <Td className="text-right">{t.locations}</Td>
                      <Td className="text-right">{t.employees}</Td>
                      <Td className="text-right">{t.devices}</Td>
                      <Td className="text-right"><EnterTenantButton companyId={t.id} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
