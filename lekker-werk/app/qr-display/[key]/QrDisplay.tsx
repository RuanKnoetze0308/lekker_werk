"use client";

import { useEffect, useRef, useState } from "react";

type Frame =
  | { active: false; label: string; locationName: string }
  | {
      active: true;
      label: string;
      locationName: string;
      svg: string;
      rotatesAt: number;
      rotationSeconds: number;
      serverNow: number;
    };

/** Shows the current QR, counts down to the next rotation, then fetches the new one. */
export function QrDisplay({ displayKey, initial }: { displayKey: string; initial: Frame }) {
  const [frame, setFrame] = useState(initial);
  const [offline, setOffline] = useState(false);
  // Server time as seen by this screen (corrected for its clock being off), ticked by an interval.
  const [now, setNow] = useState(initial.active ? initial.serverNow : 0);
  // server clock minus this screen's clock
  const skew = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/qr-display/${displayKey}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const { data } = (await res.json()) as { data: Frame };
        if (cancelled) return;
        if (data.active) skew.current = data.serverNow - Date.now();
        setFrame(data);
        setOffline(false);
        schedule(data);
      } catch {
        if (cancelled) return;
        setOffline(true);
        timer = setTimeout(load, 5000);
      }
    }

    function schedule(f: Frame) {
      // Inactive codes are re-checked every minute so re-enabling shows up without a reload.
      const wait = f.active ? Math.max(500, f.rotatesAt - (Date.now() + skew.current) + 300) : 60_000;
      timer = setTimeout(load, wait);
    }

    if (initial.active) skew.current = initial.serverNow - Date.now();
    schedule(initial);
    const tick = setInterval(() => setNow(Date.now() + skew.current), 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [displayKey, initial]);

  const remaining = frame.active ? Math.max(0, frame.rotatesAt - now) : 0;
  const pct = frame.active ? Math.min(100, (remaining / (frame.rotationSeconds * 1000)) * 100) : 0;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-white px-4 py-8 text-center">
      <p className="font-display text-3xl font-bold text-ink sm:text-5xl">Scan to clock in</p>
      {frame.active ? (
        <>
          <div
            className="w-full max-w-[min(80vh,560px)] rounded-[24px] border-2 border-ink p-3 [&>svg]:h-auto [&>svg]:w-full"
            // SVG is generated server-side by the qrcode library from our own URL.
            dangerouslySetInnerHTML={{ __html: frame.svg }}
          />
          <div className="w-full max-w-[min(80vh,560px)]">
            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-brand-green transition-[width] duration-200 ease-linear" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted">New code in {Math.ceil(remaining / 1000)}s</p>
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-red-700">This QR code is disabled. Ask a manager to enable it.</p>
      )}
      <div>
        <p className="text-xl font-semibold text-ink sm:text-2xl">{frame.locationName}</p>
        <p className="text-muted">{frame.label}</p>
      </div>
      {offline && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Connection lost. Retrying…</p>}
    </main>
  );
}
