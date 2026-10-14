import { notFound } from "next/navigation";
import { getDisplayFrame } from "@/server/services/qr.service";
import { QrDisplay } from "./QrDisplay";

export const metadata = { title: "Clock in · LekkerWerk", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Full-screen rotating QR for a tablet / TV at the entrance. Opened without logging in. */
export default async function QrDisplayPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const frame = await getDisplayFrame(key);
  if (!frame) notFound();
  return <QrDisplay displayKey={key} initial={frame} />;
}
