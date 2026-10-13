import { Card, EmptyState, Table, Td, Th } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { listAuditLogs } from "@/server/services/audit.service";
import { getCompany } from "@/server/services/company.service";

export const metadata = { title: "Audit log · LekkerWerk" };

export default async function AuditPage() {
  const ctx = await requirePageContext("audit:read");
  const [logs, company] = await Promise.all([listAuditLogs(ctx, 200), getCompany(ctx)]);

  return (
    <Card title="Recent activity" flush>
      {logs.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <Table>
          <thead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Entity</Th><Th>Details</Th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(l.createdAt, company.timezone)}</Td>
                <Td>{l.userName ?? "System"}</Td>
                <Td className="font-medium">{l.action}</Td>
                <Td className="text-muted">{l.entityType}</Td>
                <Td className="max-w-md truncate text-xs text-muted">{JSON.stringify(l.metadata)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
