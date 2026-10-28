import { PageHeader } from "@/components/dashboard/ui";
import { requirePlatformPage } from "@/server/auth/guards";
import { twoStepStatus } from "@/server/services/two-step.service";
import { TwoStepPanel } from "./TwoStepPanel";

export const metadata = { title: "Security · System portal · LekkerWerk" };

export default async function SystemSecurityPage() {
  const { ctx } = await requirePlatformPage();
  const status = await twoStepStatus(ctx);
  return (
    <>
      <PageHeader
        title="Security"
        description="Your super admin account can see every tenant. Two-step login asks for a code from an authenticator app (Google Authenticator, Authy, 1Password) after your password."
      />
      <TwoStepPanel enabled={status.enabled} backupCodesLeft={status.backupCodesLeft} />
    </>
  );
}
