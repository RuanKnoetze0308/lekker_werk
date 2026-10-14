import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar, type NavItem } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { requirePageContext } from "@/server/auth/guards";
import { can, type Permission } from "@/server/auth/permissions";
import { getCompany } from "@/server/services/company.service";
import { ExitTenantButton } from "./system/_components/SystemActions";

const NAV: (NavItem & { permission: Permission })[] = [
  { label: "Dashboard", href: "/dashboard", icon: "dashboard", permission: "dashboard:view" },
  { label: "Employees", href: "/employees", icon: "employees", group: "Workforce", permission: "employees:read" },
  { label: "Attendance", href: "/attendance", icon: "attendance", group: "Workforce", permission: "attendance:read" },
  { label: "Schedules", href: "/schedules", icon: "schedules", group: "Workforce", permission: "schedules:manage" },
  { label: "Leave", href: "/leave", icon: "leave", group: "Workforce", permission: "leave:approve" },
  { label: "Exceptions", href: "/exceptions", icon: "exceptions", group: "Workforce", permission: "attendance:read" },
  { label: "Payroll", href: "/payroll", icon: "payroll", group: "Workforce", permission: "payroll:manage" },
  { label: "Locations", href: "/locations", icon: "locations", permission: "locations:read" },
  { label: "QR Codes", href: "/qr-codes", icon: "qr", permission: "qr:manage" },
  { label: "Clock devices", href: "/devices", icon: "devices", permission: "devices:manage" },
  { label: "Integrations", href: "/integrations", icon: "integrations", permission: "integrations:manage" },
  { label: "Reports", href: "/reports", icon: "reports", permission: "reports:read" },
  { label: "Billing", href: "/billing", icon: "billing", permission: "settings:manage" },
  { label: "Settings", href: "/settings", icon: "settings", permission: "settings:manage" },
];

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePageContext();
  const company = await getCompany(ctx);
  const path = (await headers()).get("x-pathname") ?? "";
  const b = ctx.billing;
  const canBill = can(ctx.role, "settings:manage");

  const superAdmin = ctx.role === "SUPER_ADMIN";

  // Trial or subscription lapsed: the only reachable page is Billing (for admins).
  // Platform operators can still go everywhere so they can help the tenant.
  if (b.locked && !superAdmin && !path.startsWith("/billing")) {
    if (canBill) redirect("/billing");
    return (
      <main className="flex min-h-screen items-center justify-center bg-soft-surface px-5">
        <div className="max-w-md rounded-[24px] border border-border bg-white p-8 text-center">
          <h1 className="font-display text-2xl font-bold text-ink">Subscription inactive</h1>
          <p className="mt-3 text-sm text-muted">
            {company.name}&rsquo;s free trial or subscription has ended. Please ask a company admin to choose a plan.
          </p>
        </div>
      </main>
    );
  }

  const items = NAV.filter((n) => can(ctx.role, n.permission)).map(({ permission: _p, ...item }) => item);
  // Single entry point for platform operators; never rendered for anyone else.
  if (superAdmin) items.push({ label: "System portal", href: "/system", icon: "system", group: "Platform" });

  const banner =
    b.state === "TRIALING"
      ? { tone: "bg-pale-green text-ink", text: `Free trial: ${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"} left.` }
      : b.state === "GRACE"
        ? { tone: "bg-amber-50 text-amber-900", text: `Payment overdue. Access continues for ${b.daysLeft} more day${b.daysLeft === 1 ? "" : "s"}.` }
        : b.state === "ACTIVE" && b.cancelAtPeriodEnd
          ? { tone: "bg-amber-50 text-amber-900", text: `Your subscription ends in ${b.daysLeft} day${b.daysLeft === 1 ? "" : "s"} and won't renew.` }
          : null;

  return (
    <div className="min-h-screen bg-soft-surface">
      <Sidebar items={items} companyName={company.name} />
      <div className="lg:pl-64">
        <div className="pt-14 lg:pt-0">
          <Topbar name={ctx.name} role={ctx.role} />
        </div>
        {ctx.impersonating && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-ink px-5 py-2.5 text-sm font-medium text-white">
            <span>Viewing <strong>{company.name}</strong> as a super admin. Changes are logged under your name.</span>
            <ExitTenantButton />
          </div>
        )}
        {banner && (
          <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm font-medium ${banner.tone}`}>
            <span>{banner.text}</span>
            {canBill && !path.startsWith("/billing") && (
              <Link href="/billing" className="font-semibold text-dark-green underline underline-offset-2">
                {b.state === "TRIALING" ? "Choose a plan" : "Manage billing"}
              </Link>
            )}
          </div>
        )}
        <main className="mx-auto w-full max-w-[1280px] px-5 py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
