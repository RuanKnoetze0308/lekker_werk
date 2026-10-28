"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

export function LoginForm({ onSwitch }: { onSwitch: (m: "signup" | "forgot") => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accounts with two-step login: the password was right, now the authenticator code.
  const [twoStep, setTwoStep] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = twoStep
        ? await api<{ redirect: string }>("/api/auth/two-step", { body: { code: form.get("code") } })
        : await api<{ redirect?: string; twoStep?: boolean }>("/api/auth/login", {
            body: { identifier: form.get("identifier"), password: form.get("password") },
          });
      if ("twoStep" in res && res.twoStep) {
        setTwoStep(true);
        setPending(false);
        return;
      }
      router.push(res.redirect ?? "/dashboard");
      router.refresh();
    } catch (err) {
      // 401 on the code step = the challenge expired: start again from the password.
      if (err instanceof ApiError && err.status === 401 && twoStep) setTwoStep(false);
      setError(err instanceof ApiError ? err.message : "Could not log in.");
      setPending(false);
    }
  }

  if (twoStep) {
    return (
      // Own key: otherwise React reuses the password input for the code field and shows the password.
      <form key="two-step" onSubmit={onSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted">Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>
        <Field label="Code">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required />
        </Field>
        <FormMessage error={error} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Checking…" : "Continue"}
        </Button>
        <button type="button" onClick={() => { setTwoStep(false); setError(null); }} className="text-sm text-muted hover:text-ink">
          Back
        </button>
      </form>
    );
  }

  return (
    <form key="password" onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Username or email">
        <Input name="identifier" autoComplete="username" required />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <FormMessage error={error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={() => onSwitch("forgot")} className="font-medium text-dark-green hover:underline">
          Forgot password?
        </button>
        <button type="button" onClick={() => onSwitch("signup")} className="text-muted hover:text-ink">
          New here? <span className="font-medium text-dark-green">Sign up</span>
        </button>
      </div>
    </form>
  );
}
