import type { Metadata } from "next";
import localFont from "next/font/local";
import { connection } from "next/server";
import "./globals.css";

// Self-hosted (latin subset of the Google Fonts files) so builds never depend on fonts.google.com.
const inter = localFont({
  src: "./fonts/Inter-latin.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk-latin.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700",
  display: "swap",
});

const caveat = localFont({
  src: "./fonts/Caveat-600-latin.woff2",
  variable: "--font-caveat",
  weight: "600",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LekkerWerk — Clock in. Lekker simple.",
  description:
    "Attendance and time tracking for your team, right from WhatsApp or Telegram.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Render every page per request: the CSP nonce (proxy.ts) can only be put on scripts at request
  // time. A page prerendered at build time would have no nonce, and its scripts would be blocked.
  await connection();
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
