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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
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
    <section className={`overflow-hidden rounded-[20px] border border-border bg-white shadow-[0_1px_2px_rgba(7,19,20,0.04)] ${className}`}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3.5 sm:px-5">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {action}
        </header>
      )}
      <div className={flush ? "" : "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

const STAT_TONES = {
  default: "bg-soft-surface text-muted",
  good: "bg-pale-green text-dark-green",
  warn: "bg-amber-50 text-amber-600",
  bad: "bg-red-50 text-red-600",
} as const;

/**
 * A headline number. The number stays in ink; the tone only colours the icon chip, so a page of
 * tiles reads calmly and colour is left to mean "look here".
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  href,
  children,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: keyof typeof STAT_TONES;
  icon?: ReactNode;
  href?: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon && <span className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] ${STAT_TONES[tone]}`}>{icon}</span>}
      </div>
      <p className="mt-1.5 font-display text-[28px] font-bold leading-none tracking-tight text-ink sm:text-[30px]">{value}</p>
      {children}
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </>
  );
  const box = "block rounded-[20px] border border-border bg-white p-4 shadow-[0_1px_2px_rgba(7,19,20,0.04)] sm:p-5";
  return href ? (
    <Link href={href} className={`${box} transition-colors hover:border-dark-green/50`}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** Thin progress meter (value out of max). Purely visual: put the numbers in text next to it. */
export function Meter({ value, max, tone = "green" }: { value: number; max: number; tone?: "green" | "amber" | "red" }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = { green: "bg-dark-green", amber: "bg-amber-500", red: "bg-red-500" }[tone];
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-soft-surface" aria-hidden>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Initials in a circle, for people lists. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const text = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-pale-green font-bold text-dark-green ${size === "sm" ? "size-7 text-[10px]" : "size-9 text-xs"}`}
    >
      {text}
    </span>
  );
}

/** Small uppercase heading above a group of cards. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
      {action}
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
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold first-letter:uppercase ${BADGE_TONES[tone]}`}>
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
      <table className="w-full min-w-[640px] text-left text-sm [&_tbody_tr:hover]:bg-soft-surface/60 [&_tbody_tr:last-child_td]:border-b-0">{children}</table>
    </div>
  );
}

export const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th className={`whitespace-nowrap border-b border-border bg-soft-surface/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted ${className}`}>
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
    <form
      action={action}
      className="mb-5 grid grid-cols-2 items-end gap-3 rounded-[20px] border border-border bg-white p-3.5 shadow-[0_1px_2px_rgba(7,19,20,0.04)] sm:flex sm:flex-wrap sm:p-4"
    >
      {children}
      <button type="submit" className="h-[38px] rounded-[12px] bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-ink/85">
        Apply
      </button>
    </form>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
      {label}
      {children}
    </label>
  );
}

export const filterControl =
  "h-[38px] w-full min-w-0 rounded-[12px] border border-border bg-white px-3 text-sm text-ink outline-none transition-colors focus:border-dark-green focus:ring-2 focus:ring-brand-green/30 sm:w-auto";
