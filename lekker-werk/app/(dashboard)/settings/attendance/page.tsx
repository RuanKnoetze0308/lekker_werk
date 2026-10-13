import { Card } from "@/components/dashboard/ui";
import { requirePageContext } from "@/server/auth/guards";
import { getSettings } from "@/server/services/company.service";
import { AttendanceForm } from "../_components/AttendanceForm";

export const metadata = { title: "Attendance settings · LekkerWerk" };

export default async function AttendanceSettingsPage() {
  const ctx = await requirePageContext("settings:manage");
  const { attendance } = await getSettings(ctx.companyId);
  return (
    <Card title="Clocking rules" className="max-w-3xl">
      <AttendanceForm initial={attendance} />
    </Card>
  );
}
