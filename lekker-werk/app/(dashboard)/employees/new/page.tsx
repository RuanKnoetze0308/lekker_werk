import { Card, PageHeader } from "@/components/dashboard/ui";
import { requirePageContext } from "@/server/auth/guards";
import { listLocations } from "@/server/services/location.service";
import { listManagerUsers } from "@/server/services/user.service";
import { EmployeeForm } from "../_components/EmployeeForm";

export const metadata = { title: "Add employee · LekkerWerk" };

export default async function NewEmployeePage() {
  const ctx = await requirePageContext("employees:write");
  const [locations, managers] = await Promise.all([listLocations(ctx), listManagerUsers(ctx)]);

  return (
    <>
      <PageHeader title="Add employee" />
      <Card>
        <EmployeeForm locations={locations} managers={managers} />
      </Card>
    </>
  );
}
