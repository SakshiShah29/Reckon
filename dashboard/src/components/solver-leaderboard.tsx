"use client";

import { useEffect, useState, useCallback } from "react";

interface ReputationUpdate {
  solverNamehash: string;
  reputationScore: string;
  totalFills: number;
  slashCount: number;
  lastSlashTimestamp?: number;
  updatedAt: number;
}

const RING_COLORS = ["#00D4AA", "#a78bfa", "#f59e0b", "#ef4444"];

export function SolverLeaderboard() {
  const [solvers, setSolvers] = useState<ReputationUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchSolvers = useCallback(async () => {
    try {
      const res = await fetch("/api/solvers");
      if (!res.ok) throw new Error("fetch failed");
      const data: ReputationUpdate[] = await res.json();
      setSolvers(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSolvers();
    const iv = setInterval(fetchSolvers, 30_000);
    return () => clearInterval(iv);
  }, [fetchSolvers]);

  const top4 = solvers.slice(0, 4);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-white text-[14px] font-medium">Top Solvers</p>
        <button className="text-[11px] text-[#555] hover:text-[#888] flex items-center gap-1 transition-colors">
          View all <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      <div className="space-y-4">
        {loading && (
          <p className="text-[12px] text-[#555] py-4 text-center">...</p>
        )}
        {error && !loading && solvers.length === 0 && (
          <p className="text-[12px] text-[#ef4444] py-4 text-center">Error loading solvers</p>
        )}
        {!loading && !error && solvers.length === 0 && (
          <p className="text-[12px] text-[#555] py-4 text-center">No solvers registered yet</p>
        )}
        {top4.map((s, i) => {
          const score = Number(s.reputationScore);
          const pct = Math.min(score, 100);
          const color = RING_COLORS[i % RING_COLORS.length];
          const truncHash = `${s.solverNamehash.slice(0, 6)}\u2026${s.solverNamehash.slice(-4)}`;

          return (
            <div key={s.solverNamehash} className="flex items-center gap-3">
              {/* Progress ring */}
              <div className="relative w-10 h-10 flex-shrink-0">
                <svg width="40" height="40" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="16" fill="none" stroke="#1a1a1a" strokeWidth="3" />
                  <circle cx="20" cy="20" r="16" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset="25"
                    transform="rotate(-90 20 20)" />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">{score}%</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-[#6366f1] font-medium truncate">{truncHash}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[#555]">Slashes: {s.slashCount}</span>
                </div>
              </div>

              {/* Right stats */}
              <div className="text-right flex-shrink-0">
                <p className="text-[12px] text-white font-medium">{s.totalFills.toLocaleString()}</p>
                <p className="text-[10px] text-[#555]">fills</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
