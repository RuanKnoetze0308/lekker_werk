"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Badge, Card } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

type Setup = { secret: string; qrSvg: string };

export function TwoStepPanel({ enabled, backupCodesLeft }: { enabled: boolean; backupCodesLeft: number }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run<T>(fn: () => Promise<T>) {
    setPending(true);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  if (backupCodes) {
    return (
      <Card title="Two-step login is on">
        <p className="text-sm text-muted">
          Save these backup codes somewhere safe (a password manager). Each one works once if you lose your phone.
          They won&rsquo;t be shown again.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm sm:max-w-sm">
          {backupCodes.map((c) => (
            <li key={c} className="rounded-lg bg-soft-surface px-3 py-2 text-center">{c}</li>
          ))}
        </ul>
        <Button className="mt-5" onClick={() => { setBackupCodes(null); router.refresh(); }}>I&rsquo;ve saved them</Button>
      </Card>
    );
  }

  if (enabled) {
    return (
      <Card title="Two-step login" action={<Badge tone="green">On</Badge>}>
        <p className="text-sm text-muted">
          {backupCodesLeft} backup code{backupCodesLeft === 1 ? "" : "s"} left. To move to a new phone, turn it off and set it up again.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const code = String(new FormData(e.currentTarget).get("code") ?? "");
            run(async () => {
              await api("/api/system/two-step/disable", { body: { code } });
              router.refresh();
            });
          }}
        >
          <Field label="Code from your app (or a backup code)">
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" required />
          </Field>
          <FormMessage error={error} />
          <Button type="submit" variant="danger" disabled={pending} icon={<ShieldOff className="size-4" />}>
            {pending ? "Turning off…" : "Turn off two-step login"}
          </Button>
        </form>
      </Card>
    );
  }

  if (setup) {
    return (
      <Card title="Set up two-step login">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Open your authenticator app and add an account.</li>
          <li>Scan this QR code, or type the key below.</li>
          <li>Enter the 6-digit code the app shows.</li>
        </ol>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start">
          {/* SVG generated server-side by the qrcode library from our own otpauth:// URL. */}
          <div className="size-48 shrink-0 rounded-xl border border-border bg-white p-2" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
          <div className="min-w-0 text-sm">
            <p className="text-muted">Key</p>
            <p className="break-all font-mono text-ink">{setup.secret.match(/.{1,4}/g)?.join(" ")}</p>
          </div>
        </div>
        <form
          className="mt-5 flex flex-col gap-3 sm:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            const code = String(new FormData(e.currentTarget).get("code") ?? "");
            run(async () => {
              const res = await api<{ backupCodes: string[] }>("/api/system/two-step/enable", { body: { code } });
              setSetup(null);
              setBackupCodes(res.backupCodes);
            });
          }}
        >
          <Field label="6-digit code">
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required />
          </Field>
          <FormMessage error={error} />
          <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Turn on"}</Button>
        </form>
      </Card>
    );
  }

  return (
    <Card title="Two-step login" action={<Badge>Off</Badge>}>
      <p className="text-sm text-muted">Recommended: if your password is ever stolen, nobody can sign in without your phone.</p>
      <FormMessage error={error} />
      <Button
        className="mt-4"
        disabled={pending}
        icon={<ShieldCheck className="size-4" />}
        onClick={() => run(async () => setSetup(await api<Setup>("/api/system/two-step", { method: "POST" })))}
      >
        {pending ? "Starting…" : "Set up two-step login"}
      </Button>
    </Card>
  );
}
