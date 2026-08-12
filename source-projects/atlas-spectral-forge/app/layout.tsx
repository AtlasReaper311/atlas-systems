import type { Metadata } from "next";
import { DM_Serif_Display, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const mono = IBM_Plex_Mono({
  variable: "--font-atlas-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const display = DM_Serif_Display({
  variable: "--font-atlas-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Atlas Spectral Forge",
  description: "A flagship telemetry sonification instrument for designing how deterministic synthetic system behaviour becomes sound.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${mono.variable} ${display.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
