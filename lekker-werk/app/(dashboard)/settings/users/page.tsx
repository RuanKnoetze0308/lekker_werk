import { Badge, Card, Table, Td, Th, statusTone } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/time";
import { requirePageContext } from "@/server/auth/guards";
import { getCompany } from "@/server/services/company.service";
import { listLocations } from "@/server/services/location.service";
import { listUsers } from "@/server/services/user.service";
import { UserCreateButton, UserStatusButton } from "../_components/UsersPanel";

export const metadata = { title: "Users & roles · LekkerWerk" };

const ROLE_LABEL = { SUPER_ADMIN: "Super admin", COMPANY_ADMIN: "Company admin", MANAGER: "Manager", EMPLOYEE: "Employee" } as const;

export default async function UsersPage() {
  const ctx = await requirePageContext("users:manage");
  const [users, locations, company] = await Promise.all([listUsers(ctx), listLocations(ctx), getCompany(ctx)]);

  return (
    <Card title="Administrators & managers" action={<UserCreateButton locations={locations} />} flush>
      <Table>
        <thead><tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Last login</Th><Th>Status</Th><Th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <Td className="font-medium">{u.name}</Td>
              <Td className="text-muted">{u.email}</Td>
              <Td>{ROLE_LABEL[u.role]}</Td>
              <Td className="text-muted">{u.lastLoginAt ? formatDateTime(u.lastLoginAt, company.timezone) : "Never"}</Td>
              <Td><Badge tone={statusTone(u.status)}>{u.status === "ACTIVE" ? "Active" : "Inactive"}</Badge></Td>
              <Td className="text-right">{u.id !== ctx.userId && <UserStatusButton id={u.id} active={u.status === "ACTIVE"} />}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
