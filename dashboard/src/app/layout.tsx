import type { Metadata } from "next";
import "./globals.css";
import { NavShell } from "@/components/nav-shell";
import { Web3Provider } from "@/components/web3-provider";

export const metadata: Metadata = {
  title: "Reckon — Solver Accountability Dashboard",
  description: "Real-time monitoring of DeFi solver fills, EBBO challenges, and reputation on Base",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <Web3Provider>
          <NavShell>{children}</NavShell>
        </Web3Provider>
      </body>
    </html>
  );
}
