"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

  // The phone drawer covers the page: stop the page behind it from scrolling, and let Escape close it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  // Groups keep the order in which they first appear in `items`.
  const groups: { name: string; list: NavItem[] }[] = [];
  for (const item of items) {
    const name = item.group ?? "";
    let g = groups.find((x) => x.name === name);
    if (!g) groups.push((g = { name, list: [] }));
    g.list.push(item);
  }

  const nav = (
    <nav className="flex flex-col gap-6 px-3 pb-6" aria-label="Main">
      {groups.map(({ name, list }) => (
        <div key={name} className="flex flex-col gap-0.5">
          {name && (
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/40">{name}</p>
          )}
          {list.map((item) => {
            const Icon = ICONS[item.icon];
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-green/70 ${
                  active ? "bg-white/10 text-white" : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-brand-green" aria-hidden />}
                <Icon
                  className={`size-[18px] shrink-0 ${active ? "text-brand-green" : "text-white/50 group-hover:text-white/80"}`}
                  aria-hidden
                />
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
        <Link href="/dashboard" aria-label="LekkerWerk dashboard">
          <Logo variant="light" />
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 flex size-10 items-center justify-center rounded-[10px] text-white hover:bg-white/10"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 bg-ink/50 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-30 w-[272px] max-w-[85vw] flex-col overflow-y-auto bg-ink pt-14 lg:flex lg:w-64 lg:pt-0 ${open ? "flex" : "hidden"}`}
      >
        <div className="hidden px-5 pb-5 pt-6 lg:block">
          <Link href="/dashboard" aria-label="LekkerWerk dashboard">
            <Logo variant="light" />
          </Link>
        </div>
        <div className="mx-3 mb-5 mt-4 flex items-center gap-2.5 rounded-[12px] border border-white/10 bg-white/5 px-3 py-2.5 lg:mt-0">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-brand-green/15 text-xs font-bold uppercase text-brand-green">
            {companyName.trim().charAt(0) || "?"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-white">{companyName}</span>
            <span className="block text-[11px] text-white/45">Workspace</span>
          </span>
        </div>
        {nav}
      </aside>
    </>
  );
}
