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
  USDC: "#00D4AA",
  WETH: "#6366f1",
};

function tokenColor(symbol: string): string {
  return TOKEN_COLORS[symbol] ?? "#a78bfa";
}

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
        <p className="text-white text-[13px] font-medium">Recent Fills</p>
        <button className="text-[11px] text-[#555] hover:text-[#888] flex items-center gap-1 transition-colors">
          View all <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>

      <div className="space-y-1">
        {loading && (
          <p className="text-[12px] text-[#555] py-4 text-center">...</p>
        )}
        {error && !loading && fills.length === 0 && (
          <p className="text-[12px] text-[#ef4444] py-4 text-center">Error loading fills</p>
        )}
        {!loading && !error && fills.length === 0 && (
          <p className="text-[12px] text-[#555] py-4 text-center">No fills recorded yet</p>
        )}
        {fills.map((f) => {
          const tIn = resolveToken(f.tokenIn);
          const tOut = resolveToken(f.tokenOut);
          const pair = `${tIn.symbol} \u2192 ${tOut.symbol}`;
          const hash = `${f.orderHash.slice(0, 6)}\u2026${f.orderHash.slice(-4)}`;
          const amount = `$${formatAmount(f.inputAmount, tIn.decimals)}`;
          const time = relativeTime(f.fillTimestamp);
          const bg = tokenColor(tIn.symbol);
          const letter = tIn.symbol.charAt(0);

          return (
            <div key={f.orderHash} className="flex items-center gap-3 py-2 hover:bg-[#1a1a1a] -mx-2 px-2 rounded-lg transition-colors">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                style={{ background: `${bg}20`, border: `1px solid ${bg}30` }}>
                {letter}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white font-medium">{pair}</p>
                <p className="text-[10px] text-[#444] font-mono truncate">{time} &middot; {hash}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[12px] text-white font-mono font-medium">{amount}</p>
                <p className="text-[10px] flex items-center gap-1 justify-end text-[#00D4AA]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA]" />
                  Recorded
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
