"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  CalendarClock,
  LayoutDashboard,
  MapPin,
  Menu,
  Plug,
  QrCode,
  Settings,
  Users,
  X,
  Clock,
  CreditCard,
  Nfc,
  Palmtree,
  ShieldCheck,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";

const ICONS = {
  dashboard: LayoutDashboard,
  employees: Users,
  attendance: Clock,
  schedules: CalendarClock,
  locations: MapPin,
  qr: QrCode,
  devices: Nfc,
  leave: Palmtree,
  exceptions: TriangleAlert,
  payroll: Wallet,
  integrations: Plug,
  reports: BarChart3,
  billing: CreditCard,
  settings: Settings,
  system: ShieldCheck,
} as const;

export interface NavItem {
  label: string;
  href: string;
  icon: keyof typeof ICONS;
  group?: string;
}

export function Sidebar({ items, companyName }: { items: NavItem[]; companyName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const groups = items.reduce<Record<string, NavItem[]>>((acc, item) => {
    (acc[item.group ?? ""] ??= []).push(item);
    return acc;
  }, {});

  const nav = (
    <nav className="flex flex-col gap-5 px-3 pb-6" aria-label="Main">
      {Object.entries(groups).map(([group, list]) => (
        <div key={group} className="flex flex-col gap-1">
          {group && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-white/40">{group}</p>}
          {list.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition-colors ${active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"}`}
              >
                <Icon className={`size-[18px] ${active ? "text-brand-green" : ""}`} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between bg-ink px-4 lg:hidden">
        <Logo variant="light" />
        <button type="button" aria-label="Toggle menu" onClick={() => setOpen((v) => !v)} className="text-white">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 flex-col overflow-y-auto bg-ink pt-14 lg:flex lg:pt-0 ${open ? "flex" : "hidden"}`}
      >
        <div className="hidden px-5 py-6 lg:block">
          <Logo variant="light" />
          <p className="mt-3 truncate text-xs text-white/50">{companyName}</p>
        </div>
        {nav}
      </aside>
    </>
  );
}
