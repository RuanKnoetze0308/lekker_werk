import { Card } from "@/components/dashboard/ui";
import { requirePageContext } from "@/server/auth/guards";
import { getCompany } from "@/server/services/company.service";
import { listLocations } from "@/server/services/location.service";
import { CompanyForm } from "./_components/CompanyForm";
import Link from "next/link";

export const metadata = { title: "Settings · LekkerWerk" };

export default async function CompanySettingsPage() {
  const ctx = await requirePageContext("settings:manage");
  const [company, locations] = await Promise.all([getCompany(ctx), listLocations(ctx, { includeInactive: true })]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card title="Company details" className="lg:col-span-2">
        <CompanyForm
          company={{
            name: company.name,
            registrationNumber: company.registrationNumber ?? "",
            contactName: company.contactName,
            contactEmail: company.contactEmail,
            contactPhone: company.contactPhone,
            timezone: company.timezone,
            preferredChannel: company.preferredChannel,
          }}
        />
      </Card>
      <Card title="Locations" action={<Link href="/locations" className="text-xs font-medium text-dark-green">Manage</Link>}>
        <ul className="flex flex-col gap-2 text-sm">
          {locations.map((l) => (
            <li key={l.id} className="flex items-center justify-between">
              <Link href={`/locations/${l.id}`} className="hover:text-dark-green">{l.name}</Link>
              <span className="text-muted">{l.employeeCount} staff</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
