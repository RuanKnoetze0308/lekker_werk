import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] font-bold leading-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
  flush,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  flush?: boolean;
}) {
  return (
    <section className={`rounded-[20px] border border-border bg-white ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const color = { default: "text-ink", good: "text-dark-green", warn: "text-amber-600", bad: "text-red-600" }[tone];
  return (
    <div className="rounded-[20px] border border-border bg-white p-5">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <p className={`mt-2 font-display text-[32px] font-bold leading-none ${color}`}>{value}</p>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const BADGE_TONES = {
  green: "bg-pale-green text-dark-green",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-soft-surface text-muted",
  blue: "bg-blue-50 text-blue-700",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof BADGE_TONES {
  switch (status) {
    case "ACTIVE":
    case "PRESENT":
    case "ACCEPTED":
    case "SUCCEEDED":
      return "green";
    case "LATE":
    case "INCOMPLETE":
    case "QUEUED":
    case "RUNNING":
      return "amber";
    case "INACTIVE":
    case "ABSENT":
    case "REJECTED":
    case "FAILED":
      return "red";
    default:
      return "gray";
  }
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">{children}</table>
    </div>
  );
}

export const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th className={`border-b border-border bg-soft-surface/60 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted ${className}`}>
    {children}
  </th>
);

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`border-b border-border/70 px-4 py-3 align-middle text-ink ${className}`}>{children}</td>
);

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Server-rendered pagination that preserves the current filters. */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const btn = "inline-flex size-8 items-center justify-center rounded-lg border border-border bg-white text-muted hover:text-ink";
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted">
      <span>
        Page {page} of {pages} · {total} total
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn} aria-label="Previous page"><ChevronLeft className="size-4" /></Link>
        ) : null}
        {page < pages ? (
          <Link href={href(page + 1)} className={btn} aria-label="Next page"><ChevronRight className="size-4" /></Link>
        ) : null}
      </div>
    </div>
  );
}

/** GET-based filter bar: works without client JS and keeps URLs shareable. */
export function FilterBar({ children, action }: { children: ReactNode; action: string }) {
  return (
    <form action={action} className="mb-5 flex flex-wrap items-end gap-3 rounded-[20px] border border-border bg-white p-4">
      {children}
      <button type="submit" className="rounded-[12px] bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink/85">
        Apply
      </button>
    </form>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

export const filterControl =
  "rounded-[12px] border border-border bg-white px-3 py-2 text-sm text-ink outline-none focus:border-dark-green";
