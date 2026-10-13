import Link from "next/link";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { getCompany, getSettings } from "@/server/services/company.service";
import { listPayPeriods } from "@/server/time/payroll.service";

export const metadata = { title: "Payroll · LekkerWerk" };

const TONE = { OPEN: "blue", LOCKED: "amber", EXPORTED: "green" } as const;
const FREQ = { MONTHLY: "Monthly", FORTNIGHTLY: "Fortnightly", WEEKLY: "Weekly" } as const;

export default async function PayrollPage() {
  const ctx = await requirePageContext("payroll:manage");
  const [periods, company, settings] = await Promise.all([listPayPeriods(ctx), getCompany(ctx), getSettings(ctx.companyId)]);

  return (
    <>
      <PageHeader
        title="Payroll"
        description={`${FREQ[settings.payroll.frequency]} pay periods. Review each period, sort out exceptions, lock it, then export hours for your payroll system.`}
      />
      <Card flush>
        <Table>
          <thead>
            <tr><Th>Period</Th><Th>Status</Th><Th>Locked</Th><Th /></tr>
          </thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium">{p.startDate} → {p.endDate}</Td>
                <Td><Badge tone={TONE[p.status]}>{p.status.toLowerCase()}</Badge></Td>
                <Td className="text-muted">{p.lockedAt ? formatDateTime(p.lockedAt, company.timezone) : "—"}</Td>
                <Td className="text-right">
                  <Link href={`/payroll/${p.id}`} className="text-sm font-semibold text-dark-green hover:underline">
                    {p.status === "OPEN" ? "Review →" : "View →"}
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="mt-4 text-sm text-muted">
        Change the pay frequency or period start day under{" "}
        <Link href="/settings/payroll" className="font-medium text-dark-green hover:underline">Settings → Payroll &amp; leave</Link>.
      </p>
    </>
  );
}
