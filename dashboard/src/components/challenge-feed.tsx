"use client";

import { useEffect, useState, useCallback } from "react";
import { formatAmount } from "@/lib/tokens";

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

  const wonCount = challenges.filter((c) => c.succeeded).length;
  const lostCount = challenges.filter((c) => !c.succeeded && c.slashAmount).length;

  return (
    <div className="card card-amber p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="icon-circle" style={{ background: "#EF4444", width: 36, height: 36, borderRadius: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>Challenges</p>
            <p className="text-[11px] text-[#64748B]">EBBO dispute feed</p>
          </div>
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[#F1F5F9] border-2 border-[#E2E8F0] rounded-xl px-3 py-2 text-center">
          <p className="text-[9px] font-semibold text-[#94A3B8] uppercase">Total</p>
          <p className="text-[18px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>{loading ? "..." : challenges.length}</p>
        </div>
        <div className="bg-[#ECFDF5] border-2 border-[#A7F3D0] rounded-xl px-3 py-2 text-center">
          <p className="text-[9px] font-semibold text-[#059669] uppercase">Won</p>
          <p className="text-[18px] font-bold text-[#059669]" style={{ fontFamily: "var(--font-heading)" }}>{loading ? "..." : wonCount}</p>
        </div>
        <div className="bg-[#FEF2F2] border-2 border-[#FECACA] rounded-xl px-3 py-2 text-center">
          <p className="text-[9px] font-semibold text-[#DC2626] uppercase">Lost</p>
          <p className="text-[18px] font-bold text-[#DC2626]" style={{ fontFamily: "var(--font-heading)" }}>{loading ? "..." : lostCount}</p>
        </div>
      </div>

      {/* Challenge rows */}
      <div className="space-y-1.5">
        {loading && (
          <p className="text-[13px] text-[#94A3B8] py-4 text-center font-medium">Loading...</p>
        )}
        {error && !loading && challenges.length === 0 && (
          <div className="py-4 text-center"><span className="badge badge-red">Error loading challenges</span></div>
        )}
        {!loading && !error && challenges.length === 0 && (
          <p className="text-[13px] text-[#94A3B8] py-4 text-center">No challenges yet</p>
        )}
        {challenges.map((ch) => {
          const succeeded = ch.succeeded;
          const statusColor = succeeded ? "#059669" : "#DC2626";
          const statusBg = succeeded ? "#ECFDF5" : "#FEF2F2";
          const statusBorder = succeeded ? "#A7F3D0" : "#FECACA";
          const hash = `${ch.orderHash.slice(0, 6)}\u2026${ch.orderHash.slice(-4)}`;
          const time = relativeTime(ch.challengeTimestamp);
          const benchFmt = formatAmount(ch.benchmarkOutput, 6);
          const actualFmt = formatAmount(ch.actualOutput, 6);

          return (
            <div key={ch.txHash} className="flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-[#F8FAFC] transition-colors">
              {/* Status icon */}
              <div
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0"
                style={{ background: statusBg, borderColor: statusBorder }}
              >
                {succeeded ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="3" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={statusColor} strokeWidth="3" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-[#1E293B]">{hash}</p>
                <p className="text-[10px] text-[#64748B] mt-0.5">
                  <span className="font-semibold" style={{ color: "#8B5CF6" }}>Agent #{ch.agentTokenId}</span>
                  {" \u00b7 "}${benchFmt} vs ${actualFmt}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-[11px] font-bold" style={{ color: statusColor }}>
                  {succeeded ? "Slashed" : "Failed"}
                </p>
                <p className="text-[10px] text-[#94A3B8] font-mono">{time}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
