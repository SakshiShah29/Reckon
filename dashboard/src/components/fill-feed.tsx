"use client";

import { useEffect, useState, useCallback } from "react";
import { resolveToken, formatAmount } from "@/lib/tokens";

interface FillRecord {
  orderHash: string;
  filler: string;
  fillerNamehash: string;
  swapper: string;
  tokenIn: string;
  tokenOut: string;
  inputAmount: string;
  outputAmount: string;
  eboToleranceBps: number;
  fillBlock: number;
  fillTimestamp: number;
  challengeDeadline: number;
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

const TOKEN_COLORS: Record<string, string> = {
  USDC: "#34D399",
  WETH: "#8B5CF6",
};

export function FillFeed() {
  const [fills, setFills] = useState<FillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchFills = useCallback(async () => {
    try {
      const res = await fetch("/api/fills?limit=5");
      if (!res.ok) throw new Error("fetch failed");
      const data: FillRecord[] = await res.json();
      setFills(data);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFills();
    const iv = setInterval(fetchFills, 30_000);
    return () => clearInterval(iv);
  }, [fetchFills]);

  return (
    <div className="card p-4 flex-1 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[14px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>Recent Fills</p>
        <button className="text-[11px] font-semibold text-[#8B5CF6] hover:text-[#7C3AED] flex items-center gap-1 transition-colors">
          View all
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      <div className="space-y-1.5">
        {loading && (
          <p className="text-[13px] text-[#94A3B8] py-4 text-center font-medium">Loading...</p>
        )}
        {error && !loading && fills.length === 0 && (
          <div className="py-4 text-center"><span className="badge badge-red">Error loading fills</span></div>
        )}
        {!loading && !error && fills.length === 0 && (
          <p className="text-[13px] text-[#94A3B8] py-4 text-center">No fills recorded yet</p>
        )}
        {fills.map((f) => {
          const tIn = resolveToken(f.tokenIn);
          const tOut = resolveToken(f.tokenOut);
          const pair = `${tIn.symbol} \u2192 ${tOut.symbol}`;
          const hash = `${f.orderHash.slice(0, 6)}\u2026${f.orderHash.slice(-4)}`;
          const amount = `$${formatAmount(f.inputAmount, tIn.decimals)}`;
          const time = relativeTime(f.fillTimestamp);
          const bg = TOKEN_COLORS[tIn.symbol] ?? "#8B5CF6";

          return (
            <div key={f.orderHash} className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-[#F8FAFC] transition-colors">
              <div
                className="w-8 h-8 rounded-lg border-2 border-[#1E293B] flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                style={{ background: bg }}
              >
                {tIn.symbol.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-[#1E293B]">{pair}</p>
                <p className="text-[10px] text-[#94A3B8] font-mono truncate">{time} &middot; {hash}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[12px] font-bold text-[#1E293B] font-mono">{amount}</p>
                <span className="badge badge-green !text-[9px] !py-0 !px-2">Recorded</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
