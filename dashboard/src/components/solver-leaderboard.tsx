"use client";

import { useEffect, useState, useCallback } from "react";

interface ReputationUpdate {
  solverNamehash: string;
  solverEnsName?: string;
  solverAddress?: string;
  reputationScore: string;
  totalFills: number;
  slashCount: number;
  lastSlashTimestamp?: number;
  updatedAt: number;
}

const RANK_COLORS = ["#8B5CF6", "#F472B6", "#FBBF24", "#34D399"];
const RANK_SHADOWS = ["#DDD6FE", "#FBCFE8", "#FDE68A", "#A7F3D0"];

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
        <div className="flex items-center gap-2">
          <div className="icon-circle" style={{ background: "#FBBF24", width: 36, height: 36, borderRadius: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <p className="text-[14px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>Top Solvers</p>
        </div>
        <button className="btn-ghost text-[11px] !py-1 !px-3 !border-[#E2E8F0]">
          View all
        </button>
      </div>

      <div className="space-y-3">
        {loading && (
          <p className="text-[13px] text-[#94A3B8] py-6 text-center font-medium">Loading solvers...</p>
        )}
        {error && !loading && solvers.length === 0 && (
          <div className="py-6 text-center"><span className="badge badge-red">Error loading solvers</span></div>
        )}
        {!loading && !error && solvers.length === 0 && (
          <p className="text-[13px] text-[#94A3B8] py-6 text-center">No solvers registered yet</p>
        )}
        {top4.map((s, i) => {
          const score = Number(s.reputationScore);
          const pct = Math.min(score, 100);
          const color = RANK_COLORS[i % RANK_COLORS.length];
          const shadowColor = RANK_SHADOWS[i % RANK_SHADOWS.length];
          const hash = s.solverNamehash ?? "";
          const displayName = s.solverEnsName || (hash.length > 10 ? `${hash.slice(0, 6)}\u2026${hash.slice(-4)}` : hash || "unknown");
          const explorerUrl = s.solverAddress ? `https://sepolia.basescan.org/address/${s.solverAddress}` : null;

          // Progress ring
          const r = 16;
          const c = 2 * Math.PI * r;
          const dashLen = (pct / 100) * c;

          return (
            <div
              key={s.solverNamehash ?? i}
              className="flex items-center gap-3 p-2.5 rounded-xl border-2 border-[#E2E8F0] hover:border-[#1E293B] transition-all duration-200"
              style={{ boxShadow: `0 0 0 transparent` }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = `4px 4px 0 ${shadowColor}`)}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = `0 0 0 transparent`)}
            >
              {/* Rank badge */}
              <div
                className="w-7 h-7 rounded-full border-2 border-[#1E293B] flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                style={{ background: color }}
              >
                {i + 1}
              </div>

              {/* Progress ring */}
              <div className="relative w-10 h-10 flex-shrink-0">
                <svg width="40" height="40" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r={r} fill="none" stroke="#E2E8F0" strokeWidth="3" />
                  <circle
                    cx="20" cy="20" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
                    strokeDasharray={`${dashLen} ${c - dashLen}`} strokeDashoffset={c * 0.25}
                    transform="rotate(-90 20 20)"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-[#1E293B]">{score}</span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                {explorerUrl ? (
                  <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] font-bold text-[#7C3AED] truncate block hover:underline" style={{ fontFamily: s.solverEnsName ? "var(--font-body)" : "var(--font-mono)" }}>
                    {displayName}
                  </a>
                ) : (
                  <p className="text-[12px] font-bold text-[#1E293B] font-mono truncate">{displayName}</p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-[#64748B] font-medium">{s.totalFills} fills</span>
                  {s.slashCount > 0 && (
                    <span className="text-[10px] text-[#EF4444] font-medium">{s.slashCount} slashes</span>
                  )}
                </div>
              </div>

              {/* Score label */}
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] font-semibold text-[#94A3B8] uppercase">Score</p>
                <p className="text-[16px] font-bold" style={{ color, fontFamily: "var(--font-heading)" }}>{score}%</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
