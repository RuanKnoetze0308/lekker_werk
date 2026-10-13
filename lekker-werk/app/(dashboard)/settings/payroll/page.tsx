import Link from "next/link";
import { Card } from "@/components/dashboard/ui";
import { requirePageContext } from "@/server/auth/guards";
import { getSettings } from "@/server/services/company.service";
import { PayrollSettingsForm } from "../_components/PayrollSettingsForm";

export const metadata = { title: "Payroll settings · LekkerWerk" };

export default async function PayrollSettingsPage() {
  const ctx = await requirePageContext("settings:manage");
  const { payroll } = await getSettings(ctx.companyId);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card title="Pay periods & normal hours">
        <PayrollSettingsForm initial={payroll} />
      </Card>
      <Card title="Leave types">
        <p className="text-sm text-muted">
          Annual, sick, family responsibility and the other leave types are set up with South African minimums.{" "}
          <Link href="/leave?tab=types" className="font-semibold text-dark-green hover:underline">Manage leave types →</Link>
        </p>
      </Card>
    </div>
  );
}
