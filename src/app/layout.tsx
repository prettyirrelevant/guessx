import { Syne, DM_Mono } from "next/font/google";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";

import { Footer } from "@/components/footer";
import { ConvexClientProvider } from "@/components/convex-client-provider";

import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-syne",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000",
  ),
  icons: {
    icon: "/logo.svg",
  },
  title: "guessX — the multiplayer guessing game",
  description:
    "challenge your friends in real-time. guess songs, landmarks, actors, or flags. fastest finger wins.",
  keywords: [
    "multiplayer game",
    "guessing game",
    "music quiz",
    "geography quiz",
    "real-time",
    "party game",
  ],
  openGraph: {
    title: "guessX — the multiplayer guessing game",
    description:
      "challenge your friends in real-time. guess songs, landmarks, actors, or flags. fastest finger wins.",
    type: "website",
    siteName: "guessX",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "guessX — the multiplayer guessing game",
    description:
      "challenge your friends in real-time. guess songs, landmarks, actors, or flags. fastest finger wins.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmMono.variable}`}>
      <body style={{ fontFamily: "var(--font-dm-mono), monospace" }}>
        <ConvexClientProvider>
          {children}
          <Footer />
        </ConvexClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
