import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { getCompany } from "@/server/services/company.service";
import { listLocations } from "@/server/services/location.service";
import { listQrCodes } from "@/server/services/qr.service";
import { QrCreateButton, QrRowActions } from "./_components/QrActions";

export const metadata = { title: "QR codes · LekkerWerk" };

export default async function QrCodesPage() {
  const ctx = await requirePageContext("qr:manage");
  const [codes, locations, company] = await Promise.all([listQrCodes(ctx), listLocations(ctx), getCompany(ctx)]);

  const thumb = (q: (typeof codes)[number], size: number) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/qr/${q.id}/download?format=svg`}
      alt={`QR for ${q.label}`}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 rounded-lg border border-border bg-white ${q.enabled ? "" : "opacity-30"}`}
    />
  );
  const modeBadge = (q: (typeof codes)[number]) =>
    q.mode === "DYNAMIC" ? <Badge tone="blue">Dynamic · {q.rotationSeconds}s</Badge> : <Badge>Static</Badge>;
  const typeText = (q: (typeof codes)[number]) => (
    <>
      <span className="capitalize">{q.type.toLowerCase().replace("_", " ")}</span>
      {q.expiresAt && <p className="text-xs text-muted">expires {formatDateTime(q.expiresAt, company.timezone)}</p>}
    </>
  );

  return (
    <>
      <PageHeader
        title="QR codes"
        description="Employees scan a code at their workplace to start clocking. Static codes are printed; dynamic codes change every few seconds on a screen, so a photo of the code can't be used from home."
        actions={<QrCreateButton locations={locations} />}
      />
      <Card flush>
        {codes.length === 0 ? (
          <EmptyState title="No QR codes yet" hint="Create one for each location, then print it or put it on a screen where employees clock in." />
        ) : (
          <>
            {/* Phones: stacked so every action is reachable without sideways scrolling. */}
            <ul className="divide-y divide-border/70 md:hidden">
              {codes.map((q) => (
                <li key={q.id} className="flex flex-col gap-3 px-4 py-4 text-sm">
                  <div className="flex items-start gap-3">
                    {thumb(q, 64)}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink">{q.label}</p>
                      <p className="text-muted">{q.locationName}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {modeBadge(q)}
                        <Badge tone={q.enabled ? "green" : "red"}>{q.enabled ? "Active" : "Disabled"}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted">{typeText(q)}</p>
                    </div>
                  </div>
                  <QrRowActions id={q.id} enabled={q.enabled} mode={q.mode} align="start" />
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr><Th>QR</Th><Th>Label</Th><Th>Location</Th><Th>Mode</Th><Th>Type</Th><Th>Status</Th><Th>Created</Th><Th /></tr>
                </thead>
                <tbody>
                  {codes.map((q) => (
                    <tr key={q.id}>
                      <Td>{thumb(q, 56)}</Td>
                      <Td className="font-medium">{q.label}<p className="text-xs font-normal text-muted">…{q.tokenHint}</p></Td>
                      <Td>{q.locationName}</Td>
                      <Td>{modeBadge(q)}</Td>
                      <Td>{typeText(q)}</Td>
                      <Td><Badge tone={q.enabled ? "green" : "red"}>{q.enabled ? "Active" : "Disabled"}</Badge></Td>
                      <Td className="text-muted">{formatDateTime(q.createdAt, company.timezone)}</Td>
                      <Td className="text-right"><QrRowActions id={q.id} enabled={q.enabled} mode={q.mode} /></Td>
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
