"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { FormMessage, Select } from "@/components/ui/form";
import { Badge } from "@/components/dashboard/ui";
import { api, ApiError } from "@/lib/api-client";

interface Account {
  id: string;
  channel: string;
  displayName: string | null;
  verified: boolean;
  revoked: boolean;
}

export function LinkAccountPanel({
  employeeId,
  accounts,
  canManage,
  defaultChannel,
}: {
  employeeId: string;
  accounts: Account[];
  canManage: boolean;
  defaultChannel: string;
}) {
  const router = useRouter();
  const [channel, setChannel] = useState(defaultChannel);
  const [result, setResult] = useState<{ code: string; link: string | null; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      setResult(await api(`/api/employees/${employeeId}/link-code`, { body: { channel } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create a code.");
    } finally {
      setPending(false);
    }
  }

  async function revoke(accountId: string) {
    if (!confirm("Unlink this chat account? The employee will need a new code to clock again.")) return;
    await api(`/api/employees/${employeeId}/link-code`, { method: "DELETE", body: { accountId } });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {accounts.length === 0 ? (
        <p className="text-sm text-muted">Not linked to WhatsApp or Telegram yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="capitalize">{a.channel.toLowerCase()} {a.displayName && <span className="text-muted">· {a.displayName}</span>}</span>
              <span className="flex items-center gap-2">
                <Badge tone={a.revoked ? "red" : a.verified ? "green" : "amber"}>{a.revoked ? "unlinked" : a.verified ? "linked" : "pending"}</Badge>
                {canManage && !a.revoked && (
                  <button type="button" onClick={() => revoke(a.id)} className="text-xs text-red-600 hover:underline">Unlink</button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <Select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Channel">
            <option value="WHATSAPP">WhatsApp</option>
            <option value="TELEGRAM">Telegram</option>
          </Select>
          <Button variant="secondary-light" size="sm" onClick={generate} disabled={pending}>
            Generate link code
          </Button>
          <FormMessage error={error} />
          {result && (
            <div className="rounded-[12px] bg-pale-green p-3 text-sm">
              <p className="font-semibold tracking-widest text-ink">{result.code}</p>
              <p className="mt-1 text-xs text-muted">
                Employee sends <b>LINK {result.code}</b> to the company {channel.toLowerCase()} chat. Valid 24 hours, single use.
              </p>
              {result.link && (
                <a href={result.link} className="mt-2 block break-all text-xs font-medium text-dark-green underline">
                  {result.link}
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
