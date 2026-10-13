"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";
import { passwordSchema } from "@/lib/schemas/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!token) return <p className="mt-4 text-sm text-red-700">This reset link is missing its token. Request a new one from the login screen.</p>;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get("password"));
    const check = passwordSchema.safeParse(password);
    if (!check.success) return setError(check.error.issues[0].message);
    setPending(true);
    setError(null);
    try {
      await api("/api/auth/reset", { body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset your password.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="mt-4 flex flex-col gap-4">
        <FormMessage success="Password updated. You can now log in." />
        <Link href="/#login" className="text-sm font-medium text-dark-green hover:underline">Go to login →</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
      <Field label="New password" hint="10+ characters with upper, lower and a number">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <FormMessage error={error} />
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Update password"}</Button>
    </form>
  );
}
