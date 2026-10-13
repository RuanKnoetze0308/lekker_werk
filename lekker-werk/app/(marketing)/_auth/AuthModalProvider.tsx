"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { LoginForm } from "./LoginForm";
import { ForgotForm } from "./ForgotForm";
import { SignupWizard } from "./SignupWizard";

type Mode = "login" | "signup" | "forgot" | null;

const AuthModalContext = createContext<{ open: (mode: Exclude<Mode, null>) => void } | null>(null);

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error("useAuthModal must be used inside AuthModalProvider");
  return ctx;
}

const TITLES = { login: "Log in", signup: "Create your account", forgot: "Reset your password" } as const;

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode>(null);
  const close = useCallback(() => setMode(null), []);

  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash;
      if (h === "#login" || h === "#signup") {
        setMode(h.slice(1) as Mode);
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);

    // next/link does not fire hashchange for same-page hashes, so intercept those clicks directly.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href='#login'], a[href='#signup']");
      if (!a) return;
      e.preventDefault();
      setMode(a.getAttribute("href")!.slice(1) as Mode);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("hashchange", fromHash);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  const value = useMemo(() => ({ open: (m: Exclude<Mode, null>) => setMode(m) }), []);

  return (
    <AuthModalContext.Provider value={value}>
      {children}
      <Modal open={mode !== null} onClose={close} title={mode ? TITLES[mode] : ""} wide={mode === "signup"}>
        {mode === "login" && <LoginForm onSwitch={setMode} />}
        {mode === "forgot" && <ForgotForm onSwitch={setMode} />}
        {mode === "signup" && <SignupWizard onSwitch={setMode} />}
      </Modal>
    </AuthModalContext.Provider>
  );
}
