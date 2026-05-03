"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Types ──────────────────────────────────────────────────────── */

interface ReputationUpdate {
  solverNamehash: string;
  solverEnsName?: string;
  solverAddress?: string;
  reputationScore: string;
  totalFills: number;
  slashCount: number;
  lastSlashTimestamp: number;
  updatedAt: number;
}

function truncateHex(hex: string): string {
  if (hex.length <= 10) return hex;
  return `${hex.slice(0, 6)}...${hex.slice(-4)}`;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp || timestamp === 0) return "Never";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 0) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/* Assign consistent colors for solver rows based on rank */
const RANK_COLORS = ["#00D4AA", "#a78bfa", "#f59e0b", "#ef4444", "#6366f1", "#34d399"];

function getRankColor(index: number): string {
  return RANK_COLORS[index % RANK_COLORS.length];
}

const POLL_INTERVAL = 15_000;

/* ── Component ──────────────────────────────────────────────────── */

export function ProtocolSolvers() {
  const [solvers, setSolvers] = useState<ReputationUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/solvers");
      if (!res.ok) throw new Error("Failed to fetch solvers");
      const data: ReputationUpdate[] = await res.json();
      setSolvers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* ── Loading state ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white text-[14px] font-medium">Solver Leaderboard</p>
            <p className="text-[11px] text-[#555] mt-0.5">Reputation scores and slash history</p>
          </div>
        </div>
        <p className="text-[#555] text-[12px]">Loading...</p>
      </div>
    );
  }

  /* ── Error state ────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white text-[14px] font-medium">Solver Leaderboard</p>
            <p className="text-[11px] text-[#555] mt-0.5">Reputation scores and slash history</p>
          </div>
        </div>
        <p className="text-[#ef4444] text-[12px]">Error: {error}</p>
      </div>
    );
  }

  /* ── Empty state ────────────────────────────────────────────── */
  if (solvers.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white text-[14px] font-medium">Solver Leaderboard</p>
            <p className="text-[11px] text-[#555] mt-0.5">Reputation scores and slash history</p>
          </div>
        </div>
        <p className="text-[#555] text-[12px]">No solvers registered yet</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white text-[14px] font-medium">Solver Leaderboard</p>
          <p className="text-[11px] text-[#555] mt-0.5">Reputation scores and slash history</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#222]">
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3 w-10">#</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Solver</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Reputation</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Total Fills</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Slashes</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2">Last Slash</th>
            </tr>
          </thead>
          <tbody>
            {solvers.map((solver, i) => {
              const repScore = Number(solver.reputationScore);
              const color = getRankColor(i);

              return (
                <>
                  <tr
                    key={solver.solverNamehash}
                    onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                    className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                  >
                    {/* Rank */}
                    <td className="py-3 pr-3 text-[12px] text-[#555] font-medium">{i + 1}</td>

                    {/* Solver name */}
                    <td className="py-3 pr-3">
                      {solver.solverAddress ? (
                        <a
                          href={`https://sepolia.basescan.org/address/${solver.solverAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] text-[#6366f1] font-medium hover:underline"
                          style={{ fontFamily: solver.solverEnsName ? "inherit" : "var(--font-mono)" }}
                        >
                          {solver.solverEnsName || truncateHex(solver.solverNamehash)}
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                      ) : (
                        <p className="text-[12px] text-[#6366f1] font-medium font-mono">
                          {solver.solverEnsName || truncateHex(solver.solverNamehash)}
                        </p>
                      )}
                    </td>

                    {/* Reputation with ring */}
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="relative w-8 h-8 flex-shrink-0">
                          <svg width="32" height="32" viewBox="0 0 32 32">
                            <circle cx="16" cy="16" r="12" fill="none" stroke="#222" strokeWidth="2.5" />
                            <circle
                              cx="16"
                              cy="16"
                              r="12"
                              fill="none"
                              stroke={color}
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeDasharray={`${(repScore / 100) * 75.4} ${75.4 - (repScore / 100) * 75.4}`}
                              transform="rotate(-90 16 16)"
                            />
                          </svg>
                          <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">
                            {repScore}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#888]">{repScore}%</span>
                      </div>
                    </td>

                    {/* Total Fills */}
                    <td className="py-3 pr-3 text-[12px] font-mono text-white">{solver.totalFills.toLocaleString()}</td>

                    {/* Slash Count */}
                    <td className="py-3 pr-3">
                      <span
                        className="text-[11px] font-mono font-medium"
                        style={{ color: solver.slashCount > 0 ? "#ef4444" : "#34d399" }}
                      >
                        {solver.slashCount}
                      </span>
                    </td>

                    {/* Last Slash */}
                    <td className="py-3 text-[11px] text-[#555]">
                      {formatRelativeTime(solver.lastSlashTimestamp)}
                    </td>
                  </tr>

                  {/* Expanded details */}
                  {expandedRow === i && (
                    <tr key={`${solver.solverNamehash}-detail`} className="border-b border-[#1a1a1a]">
                      <td colSpan={6} className="py-3 px-2">
                        <div className="bg-[#1a1a1a] rounded-lg p-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Solver Details</p>
                              <div className="space-y-2">
                                <div className="bg-[#141414] rounded px-3 py-2">
                                  <p className="text-[10px] text-[#555]">Full Namehash</p>
                                  <p className="text-[11px] font-mono text-[#888] break-all">{solver.solverNamehash}</p>
                                </div>
                                <div className="bg-[#141414] rounded px-3 py-2">
                                  <p className="text-[10px] text-[#555]">Reputation Score (raw)</p>
                                  <p className="text-[11px] font-mono text-white">{solver.reputationScore}</p>
                                </div>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">Performance</p>
                              <div className="space-y-2">
                                <div className="bg-[#141414] rounded px-3 py-2 flex items-center justify-between">
                                  <span className="text-[10px] text-[#555]">Total Fills</span>
                                  <span className="text-[11px] font-mono text-white">{solver.totalFills.toLocaleString()}</span>
                                </div>
                                <div className="bg-[#141414] rounded px-3 py-2 flex items-center justify-between">
                                  <span className="text-[10px] text-[#555]">Slash Count</span>
                                  <span className="text-[11px] font-mono" style={{ color: solver.slashCount > 0 ? "#ef4444" : "#34d399" }}>
                                    {solver.slashCount}
                                  </span>
                                </div>
                                {solver.slashCount === 0 ? (
                                  <div className="bg-[#141414] rounded px-3 py-3 text-center">
                                    <p className="text-[11px] text-[#34d399]">No slashes recorded</p>
                                    <p className="text-[10px] text-[#444] mt-0.5">Clean track record</p>
                                  </div>
                                ) : (
                                  <div className="bg-[#141414] rounded px-3 py-2 flex items-center justify-between">
                                    <span className="text-[10px] text-[#555]">Last Slash</span>
                                    <span className="text-[11px] text-[#ef4444]">{formatRelativeTime(solver.lastSlashTimestamp)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
