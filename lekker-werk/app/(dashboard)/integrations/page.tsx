import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, StatCard, Table, Td, Th, statusTone } from "@/components/dashboard/ui";
import { catalogByProvider, PROVIDER_CATALOG, type ProviderMeta } from "@/lib/integration-catalog";
import { addDays, formatDateTime, localDate } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { getCompany } from "@/server/services/company.service";
import { importedHoursSummary, listIntegrations, listSyncs } from "@/server/services/integration.service";
import { listIntegrationRequests } from "@/server/services/integration-request.service";
import { IntegrationActions, IntegrationFormButton } from "./_components/IntegrationForm";
import { RequestIntegrationButton } from "./_components/RequestIntegration";

export const metadata = { title: "Integrations · LekkerWerk" };

export default async function IntegrationsPage() {
  const ctx = await requirePageContext("integrations:manage");
  const company = await getCompany(ctx);
  const today = localDate(new Date(), company.timezone);
  const [items, summary, requests] = await Promise.all([
    listIntegrations(ctx),
    importedHoursSummary(ctx, addDays(today, -30), today),
    listIntegrationRequests(ctx),
  ]);
  const connected = new Set(items.filter((i) => i.enabled).map((i) => i.provider));
  const requested = new Set(requests.map((r) => r.systemName.toLowerCase()));

  const catalogCard = (p: ProviderMeta) => (
    <div key={p.provider} className="flex flex-col gap-3 rounded-[20px] border border-border bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-ink">{p.label}</p>
        <span className="shrink-0 whitespace-nowrap">
          <Badge tone={connected.has(p.provider) ? "green" : p.implemented ? "blue" : "gray"}>
            {connected.has(p.provider) ? "Connected" : p.implemented ? "Available" : "Coming soon"}
          </Badge>
        </span>
      </div>
      <p className="flex-1 text-sm text-muted">{p.description}</p>
      <p className="text-xs text-muted">
        {p.categories.map((c) => c.toLowerCase()).join(" · ")} ·{" "}
        {p.direction === "EXPORT_HOURS" ? "sends hours to it" : "imports hours from it"}
      </p>
      <div>
        {p.implemented ? (
          <IntegrationFormButton provider={p.provider} label={connected.has(p.provider) ? "Add another" : "Connect"} />
        ) : requested.has(p.label.toLowerCase()) ? (
          <span className="text-sm font-medium text-dark-green">Requested ✓</span>
        ) : (
          <RequestIntegrationButton
            defaultEmail={ctx.email}
            systemName={p.label}
            category={p.categories[0]}
            label="I need this one"
            variant="secondary-light"
          />
        )}
      </div>
    </div>
  );
  const syncs = await Promise.all(items.map((i) => listSyncs(ctx, i.id, 5)));
  const fmt = (d: Date | null) => (d ? formatDateTime(d, company.timezone) : "—");

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Send approved hours to your payroll or accounting system, or import hours from your ERP. Syncs run in the background, so the dashboard never waits on an external API."
        actions={<IntegrationFormButton />}
      />

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Most used in South Africa</h2>
      <div className="mb-6 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {PROVIDER_CATALOG.filter((p) => p.saTop5).map(catalogCard)}
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Other systems</h2>
      <div className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
        {PROVIDER_CATALOG.filter((p) => !p.saTop5).map(catalogCard)}
        <div className="flex flex-col gap-3 rounded-[20px] border border-dashed border-ink/25 bg-soft-surface p-5">
          <p className="font-semibold text-ink">Something else?</p>
          <p className="flex-1 text-sm text-muted">
            Tell us what you use. We scope and quote a custom connector for your system.
          </p>
          <div>
            <RequestIntegrationButton defaultEmail={ctx.email} />
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Connected systems" value={items.filter((i) => i.enabled).length} />
        <StatCard
          label="Imported records (30 days)"
          value={summary.records}
          hint="Shown separately from clock data generated here"
        />
        <StatCard
          label="Imported hours (30 days)"
          value={summary.hours.toFixed(1)}
          hint="Compare in Reports → ERP reconciliation"
        />
      </div>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            title="No integrations connected yet"
            hint="Odoo and Custom API work today. The South African payroll connectors are next; tell us which one you need first."
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {items.map((i, idx) => (
            <Card
              key={i.id}
              title={`${i.name} · ${catalogByProvider[i.provider].label}`}
              action={
                <div className="flex items-center gap-2">
                  <Badge tone={i.enabled ? "green" : "gray"}>{i.enabled ? "Enabled" : "Disabled"}</Badge>
                  <IntegrationFormButton integration={i} />
                </div>
              }
            >
              <dl className="grid gap-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">Last successful sync</dt>
                  <dd>{fmt(i.lastSuccessfulSyncAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Last failed sync</dt>
                  <dd>{fmt(i.lastFailedSyncAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Next scheduled sync</dt>
                  <dd>{i.enabled ? fmt(i.nextSyncAt) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Frequency</dt>
                  <dd>every {i.syncFrequencyMinutes} min</dd>
                </div>
              </dl>
              {i.lastError && (
                <p className="mt-3 rounded-[10px] bg-red-50 px-3 py-2 text-sm text-red-700">
                  Last error: {i.lastError}
                </p>
              )}
              <div className="mt-4">
                <IntegrationActions id={i.id} />
              </div>

              {syncs[idx].length > 0 && (
                <div className="mt-5 -mx-5 border-t border-border">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Started</Th>
                        <Th>Status</Th>
                        <Th>Duration</Th>
                        <Th>Records</Th>
                        <Th>Error</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {syncs[idx].map((s) => (
                        <tr key={s.id}>
                          <Td>{fmt(s.startedAt ?? s.createdAt)}</Td>
                          <Td>
                            <Badge tone={statusTone(s.status)}>{s.status.toLowerCase()}</Badge>
                          </Td>
                          <Td>{s.durationMs != null ? `${(s.durationMs / 1000).toFixed(1)}s` : "—"}</Td>
                          <Td>{s.recordsImported}</Td>
                          <Td className="max-w-xs truncate text-red-600">{s.errorMessage ?? ""}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {requests.length > 0 && (
        <Card title="Your integration requests" className="mt-6" flush>
          <Table>
            <thead>
              <tr>
                <Th>System</Th>
                <Th>Type</Th>
                <Th>Requested</Th>
                <Th>Status</Th>
                <Th className="text-right">Quote</Th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{r.systemName}</Td>
                  <Td className="text-muted">{r.category.toLowerCase()}</Td>
                  <Td>{fmt(r.createdAt)}</Td>
                  <Td>
                    <Badge tone={r.status === "DECLINED" ? "red" : r.status === "COMPLETED" ? "green" : "amber"}>
                      {r.status.toLowerCase().replace("_", " ")}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    {r.quotedAmount ? `R ${Number(r.quotedAmount).toLocaleString("en-ZA")}` : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <p className="mt-6 text-sm text-muted">
        Compare imported and system hours in{" "}
        <Link href="/reports" className="font-medium text-dark-green">
          Reports → ERP reconciliation
        </Link>
        .
      </p>
    </>
  );
}
