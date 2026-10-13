import type { ReactNode } from "react";
import { PageHeader } from "@/components/dashboard/ui";
import { requirePageContext } from "@/server/auth/guards";
import { SettingsTabs } from "./_components/SettingsTabs";

export default async function SettingsLayout({ children }: { children: ReactNode }) {
  await requirePageContext("settings:manage");
  return (
    <>
      <PageHeader title="Settings" description="Company-wide configuration. Changes are recorded in the audit log." />
      <SettingsTabs />
      {children}
    </>
  );
}
