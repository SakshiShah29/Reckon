"use client";

const segments = [
  { label: "Swapper restitution", pct: 60, color: "#00D4AA" },
  { label: "iNFT owner bounty", pct: 30, color: "#a78bfa" },
  { label: "Protocol fee", pct: 10, color: "#f59e0b" },
];

export function SlashDonut() {
  const r = 60;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <p className="text-white text-[14px] font-medium">Slash Distribution</p>
        <button className="text-[#444] hover:text-[#888] transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center py-2">
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 160 160">
            {segments.map((seg) => {
              const len = (seg.pct / 100) * c;
              const gap = c - len;
              const rot = (offset / 100) * 360 - 90;
              offset += seg.pct;
              return (
                <circle
                  key={seg.label} cx="80" cy="80" r={r}
                  fill="none" stroke={seg.color} strokeWidth="20"
                  strokeDasharray={`${len} ${gap}`}
                  transform={`rotate(${rot} 80 80)`}
                  className="hover:opacity-80 transition-opacity cursor-pointer"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[9px] text-[#555] uppercase tracking-wider">Total</span>
            <span className="text-xl font-semibold text-white">$4,320<span className="text-[#555] text-sm">.90</span></span>
          </div>
        </div>
      </div>

      <div className="space-y-2 mt-2">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-2 text-[#888]">
              <span className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
              {seg.label}
            </span>
            <span className="text-white font-medium">{seg.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
