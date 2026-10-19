import localFont from "next/font/local";
import type { Metadata, Viewport } from "next";

import { ServiceWorker } from "@/components/service-worker";
import { Footer } from "@/components/footer";

import "./globals.css";

const syne = localFont({
  src: "../../public/fonts/Syne-ExtraBold.ttf",
  weight: "800",
  variable: "--font-syne",
  display: "swap",
});

const dmMono = localFont({
  src: "../../public/fonts/DMMono-Medium.ttf",
  weight: "500",
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://guessx.enio.la"),
  icons: {
    icon: "/logo.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  applicationName: "guessX",
  appleWebApp: {
    capable: true,
    title: "guessX",
    statusBarStyle: "black-translucent",
  },
  title: "guessX — the multiplayer guessing game",
  description:
    "challenge your friends in real-time. guess songs, logos, actors, or flags. fastest finger wins.",
  keywords: [
    "multiplayer game",
    "guessing game",
    "music quiz",
    "logo quiz",
    "geography quiz",
    "real-time",
    "party game",
  ],
  openGraph: {
    title: "guessX — the multiplayer guessing game",
    description:
      "challenge your friends in real-time. guess songs, logos, actors, or flags. fastest finger wins.",
    type: "website",
    siteName: "guessX",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "guessX — the multiplayer guessing game",
    description:
      "challenge your friends in real-time. guess songs, logos, actors, or flags. fastest finger wins.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmMono.variable}`}>
      <body>
        {children}
        <Footer />
        <ServiceWorker />
      </body>
    </html>
  );
}
