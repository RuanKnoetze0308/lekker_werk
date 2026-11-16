"use client";

import { useRouter } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";

interface Notice {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  COMPANY_ADMIN: "Company admin",
  MANAGER: "Manager",
  EMPLOYEE: "Employee",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function Topbar({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<Notice[]>("/api/notifications").then(setItems).catch(() => {});
  }, []);

  // Close the notification panel on Escape or a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  const unread = items.filter((n) => !n.readAt).length;

  async function toggle() {
    const opening = !open;
    setOpen(opening);
    if (opening && unread) {
      await api("/api/notifications", { method: "POST" }).catch(() => {});
      setItems((p) => p.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    }
  }

  async function logout() {
    setLoggingOut(true);
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.push("/");
    router.refresh();
  }

  return (
    <div className="sticky top-14 z-20 flex items-center justify-end gap-2 border-b border-border bg-white/90 px-4 py-2.5 backdrop-blur sm:gap-3 sm:px-5 lg:top-0 lg:px-8">
      <div className="relative" ref={panel}>
        <button
          type="button"
          onClick={toggle}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          aria-expanded={open}
          className="relative flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-soft-surface hover:text-ink"
        >
          <Bell className="size-[18px]" aria-hidden />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-[16px] border border-border bg-white shadow-xl">
            <p className="border-b border-border px-4 py-3 text-sm font-semibold">Notifications</p>
            <ul className="max-h-80 overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You&rsquo;re all caught up.</li>}
              {items.map((n) => (
                <li key={n.id} className="border-b border-border/60 px-4 py-3 last:border-0">
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-muted/80">{ago(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-pale-green text-xs font-bold text-dark-green" aria-hidden>
          {initials(name)}
        </span>
        <div className="hidden min-w-0 leading-tight sm:block">
          <p className="truncate text-sm font-semibold text-ink">{name}</p>
          <p className="text-xs text-muted">{ROLE_LABEL[role] ?? role}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={logout}
        disabled={loggingOut}
        className="flex h-10 items-center gap-1.5 rounded-[12px] border border-border px-3 text-sm font-medium text-muted transition-colors hover:border-ink/30 hover:text-ink disabled:opacity-60"
      >
        <LogOut className="size-4" aria-hidden />
        <span className="hidden sm:inline">Log out</span>
        <span className="sr-only sm:hidden">Log out</span>
      </button>
    </div>
  );
}
