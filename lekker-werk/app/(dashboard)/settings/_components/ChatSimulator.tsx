"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { FormMessage, Input, Select } from "@/components/ui/form";
import { api, ApiError } from "@/lib/api-client";

interface Reply {
  text: string;
  buttons?: { id: string; label: string }[];
  requestLocation?: boolean;
}
type Line = { from: "me"; text: string } | { from: "bot"; reply: Reply };

interface Props {
  employees: { id: string; name: string }[];
  qrCodes: { id: string; label: string; locationName: string; latitude: number | null; longitude: number | null }[];
}

/**
 * Talks to the real conversation pipeline (link codes, QR deep links, menus, clocking engine)
 * with a fake transport, so the full Telegram / WhatsApp flow can be tried without a bot or a
 * public URL. Everything it does is written to the database like a real chat.
 */
export function ChatSimulator({ employees, qrCodes }: Props) {
  const [channel, setChannel] = useState<"TELEGRAM" | "WHATSAPP">("TELEGRAM");
  const [chatId, setChatId] = useState("sim-phone-1");
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [linkEmp, setLinkEmp] = useState(employees[0]?.id ?? "");
  const [qrId, setQrId] = useState(qrCodes[0]?.id ?? "");
  const [lastQr, setLastQr] = useState<Props["qrCodes"][number] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Newer browsers return a Promise here; an effect must not return it.
    void bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [lines]);

  async function send(payload: Record<string, unknown>, shown?: string) {
    setPending(true);
    setError(null);
    try {
      const res = await api<{ sent: string; replies: Reply[] }>("/api/dev/chat-simulator", {
        body: { channel, externalId: chatId, displayName: "Simulator", ...payload },
      });
      setLines((l) => [...l, { from: "me", text: shown ?? res.sent }, ...res.replies.map((r) => ({ from: "bot" as const, reply: r }))]);
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fieldErrors)[0] ?? err.message) : "Simulator error.");
    } finally {
      setPending(false);
    }
  }

  const lastBot = [...lines].reverse().find((l): l is Extract<Line, { from: "bot" }> => l.from === "bot");
  const wantsLocation = lastBot?.reply.requestLocation;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-h-[420px] flex-col overflow-hidden rounded-[18px] border border-border bg-soft-surface">
        <div className="flex items-center justify-between border-b border-border bg-white px-4 py-2.5 text-sm">
          <span className="font-semibold">{channel === "TELEGRAM" ? "Telegram" : "WhatsApp"} · {chatId}</span>
          <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => setLines([])}>Clear</button>
        </div>
        <div className="flex max-h-[460px] flex-1 flex-col gap-2 overflow-y-auto p-4">
          {lines.length === 0 && (
            <p className="m-auto max-w-xs text-center text-sm text-muted">
              Start by linking this chat to an employee, then scan a QR code and tap Clock in.
            </p>
          )}
          {lines.map((l, i) =>
            l.from === "me" ? (
              <div key={i} className="ml-auto max-w-[80%] rounded-[14px] rounded-br-[4px] bg-brand-green px-3 py-2 text-sm text-ink">
                {l.text}
              </div>
            ) : (
              <div key={i} className="max-w-[85%]">
                <div className="whitespace-pre-line rounded-[14px] rounded-bl-[4px] bg-white px-3 py-2 text-sm text-ink shadow-sm">
                  {l.reply.text}
                </div>
                {l.reply.buttons && l.reply.buttons.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {l.reply.buttons.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        disabled={pending || i !== lines.length - 1}
                        onClick={() => send({ text: b.id }, b.label)}
                        className="rounded-[10px] border border-border bg-white px-3 py-1.5 text-xs font-semibold text-dark-green hover:border-dark-green disabled:opacity-40"
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ),
          )}
          <div ref={bottom} />
        </div>
        <form
          className="flex gap-2 border-t border-border bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send({ text: text.trim() });
            setText("");
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message (MENU, IN, OUT, HOURS…)" />
          <Button type="submit" size="sm" disabled={pending || !text.trim()}>Send</Button>
        </form>
      </div>

      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Channel</span>
          <Select value={channel} onChange={(e) => { setChannel(e.target.value as "TELEGRAM" | "WHATSAPP"); setLines([]); }}>
            <option value="TELEGRAM">Telegram</option>
            <option value="WHATSAPP">WhatsApp</option>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Phone / chat</span>
          <Input value={chatId} onChange={(e) => { setChatId(e.target.value.toLowerCase()); setLines([]); }} />
          <span className="text-xs text-muted">Each id is a different phone. Must start with sim-.</span>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border pt-4">
          <span className="text-[13px] font-medium">1. Link this phone to</span>
          <Select value={linkEmp} onChange={(e) => setLinkEmp(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
          <Button size="sm" variant="secondary-light" disabled={pending || !linkEmp} onClick={() => send({ linkEmployeeId: linkEmp })}>
            Send link code
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">2. Scan QR code</span>
          <Select value={qrId} onChange={(e) => setQrId(e.target.value)}>
            {qrCodes.map((q) => <option key={q.id} value={q.id}>{q.locationName} · {q.label}</option>)}
          </Select>
          <Button
            size="sm"
            variant="secondary-light"
            disabled={pending || !qrId}
            onClick={() => {
              setLastQr(qrCodes.find((q) => q.id === qrId) ?? null);
              send({ scanQrId: qrId });
            }}
          >
            Scan
          </Button>
          {qrCodes.length === 0 && <span className="text-xs text-muted">Create a QR code under QR Codes first.</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">3. Share location</span>
          <Button
            size="sm"
            variant={wantsLocation ? "primary" : "secondary-light"}
            disabled={pending || lastQr?.latitude == null || lastQr?.longitude == null}
            onClick={() => send({ location: { latitude: lastQr!.latitude, longitude: lastQr!.longitude } }, "📍 Location")}
          >
            Share on-site location
          </Button>
          <span className="text-xs text-muted">Only needed when GPS validation is on. Uses the scanned site&rsquo;s position.</span>
        </div>
        <FormMessage error={error} />
      </div>
    </div>
  );
}
