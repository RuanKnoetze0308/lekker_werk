import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export const metadata = { title: "Page not found · LekkerWerk" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-soft-surface px-5 text-center">
      <Logo />
      <h1 className="mt-4 font-display text-3xl font-bold text-ink">Page not found</h1>
      <p className="max-w-sm text-sm text-muted">The page you&rsquo;re looking for doesn&rsquo;t exist or has moved.</p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center justify-center rounded-[13px] bg-brand-green px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-dark-green hover:text-white"
      >
        Go to the homepage
      </Link>
    </main>
  );
}
