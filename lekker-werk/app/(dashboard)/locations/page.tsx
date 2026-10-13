import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th, statusTone } from "@/components/dashboard/ui";
import { can } from "@/server/auth/permissions";
import { requirePageContext } from "@/server/auth/guards";
import { listLocations } from "@/server/services/location.service";
import { NewLocationButton } from "./_components/LocationForms";

export const metadata = { title: "Locations · LekkerWerk" };

export default async function LocationsPage() {
  const ctx = await requirePageContext("locations:read");
  const locations = await listLocations(ctx, { includeInactive: true });

  return (
    <>
      <PageHeader
        title="Locations"
        description="Each store or site has its own employees, QR codes, managers and clock-in rules."
        actions={can(ctx.role, "locations:write") && <NewLocationButton />}
      />
      <Card flush>
        {locations.length === 0 ? (
          <EmptyState title="No locations yet" />
        ) : (
          <Table>
            <thead>
              <tr><Th>Name</Th><Th>Address</Th><Th>GPS</Th><Th className="text-right">Employees</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id} className="hover:bg-soft-surface/50">
                  <Td>
                    <Link href={`/locations/${l.id}`} className="font-medium hover:text-dark-green">{l.name}</Link>
                  </Td>
                  <Td className="text-muted">{l.address ?? "—"}</Td>
                  <Td className="text-muted">{l.latitude != null ? `${l.latitude.toFixed(4)}, ${l.longitude?.toFixed(4)}` : "Not set"}</Td>
                  <Td className="text-right">{l.employeeCount}</Td>
                  <Td><Badge tone={statusTone(l.status)}>{l.status === "ACTIVE" ? "Active" : "Inactive"}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
