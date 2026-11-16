import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function DashboardNotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-pale-green text-dark-green">
        <SearchX className="size-6" aria-hidden />
      </span>
      <h1 className="font-display text-2xl font-bold text-ink">We couldn&rsquo;t find that</h1>
      <p className="text-sm text-muted">
        It may have been removed, or the link is out of date. Nothing is wrong with your account.
      </p>
      <div className="mt-2">
        <Button href="/dashboard">Back to the dashboard</Button>
      </div>
    </div>
  );
}
