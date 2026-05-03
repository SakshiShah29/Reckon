"use client";

const partners = [
  { name: "0G", caption: "Storage & Compute", logo: "/logos/0g.svg", h: "h-5" },
  { name: "Gensyn", caption: "AXL Mesh", logo: "/logos/gensyn-wordmark.svg", h: "h-4", darken: true },
  { name: "KeeperHub", caption: "Automation", logo: "/logos/keeperhub.png", h: "h-6", darken: true },
  { name: "UniswapX", caption: "Solver Protocol", logo: "/logos/uniswap.svg", h: "h-6" },
  { name: "ENS", caption: "Identity", logo: "/logos/ens.svg", h: "h-6" },
  { name: "Base", caption: "L2 Chain", logo: "/logos/base.svg", h: "h-5" },
];

export function PartnerLogos() {
  return (
    <div className="w-full py-6 flex flex-col items-center gap-4">
      <p className="text-[11px] text-[#94A3B8] uppercase tracking-[0.2em] font-bold">
        Powered by
      </p>

      <div className="flex items-center justify-center gap-8 flex-wrap">
        {partners.map((partner, i) => (
          <div key={partner.name} className="flex items-center gap-8">
            <div className="flex flex-col items-center gap-1.5 group cursor-default transition-all duration-300 hover:scale-110">
              <img
                src={partner.logo}
                alt={partner.name}
                className={`${partner.h} object-contain ${partner.darken ? "brightness-0" : ""}`}
              />
              <span className="text-[9px] text-[#94A3B8] tracking-wider uppercase leading-none font-semibold">
                {partner.caption}
              </span>
            </div>
            {i < partners.length - 1 && (
              <div className="w-1.5 h-1.5 rounded-full bg-[#E2E8F0]" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
