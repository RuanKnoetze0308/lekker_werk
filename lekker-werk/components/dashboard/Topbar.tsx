"use client";

import { useRouter } from "next/navigation";
import { Bell, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";

interface Notice {
  id: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export function Topbar({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);

  useEffect(() => {
    api<Notice[]>("/api/notifications").then(setItems).catch(() => {});
  }, []);

  const unread = items.filter((n) => !n.readAt).length;

  async function toggle() {
    setOpen((v) => !v);
    if (!open && unread) {
      await api("/api/notifications", { method: "POST" }).catch(() => {});
      setItems((p) => p.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {});
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative flex items-center justify-end gap-3 border-b border-border bg-white px-5 py-3 lg:px-8">
      <div className="relative">
        <button
          type="button"
          onClick={toggle}
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
          className="relative flex size-9 items-center justify-center rounded-full text-muted hover:bg-soft-surface hover:text-ink"
        >
          <Bell className="size-[18px]" aria-hidden />
          {unread > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-red-500" />}
        </button>
        {open && (
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-[16px] border border-border bg-white shadow-xl">
            <p className="border-b border-border px-4 py-3 text-sm font-semibold">Notifications</p>
            <ul className="max-h-80 overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">You&rsquo;re all caught up.</li>}
              {items.map((n) => (
                <li key={n.id} className="border-b border-border/60 px-4 py-3 last:border-0">
                  <p className="text-sm font-medium text-ink">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted">{n.body}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="text-right leading-tight">
        <p className="text-sm font-semibold text-ink">{name}</p>
        <p className="text-xs capitalize text-muted">{role.toLowerCase().replace("_", " ")}</p>
      </div>
      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <LogOut className="size-4" aria-hidden /> Log out
      </button>
    </div>
  );
}
