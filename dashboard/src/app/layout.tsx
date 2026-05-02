import type { Metadata } from "next";
import "./globals.css";
import { NavShell } from "@/components/nav-shell";

export const metadata: Metadata = {
  title: "Reckon — Solver Accountability Dashboard",
  description: "Real-time monitoring of DeFi solver fills, EBBO challenges, and reputation on Base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        <NavShell>{children}</NavShell>
      </body>
    </html>
  );
}
