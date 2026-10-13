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

  return (
    <>
      <PageHeader
        title="QR codes"
        description="Employees scan a code at their workplace to start clocking. Codes hold only a secure token; every clocking is validated on the server."
        actions={<QrCreateButton locations={locations} />}
      />
      <Card flush>
        {codes.length === 0 ? (
          <EmptyState title="No QR codes yet" hint="Create one for each location, then print it and display it where employees clock in." />
        ) : (
          <Table>
            <thead>
              <tr><Th>QR</Th><Th>Label</Th><Th>Location</Th><Th>Type</Th><Th>Status</Th><Th>Created</Th><Th /></tr>
            </thead>
            <tbody>
              {codes.map((q) => (
                <tr key={q.id}>
                  <Td>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/qr/${q.id}/download?format=svg`} alt={`QR for ${q.label}`} width={56} height={56} className={`rounded-lg border border-border ${q.enabled ? "" : "opacity-30"}`} />
                  </Td>
                  <Td className="font-medium">{q.label}<p className="text-xs font-normal text-muted">…{q.tokenHint}</p></Td>
                  <Td>{q.locationName}</Td>
                  <Td className="capitalize">{q.type.toLowerCase()}{q.expiresAt && <p className="text-xs text-muted">expires {formatDateTime(q.expiresAt, company.timezone)}</p>}</Td>
                  <Td><Badge tone={q.enabled ? "green" : "red"}>{q.enabled ? "Active" : "Disabled"}</Badge></Td>
                  <Td className="text-muted">{formatDateTime(q.createdAt, company.timezone)}</Td>
                  <Td className="text-right"><QrRowActions id={q.id} enabled={q.enabled} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
