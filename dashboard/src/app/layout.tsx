import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reckon — Solver Accountability Dashboard",
  description:
    "Real-time monitoring of DeFi solver fills, EBBO challenges, and reputation on Base",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace',
          backgroundColor: "#0a0a0a",
          color: "#e0e0e0",
        }}
      >
        <nav
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #222",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <span style={{ fontSize: "20px", fontWeight: 700, color: "#fff" }}>
            Reckon
          </span>
          <span style={{ fontSize: "13px", color: "#888" }}>
            Solver Accountability Dashboard
          </span>
          <span style={{ marginLeft: "auto", fontSize: "12px", color: "#555" }}>
            Base Mainnet
          </span>
        </nav>
        {children}
      </body>
    </html>
  );
}
