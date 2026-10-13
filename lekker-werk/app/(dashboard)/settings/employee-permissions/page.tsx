import { Card } from "@/components/dashboard/ui";
import { EMPLOYEE_DATA_KEYS } from "@/lib/defaults";
import { requirePageContext } from "@/server/auth/guards";
import { getEmployeeDataPermissions } from "@/server/services/company.service";
import { PermissionsForm } from "../_components/PermissionsForm";

export const metadata = { title: "Employee permissions · LekkerWerk" };

export default async function EmployeePermissionsPage() {
  const ctx = await requirePageContext("settings:manage");
  const perms = await getEmployeeDataPermissions(ctx.companyId);
  return (
    <Card title="What employees can request via WhatsApp / Telegram" className="max-w-3xl">
      <PermissionsForm
        items={EMPLOYEE_DATA_KEYS.map((k) => ({ key: k.key, label: k.label }))}
        initial={perms}
      />
    </Card>
  );
}
