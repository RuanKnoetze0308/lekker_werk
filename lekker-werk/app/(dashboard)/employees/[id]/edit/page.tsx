import { Card, PageHeader } from "@/components/dashboard/ui";
import { requirePageContext } from "@/server/auth/guards";
import { getEmployee } from "@/server/services/employee.service";
import { listLocations } from "@/server/services/location.service";
import { listManagerUsers } from "@/server/services/user.service";
import { EmployeeForm } from "../../_components/EmployeeForm";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext("employees:write");
  const { id } = await params;
  const [{ employee: e, extraLocations }, locations, managers] = await Promise.all([
    getEmployee(ctx, id),
    listLocations(ctx),
    listManagerUsers(ctx),
  ]);

  return (
    <>
      <PageHeader title={`Edit ${e.firstName} ${e.lastName}`} />
      <Card>
        <EmployeeForm
          employeeId={id}
          locations={locations}
          managers={managers}
          initial={{
            locationId: e.locationId,
            employeeNumber: e.employeeNumber,
            firstName: e.firstName,
            lastName: e.lastName,
            email: e.email ?? "",
            phone: e.phone ?? "",
            department: e.department ?? "",
            position: e.position ?? "",
            managerId: e.managerId ?? "",
            preferredChannel: e.preferredChannel ?? "",
            platformIdentifier: e.platformIdentifier ?? "",
            extraLocationIds: extraLocations.map((l) => l.locationId).filter((l) => l !== e.locationId),
            hiredOn: e.hiredOn ?? "",
          }}
        />
      </Card>
    </>
  );
}
