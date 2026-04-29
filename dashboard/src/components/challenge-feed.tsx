"use client";

const challenges = [
  { title: "Sub-EBBO challenge · USDC→WETH", solver: "titan.solvers", detail: "12 bps below quote", status: "Open", statusColor: "#00D4AA", meta: "553 blk", icon: "circle" as const },
  { title: "Settled · WETH→USDC", solver: "anon.solvers", detail: "payout $1,245.20", status: "Won", statusColor: "#34d399", meta: "22m ago", icon: "check" as const },
  { title: "Pending batcher · DAI→USDC", solver: "", detail: "3 records queued · next batch in 4m 12s", status: "Pending", statusColor: "#f59e0b", meta: "Batch #294", icon: "clock" as const },
  { title: "Slash executed · UNI→USDC", solver: "anon.solvers", detail: "~$840.00 bond", status: "Slashed", statusColor: "#ef4444", meta: "1h ago", icon: "x" as const },
];

const icons = {
  circle: <circle cx="12" cy="12" r="9" />,
  check: <><circle cx="12" cy="12" r="9" /><polyline points="9 12 11 14 15 10" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><polyline points="12 8 12 12 14.5 14" /></>,
  x: <><circle cx="12" cy="12" r="9" /><line x1="14" y1="10" x2="10" y2="14" /><line x1="10" y1="10" x2="14" y2="14" /></>,
};

export function ChallengeFeed() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white text-[14px] font-medium">EBBO Challenges</p>
          <p className="text-[11px] text-[#555] mt-0.5">Open & recently resolved disputes</p>
        </div>
        <button className="text-[11px] text-[#555] hover:text-[#888] flex items-center gap-1 transition-colors">
          View all <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Open</p>
          <p className="text-white text-lg font-medium">8</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Won (7d)</p>
          <p className="text-[#00D4AA] text-lg font-medium">37</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Lost (7d)</p>
          <p className="text-[#ef4444] text-lg font-medium">2</p>
        </div>
      </div>

      {/* Challenge rows */}
      <div className="space-y-1">
        {challenges.map((ch, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5 hover:bg-[#1a1a1a] -mx-2 px-2 rounded-lg transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ch.statusColor} strokeWidth="1.5" className="flex-shrink-0">
              {icons[ch.icon]}
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-white font-medium">{ch.title}</p>
              <p className="text-[10px] text-[#444] mt-0.5">
                {ch.solver && <span>vs <span className="text-[#6366f1]">{ch.solver}</span> · </span>}
                {ch.detail}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[11px] font-medium" style={{ color: ch.statusColor }}>{ch.status}</p>
              <p className="text-[10px] text-[#444] font-mono">{ch.meta}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
