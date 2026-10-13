"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

export function ForgotForm({ onSwitch }: { onSwitch: (m: "login") => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = new FormData(e.currentTarget).get("email");
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/forgot", { body: { email } });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <FormMessage success="If that email has an account, a reset link is on its way." />
        <Button variant="secondary-light" onClick={() => onSwitch("login")}>Back to log in</Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-sm text-muted">Enter your email and we&rsquo;ll send you a link to choose a new password.</p>
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <FormMessage error={error} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
      <button type="button" onClick={() => onSwitch("login")} className="text-sm text-muted hover:text-ink">
        Back to log in
      </button>
    </form>
  );
}
