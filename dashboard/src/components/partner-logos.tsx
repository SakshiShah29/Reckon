"use client";

interface Partner {
  name: string;
  caption: string;
  color: string;
  gradient?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  hasGearIcon?: boolean;
}

const partners: Partner[] = [
  { name: "0G", caption: "Storage & Compute", color: "#34D399", gradient: true, gradientFrom: "#34D399", gradientTo: "#8B5CF6" },
  { name: "GENSYN", caption: "AXL Mesh", color: "#34D399" },
  { name: "KeeperHub", caption: "Automation", color: "#8B5CF6", hasGearIcon: true },
  { name: "UniswapX", caption: "Solver Protocol", color: "#F472B6" },
  { name: "ENS", caption: "Identity", color: "#3B82F6" },
  { name: "BASE", caption: "L2 Chain", color: "#1E293B" },
];

function GearIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1 -mt-[1px]">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function PartnerLogos() {
  return (
    <div className="w-full py-6 flex flex-col items-center gap-4">
      <p className="text-[11px] text-[#94A3B8] uppercase tracking-[0.2em] font-bold">
        Powered by
      </p>

      <div className="flex items-center justify-center gap-8 flex-wrap">
        {partners.map((partner, i) => {
          const textStyle = partner.gradient
            ? {
                background: `linear-gradient(135deg, ${partner.gradientFrom}, ${partner.gradientTo})`,
                WebkitBackgroundClip: "text" as const,
                WebkitTextFillColor: "transparent",
                backgroundClip: "text" as const,
              }
            : { color: partner.color };

          return (
            <div key={partner.name} className="flex items-center gap-8">
              <div className="flex flex-col items-center gap-1 group cursor-default transition-all duration-300 hover:scale-110">
                <span className="text-[15px] font-extrabold tracking-wide leading-none" style={{ ...textStyle, fontFamily: "var(--font-heading)" }}>
                  {partner.hasGearIcon && <GearIcon color={partner.color} />}
                  {partner.name}
                </span>
                <span className="text-[9px] text-[#94A3B8] tracking-wider uppercase leading-none font-semibold">
                  {partner.caption}
                </span>
              </div>
              {i < partners.length - 1 && (
                <div className="w-1.5 h-1.5 rounded-full bg-[#E2E8F0]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
