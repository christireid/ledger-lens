import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";

import { clientEnv } from "@/lib/env.client";

import "./globals.css";

// §04.3.3 — Inter (UI) + JetBrains Mono (numerals, amounts, IDs, code),
// via next/font with swap + fallback metrics to prevent CLS.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: {
    default: "Ledger Lens",
    template: "%s · Ledger Lens",
  },
  description:
    "Turn a pile of financial exports into an explainable, queryable, alert-driven picture of what actually happened to your money.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // §21.4 — reading headers() opts every HTML route into dynamic rendering,
  // which is what lets Next stamp the per-request CSP nonce onto its scripts.
  await headers();
  const shell = (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
  // Keyless local mode (see DECISIONS.md): without a publishable key,
  // ClerkProvider cannot mount — auth screens render the §05.3 unavailable card.
  if (!clientEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return shell;
  return <ClerkProvider>{shell}</ClerkProvider>;
}
