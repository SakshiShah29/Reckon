"use client";

import { useEffect, useState, useCallback } from "react";
import { resolveToken, formatAmount } from "@/lib/tokens";

interface ChallengeRecord {
  orderHash: string;
  challengerAddress: string;
  challengerNamehash: string;
  agentTokenId: string;
  benchmarkOutput: string;
  actualOutput: string;
  eboToleranceBps: number;
  succeeded: boolean;
  slashAmount?: string;
  challengeBlock: number;
  challengeTimestamp: number;
  txHash: string;
}

function relativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = Math.max(0, now - timestamp);
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const icons = {
  check: <><circle cx="12" cy="12" r="9" /><polyline points="9 12 11 14 15 10" /></>,
  x: <><circle cx="12" cy="12" r="9" /><line x1="14" y1="10" x2="10" y2="14" /><line x1="10" y1="10" x2="14" y2="14" /></>,
};

export function ChallengeFeed() {
  const [challenges, setChallenges] = useState<ChallengeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchChallenges = useCallback(async () => {
    try {
      const res = await fetch("/api/challenges?limit=5");
      if (!res.ok) throw new Error("fetch failed");
      const data: ChallengeRecord[] = await res.json();
      setChallenges(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChallenges();
    const iv = setInterval(fetchChallenges, 30_000);
    return () => clearInterval(iv);
  }, [fetchChallenges]);

  const openCount = challenges.filter((c) => !c.succeeded && !c.slashAmount).length;
  const wonCount = challenges.filter((c) => c.succeeded).length;
  const lostCount = challenges.filter((c) => !c.succeeded && c.slashAmount).length;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white text-[14px] font-medium">EBBO Challenges</p>
          <p className="text-[11px] text-[#555] mt-0.5">Open &amp; recently resolved disputes</p>
        </div>
        <button className="text-[11px] text-[#555] hover:text-[#888] flex items-center gap-1 transition-colors">
          View all <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Total</p>
          <p className="text-white text-lg font-medium">{loading ? "..." : challenges.length}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Succeeded</p>
          <p className="text-[#00D4AA] text-lg font-medium">{loading ? "..." : wonCount}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Failed</p>
          <p className="text-[#ef4444] text-lg font-medium">{loading ? "..." : lostCount}</p>
        </div>
      </div>

      {/* Challenge rows */}
      <div className="space-y-1">
        {loading && (
          <p className="text-[12px] text-[#555] py-4 text-center">...</p>
        )}
        {error && !loading && challenges.length === 0 && (
          <p className="text-[12px] text-[#ef4444] py-4 text-center">Error loading challenges</p>
        )}
        {!loading && !error && challenges.length === 0 && (
          <p className="text-[12px] text-[#555] py-4 text-center">No challenges yet</p>
        )}
        {challenges.map((ch) => {
          const succeeded = ch.succeeded;
          const statusColor = succeeded ? "#34d399" : "#ef4444";
          const statusLabel = succeeded ? "Succeeded" : "Failed";
          const icon = succeeded ? "check" : "x";
          const hash = `${ch.orderHash.slice(0, 6)}\u2026${ch.orderHash.slice(-4)}`;
          const time = relativeTime(ch.challengeTimestamp);

          // Format benchmark vs actual as USDC amounts (6 decimals)
          const benchFmt = formatAmount(ch.benchmarkOutput, 6);
          const actualFmt = formatAmount(ch.actualOutput, 6);
          const diffBps = ch.eboToleranceBps;

          return (
            <div key={ch.txHash} className="flex items-center gap-3 py-2.5 hover:bg-[#1a1a1a] -mx-2 px-2 rounded-lg transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="1.5" className="flex-shrink-0">
                {icons[icon]}
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white font-medium">Challenge &middot; {hash}</p>
                <p className="text-[10px] text-[#444] mt-0.5">
                  <span className="text-[#6366f1]">Agent #{ch.agentTokenId}</span>
                  {" \u00b7 "}benchmark {benchFmt} vs actual {actualFmt} ({diffBps} bps)
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[11px] font-medium" style={{ color: statusColor }}>{statusLabel}</p>
                <p className="text-[10px] text-[#444] font-mono">{time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
