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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const { redirect } = await api<{ redirect: string }>("/api/auth/login", {
        body: { identifier: form.get("identifier"), password: form.get("password") },
      });
      router.push(redirect);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
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
