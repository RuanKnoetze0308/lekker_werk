import type { Metadata } from "next";
import localFont from "next/font/local";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
