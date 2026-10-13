import type { ReactNode } from "react";
import { AuthModalProvider } from "./_auth/AuthModalProvider";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return <AuthModalProvider>{children}</AuthModalProvider>;
}
