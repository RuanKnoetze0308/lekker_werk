"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage, Input, Select, Toggle } from "@/components/ui/form";
import { Badge } from "@/components/dashboard/ui";
import { api, ApiError } from "@/lib/api-client";

interface State {
  enabled: boolean;
  configured: boolean;
  mode: "webhook" | "polling" | "shared" | "dedicated" | null;
  botLink: string | null;
  publicHandle: string | null;
  phoneNumberId: string | null;
  webhookUrl: string;
}

export function ChannelForm({ channel, state }: { channel: "TELEGRAM" | "WHATSAPP"; state: State }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(state.enabled);
  const [secret, setSecret] = useState("");
  const [phoneId, setPhoneId] = useState(state.phoneNumberId ?? "");
  const [waMode, setWaMode] = useState<"SHARED" | "DEDICATED">(state.mode === "dedicated" ? "DEDICATED" : "SHARED");
  const [display, setDisplay] = useState(state.publicHandle ?? "");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ error?: string; success?: string }>({});

  async function save() {
    setPending(true);
    setMsg({});
    try {
      const body =
        channel === "TELEGRAM"
          ? { channel, enabled, botToken: secret || undefined }
          : waMode === "SHARED"
            ? { channel, enabled, mode: waMode }
            : { channel, enabled, mode: waMode, phoneNumberId: phoneId || undefined, displayNumber: display || undefined, accessToken: secret || undefined };
      await api("/api/settings/channels", { method: "PUT", body });
      setSecret("");
      setMsg({ success: channel === "TELEGRAM" && secret ? "Bot connected." : "Saved." });
      router.refresh();
    } catch (err) {
      setMsg({ error: err instanceof ApiError ? err.message : "Could not save." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Enabled</span>
        <div className="flex items-center gap-3">
          <Badge tone={state.configured ? "green" : "amber"}>{state.configured ? "credentials saved" : "not configured"}</Badge>
          <Toggle checked={enabled} onChange={setEnabled} label={`${channel} enabled`} />
        </div>
      </div>

      {channel === "TELEGRAM" ? (
        <>
          {state.botLink ? (
            <div className="flex flex-col gap-2 rounded-[14px] bg-pale-green p-4 text-sm">
              <p>
                Connected bot:{" "}
                <a href={state.botLink} target="_blank" rel="noreferrer" className="font-semibold text-dark-green underline">
                  @{state.publicHandle?.replace(/^@/, "")}
                </a>
              </p>
              {state.mode === "polling" ? (
                <p className="text-muted">
                  <b className="text-ink">Local testing mode.</b> Telegram can&rsquo;t reach this computer, so run{" "}
                  <code className="rounded bg-white px-1.5 py-0.5 text-ink">npm run telegram:poll</code> in the project
                  folder to receive messages. Once the app is online (https), save the token again to switch to live webhooks.
                </p>
              ) : (
                <p className="text-muted">Live: Telegram delivers messages straight to LekkerWerk.</p>
              )}
              <p className="text-muted">
                Staff link their chat from their profile (Employees → employee → Generate link code), then scan the QR code at
                work to clock in.
              </p>
            </div>
          ) : (
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-muted">
              <li>
                Open{" "}
                <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="font-semibold text-dark-green underline">
                  @BotFather
                </a>{" "}
                in Telegram and send <b className="text-ink">/newbot</b>.
              </li>
              <li>Give it your company name, then a username ending in <b className="text-ink">bot</b> (e.g. acme_clock_bot).</li>
              <li>BotFather replies with a token. Paste it below and save. We set up the bot&rsquo;s menu and description for you.</li>
            </ol>
          )}
          <Field label={state.configured ? "Replace bot token" : "Bot token"} hint="Stored encrypted. Never shown again.">
            <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={state.configured ? "••••••••" : "123456789:AAH…"} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Which number do employees message?">
            <Select value={waMode} onChange={(e) => setWaMode(e.target.value as "SHARED" | "DEDICATED")}>
              <option value="SHARED">The LekkerWerk number (no setup needed)</option>
              <option value="DEDICATED">Our own WhatsApp Business number</option>
            </Select>
          </Field>
          {waMode === "SHARED" ? (
            <p className="text-sm text-muted">
              {state.publicHandle && state.configured ? (
                <>Employees message <b className="text-ink">+{state.publicHandle}</b>. Your QR codes and link codes point there automatically.</>
              ) : (
                <>The shared LekkerWerk WhatsApp number is being approved by Meta. Switch it on now and it starts working as soon as it&rsquo;s live.</>
              )}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Uses your own WhatsApp Business Cloud API number. In Meta&rsquo;s developer console, point the webhook to the URL below and subscribe to <b>messages</b>.
              </p>
              <Field label="Phone number ID"><Input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} /></Field>
              <Field label="Display number" hint="International format, used for QR click-to-chat links"><Input value={display} onChange={(e) => setDisplay(e.target.value)} placeholder="27821234567" /></Field>
              <Field label="Access token" hint="Stored encrypted. Never shown again.">
                <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={state.configured ? "••••••••" : ""} />
              </Field>
              <Field label="Webhook URL"><Input readOnly value={state.webhookUrl} onFocus={(e) => e.currentTarget.select()} /></Field>
            </>
          )}
        </>
      )}
      <FormMessage error={msg.error} success={msg.success} />
      <Button onClick={save} disabled={pending} className="w-fit">{pending ? "Saving…" : "Save"}</Button>
    </div>
  );
}
