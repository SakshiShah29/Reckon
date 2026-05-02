"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navTabs = [
  { label: "Dashboard", href: "/", icon: "grid" },
  { label: "Swap", href: "/swap", icon: "swap" },
  { label: "Agents", href: "/agents", icon: "bot" },
  { label: "Register", href: "/register", icon: "user" },
  { label: "0G", href: "/zero-g", icon: "cloud" },
  { label: "Protocol", href: "/protocol", icon: "shield" },
];

function NavIcon({ type, active }: { type: string; active: boolean }) {
  const stroke = active ? "#8B5CF6" : "#64748B";
  const props = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  switch (type) {
    case "grid": return <svg {...props}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    case "swap": return <svg {...props}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>;
    case "bot": return <svg {...props}><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><circle cx="8" cy="16" r="1" fill={stroke} /><circle cx="16" cy="16" r="1" fill={stroke} /></svg>;
    case "user": return <svg {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
    case "cloud": return <svg {...props}><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></svg>;
    case "shield": return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;
    default: return null;
  }
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 h-[64px] z-50 flex items-center px-6"
        style={{
          background: "#FFFFFF",
          borderBottom: "2px solid #1E293B",
          boxShadow: "0 4px 0 #E2E8F0",
        }}
      >
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 mr-8 group">
          <div className="w-9 h-9 rounded-xl bg-[#8B5CF6] border-2 border-[#1E293B] flex items-center justify-center shadow-[3px_3px_0_#1E293B] group-hover:shadow-[4px_4px_0_#1E293B] group-hover:translate-x-[-1px] group-hover:translate-y-[-1px] transition-all duration-200">
            <img src="/logo.png" alt="Reckon" className="w-6 h-6 rounded-lg" />
          </div>
          <span className="text-[#1E293B] font-extrabold text-[17px] tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
            RECKON
          </span>
        </Link>

        {/* Nav pills */}
        <div className="flex gap-1">
          {navTabs.map((tab) => {
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={`flex items-center gap-1.5 px-4 py-[7px] rounded-full text-[13px] font-semibold transition-all duration-200 border-2 ${
                  active
                    ? "bg-[#8B5CF6] text-white border-[#1E293B] shadow-[3px_3px_0_#1E293B]"
                    : "text-[#64748B] border-transparent hover:bg-[#F1F5F9] hover:text-[#1E293B] hover:border-[#E2E8F0]"
                }`}
              >
                <NavIcon type={tab.icon} active={active} />
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full px-3 py-[6px] bg-[#ECFDF5] border-2 border-[#A7F3D0]">
            <div className="live-dot" />
            <span className="text-[11px] text-[#059669] font-semibold font-mono">Base Sepolia</span>
          </div>
          <div
            className="w-9 h-9 rounded-full bg-gradient-to-br from-[#FBBF24] to-[#F472B6] border-2 border-[#1E293B] flex items-center justify-center text-[11px] font-bold text-[#1E293B] shadow-[3px_3px_0_#1E293B]"
          >
            SS
          </div>
        </div>
      </nav>

      <main className="pt-[72px] min-h-screen">{children}</main>
    </>
  );
}
