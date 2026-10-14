import { requirePageContext } from "@/server/auth/guards";
import { getQrAsset } from "@/server/services/qr.service";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Print QR code · LekkerWerk" };

export default async function PrintQrPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageContext("qr:manage");
  const { id } = await params;
  const asset = await getQrAsset(ctx, id);

  if (asset.mode === "DYNAMIC") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <p className="font-display text-2xl font-bold text-ink">This is a dynamic QR code</p>
        <p className="text-muted">It changes every few seconds, so a printed copy would stop working. Use “Open display screen” on the QR codes page and show it on a tablet or TV instead.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <p className="font-display text-3xl font-bold text-ink">Clock in with LekkerWerk</p>
      <div
        className="w-full max-w-[340px] rounded-[24px] border-2 border-ink p-4 [&>svg]:h-auto [&>svg]:w-full"
        // SVG is generated server-side by the qrcode library from our own URL.
        dangerouslySetInnerHTML={{ __html: asset.svg }}
      />
      <div>
        <p className="text-xl font-semibold text-ink">{asset.locationName}</p>
        <p className="text-muted">{asset.label}</p>
        <p className="mt-3 text-sm text-muted">Scan with your phone camera, then choose Clock in or Clock out in the chat.</p>
      </div>
      {!asset.enabled && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">This code is disabled and will not work.</p>}
      <PrintButton />
    </main>
  );
}
