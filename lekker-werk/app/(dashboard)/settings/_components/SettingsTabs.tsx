"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/settings", label: "Company" },
  { href: "/settings/communication", label: "Communication" },
  { href: "/settings/attendance", label: "Attendance" },
  { href: "/settings/employee-permissions", label: "Employee permissions" },
  { href: "/settings/users", label: "Users & roles" },
  { href: "/settings/audit", label: "Audit log" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border" aria-label="Settings sections">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium ${active ? "border-dark-green text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
