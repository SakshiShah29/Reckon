"use client";

/* ─── Partner data ─── */
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
  {
    name: "0G",
    caption: "Storage & Compute",
    color: "#00D4AA",
    gradient: true,
    gradientFrom: "#00D4AA",
    gradientTo: "#6366f1",
  },
  {
    name: "GENSYN",
    caption: "AXL Mesh",
    color: "#34d399",
  },
  {
    name: "KeeperHub",
    caption: "Automation",
    color: "#6366f1",
    hasGearIcon: true,
  },
  {
    name: "UniswapX",
    caption: "Solver Protocol",
    color: "#FF007A",
  },
  {
    name: "ENS",
    caption: "Identity",
    color: "#5298FF",
  },
  {
    name: "BASE",
    caption: "L2 Chain",
    color: "#0052FF",
  },
];

/* ─── Gear SVG icon for KeeperHub ─── */
function GearIcon({ color }: { color: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block mr-1 -mt-[1px]"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/* ─── Single partner logo item ─── */
function PartnerItem({
  partner,
}: {
  partner: Partner;
}) {
  const textStyle = partner.gradient
    ? {
        background: `linear-gradient(135deg, ${partner.gradientFrom}, ${partner.gradientTo})`,
        WebkitBackgroundClip: "text" as const,
        WebkitTextFillColor: "transparent",
        backgroundClip: "text" as const,
      }
    : { color: partner.color };

  return (
    <div className="flex flex-col items-center gap-1 group/item cursor-default transition-all duration-200 hover:brightness-125">
      <span
        className="text-[14px] font-bold tracking-wide leading-none"
        style={textStyle}
      >
        {"hasGearIcon" in partner && partner.hasGearIcon && (
          <GearIcon color={partner.color} />
        )}
        {partner.name}
      </span>
      <span className="text-[9px] text-[#444] tracking-wider uppercase leading-none">
        {partner.caption}
      </span>
    </div>
  );
}

/* ─── Separator dot ─── */
function Separator() {
  return (
    <div className="w-[3px] h-[3px] rounded-full bg-[#333] self-center mt-[-6px]" />
  );
}

/* ─── Main exported component ─── */
export function PartnerLogos() {
  return (
    <div className="w-full py-5 flex flex-col items-center gap-3 opacity-60 hover:opacity-90 transition-opacity duration-300">
      {/* Header */}
      <p className="text-[10px] text-[#555] uppercase tracking-[0.2em] font-medium">
        Powered by
      </p>

      {/* Logo row */}
      <div className="flex items-center justify-center gap-6 flex-wrap">
        {partners.map((partner, i) => (
          <div key={partner.name} className="flex items-center gap-6">
            <PartnerItem partner={partner} />
            {i < partners.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    </div>
  );
}
