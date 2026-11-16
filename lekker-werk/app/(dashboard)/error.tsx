"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Shown inside the dashboard shell when a page fails, so the menu stays usable. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[LekkerWerk page error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-bold text-ink">This page didn&rsquo;t load</h1>
      <p className="text-sm text-muted">
        Something went wrong on our side. Your data is safe. Try again, and if it keeps happening send us the reference below.
      </p>
      {error.digest && <p className="rounded-[10px] bg-soft-surface px-3 py-1.5 font-mono text-xs text-muted">ref {error.digest}</p>}
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button href="/dashboard" variant="secondary-light">Back to the dashboard</Button>
      </div>
    </div>
  );
}
