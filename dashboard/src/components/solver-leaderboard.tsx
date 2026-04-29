"use client";

const solvers = [
  { name: "alice.solvers.reckon.eth", score: 92, fills: 1245, saved: "50 ETH", goal: "Bonded", pct: 92, color: "#00D4AA" },
  { name: "wintermute.solvers.reckon.eth", score: 85, fills: 3260, saved: "250 ETH", goal: "Bonded", pct: 85, color: "#a78bfa" },
  { name: "titan.solvers.reckon.eth", score: 78, fills: 890, saved: "30 ETH", goal: "Bonded", pct: 78, color: "#f59e0b" },
  { name: "anon.solvers.reckon.eth", score: 65, fills: 420, saved: "10 ETH", goal: "Bonded", pct: 65, color: "#ef4444" },
];

export function SolverLeaderboard() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-white text-[14px] font-medium">Top Solvers</p>
        <button className="text-[11px] text-[#555] hover:text-[#888] flex items-center gap-1 transition-colors">
          View all <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      <div className="space-y-4">
        {solvers.map((s) => (
          <div key={s.name} className="flex items-center gap-3">
            {/* Progress ring */}
            <div className="relative w-10 h-10 flex-shrink-0">
              <svg width="40" height="40" viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="16" fill="none" stroke="#1a1a1a" strokeWidth="3" />
                <circle cx="20" cy="20" r="16" fill="none" stroke={s.color} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${s.pct} ${100 - s.pct}`} strokeDashoffset="25"
                  transform="rotate(-90 20 20)" />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">{s.score}%</span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-[#6366f1] font-medium truncate">{s.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-[#555]">Bonded {s.saved}</span>
              </div>
            </div>

            {/* Right stats */}
            <div className="text-right flex-shrink-0">
              <p className="text-[12px] text-white font-medium">{s.fills.toLocaleString()}</p>
              <p className="text-[10px] text-[#555]">fills</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
