import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reckon — Solver Accountability Dashboard",
  description: "Real-time monitoring of DeFi solver fills, EBBO challenges, and reputation on Base",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen flex">
        {/* ── Sidebar ── */}
        <aside className="fixed left-0 top-0 h-screen w-[56px] bg-[#0e0e0e] border-r border-[#1a1a1a] flex flex-col items-center py-4 gap-1 z-50">
          <div className="w-9 h-9 rounded-lg bg-[#141414] border border-[#222] flex items-center justify-center mb-5">
            <span className="text-sm font-bold text-[#00D4AA]">R</span>
          </div>
          <SidebarIcon svg="grid" active />
          <SidebarIcon svg="list" />
          <SidebarIcon svg="users" />
          <SidebarIcon svg="shield" />
          <SidebarIcon svg="layers" />
          <div className="mt-auto">
            <SidebarIcon svg="settings" />
          </div>
        </aside>

        {/* ── Top Nav ── */}
        <nav className="fixed top-0 left-[56px] right-0 h-[52px] bg-[#0a0a0a] border-b border-[#1a1a1a] z-40 flex items-center px-5">
          <span className="text-white font-semibold text-base mr-2">Reckon</span>
          <span className="text-[10px] text-[#555] bg-[#1a1a1a] px-1.5 py-0.5 rounded font-mono mr-6">v0.4.1</span>

          <div className="flex gap-0.5">
            {["Overview", "Fills", "Solvers", "Challenges", "Batches"].map((t, i) => (
              <button key={t} className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${i === 0 ? "bg-[#1a1a1a] text-white" : "text-[#666] hover:text-[#999]"}`}>
                {t}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" className="cursor-pointer hover:stroke-[#999]"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" className="cursor-pointer hover:stroke-[#999]"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" className="cursor-pointer hover:stroke-[#999]"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#a78bfa] to-[#6366f1] flex items-center justify-center text-[9px] font-bold text-white ml-1">
              SC
            </div>
          </div>
        </nav>

        {/* ── Main ── */}
        <main className="ml-[56px] pt-[52px] flex-1 min-h-screen bg-[#0a0a0a]">
          {children}
        </main>
      </body>
    </html>
  );
}

function SidebarIcon({ svg, active }: { svg: string; active?: boolean }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    list: <><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="3.5" cy="6" r="1" fill="currentColor" /><circle cx="3.5" cy="12" r="1" fill="currentColor" /><circle cx="3.5" cy="18" r="1" fill="currentColor" /></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    shield: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  };
  return (
    <button className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${active ? "bg-[#1a1a1a] text-[#00D4AA]" : "text-[#444] hover:text-[#888] hover:bg-[#141414]"}`}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{paths[svg]}</svg>
    </button>
  );
}
