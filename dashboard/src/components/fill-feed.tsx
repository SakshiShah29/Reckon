"use client";

const fills = [
  { pair: "USDC → WETH", hash: "0xabc1…f4e2", solver: "alice.solvers", time: "2h ago", amount: "$2,450.00", status: "Recorded", color: "#00D4AA", letter: "U", bg: "#00D4AA" },
  { pair: "WETH → USDC", hash: "0x7f3a…2b91", solver: "wintermute", time: "3h ago", amount: "$18,200.00", status: "Recorded", color: "#00D4AA", letter: "W", bg: "#6366f1" },
  { pair: "DAI → USDC", hash: "0x441e…0a27", solver: "anon", time: "4h ago", amount: "$500.00", status: "Listen-only", color: "#555", letter: "D", bg: "#a78bfa" },
  { pair: "USDC → WBTC", hash: "0xe902…cc18", solver: "titan", time: "5h ago", amount: "$45,000.00", status: "Recorded", color: "#00D4AA", letter: "U", bg: "#00D4AA" },
];

export function FillFeed() {
  return (
    <div className="card p-4 flex-1 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <p className="text-white text-[13px] font-medium">Recent Fills</p>
        <button className="text-[11px] text-[#555] hover:text-[#888] flex items-center gap-1 transition-colors">
          View all <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      <div className="space-y-1">
        {fills.map((f) => (
          <div key={f.hash} className="flex items-center gap-3 py-2 hover:bg-[#1a1a1a] -mx-2 px-2 rounded-lg transition-colors">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
              style={{ background: `${f.bg}20`, border: `1px solid ${f.bg}30` }}>
              {f.letter}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-white font-medium">{f.pair}</p>
              <p className="text-[10px] text-[#444] font-mono truncate">{f.time} · {f.hash}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[12px] text-white font-mono font-medium">{f.amount}</p>
              <p className="text-[10px] flex items-center gap-1 justify-end" style={{ color: f.color }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: f.color }} />
                {f.status}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
