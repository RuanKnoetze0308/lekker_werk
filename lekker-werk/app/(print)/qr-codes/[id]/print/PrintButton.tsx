"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-[13px] bg-brand-green px-5 py-3 text-sm font-semibold text-ink hover:bg-dark-green hover:text-white print:hidden"
    >
      <Printer className="size-4" aria-hidden /> Print
    </button>
  );
}
