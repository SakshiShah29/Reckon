"use client";

export function StatsCards() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-[#666]">Total fills indexed</p>
        <span className="text-[11px] text-[#34d399] bg-[#34d399]/10 px-1.5 py-0.5 rounded">3.2 ↗</span>
      </div>
      <p className="text-[32px] font-semibold text-white leading-tight">45,231</p>

      <div className="flex gap-3 mt-4">
        <button className="bg-[#00D4AA] text-black text-[13px] font-medium px-5 py-2 rounded-lg hover:opacity-90 transition-opacity">
          View All
        </button>
        <button className="bg-[#1a1a1a] text-white text-[13px] font-medium px-5 py-2 rounded-lg border border-[#333] hover:bg-[#222] transition-colors">
          Export CSV
        </button>
      </div>

      <div className="flex gap-6 mt-5 pt-4 border-t border-[#1e1e1e]">
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider">On-chain</p>
          <p className="text-white text-lg font-medium mt-0.5">12,845 <span className="text-[12px] text-[#555]">· 28%</span></p>
        </div>
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider">Listen-only</p>
          <p className="text-white text-lg font-medium mt-0.5">32,386 <span className="text-[12px] text-[#555]">· 72%</span></p>
        </div>
      </div>
    </div>
  );
}
