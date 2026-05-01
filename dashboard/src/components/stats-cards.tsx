"use client";

import { useEffect, useState, useCallback } from "react";

interface Stats {
  totalFills: number;
  totalChallenges: number;
  totalSlashes: number;
  totalSlashedUSDC: number;
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("fetch failed");
      const data: Stats = await res.json();
      setStats(data);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 30_000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  const totalFills = stats ? stats.totalFills.toLocaleString() : "\u2014";
  const totalChallenges = stats ? stats.totalChallenges.toLocaleString() : "\u2014";
  const totalSlashes = stats ? stats.totalSlashes.toLocaleString() : "\u2014";
  const totalSlashedUSDC = stats
    ? `$${stats.totalSlashedUSDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "\u2014";

  const challengePct =
    stats && stats.totalFills > 0
      ? Math.round((stats.totalChallenges / stats.totalFills) * 100)
      : 0;
  const slashPct =
    stats && stats.totalFills > 0
      ? Math.round((stats.totalSlashes / stats.totalFills) * 100)
      : 0;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-[#666]">Total fills indexed</p>
        {error && (
          <span className="text-[11px] text-[#ef4444] bg-[#ef4444]/10 px-1.5 py-0.5 rounded">Error</span>
        )}
        {!error && stats && (
          <span className="text-[11px] text-[#34d399] bg-[#34d399]/10 px-1.5 py-0.5 rounded">Live</span>
        )}
        {!error && !stats && (
          <span className="text-[11px] text-[#666] bg-[#666]/10 px-1.5 py-0.5 rounded">...</span>
        )}
      </div>
      <p className="text-[32px] font-semibold text-white leading-tight">{totalFills}</p>

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
          <p className="text-[10px] text-[#555] uppercase tracking-wider">Challenges</p>
          <p className="text-white text-lg font-medium mt-0.5">
            {totalChallenges} <span className="text-[12px] text-[#555]">{stats ? `\u00b7 ${challengePct}%` : ""}</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider">Slashes</p>
          <p className="text-white text-lg font-medium mt-0.5">
            {totalSlashes} <span className="text-[12px] text-[#555]">{stats ? `\u00b7 ${slashPct}%` : ""}</span>
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider">Slashed USDC</p>
          <p className="text-white text-lg font-medium mt-0.5">{totalSlashedUSDC}</p>
        </div>
      </div>
    </div>
  );
}
