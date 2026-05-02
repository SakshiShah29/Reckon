"use client";

import { useEffect, useState, useCallback } from "react";

interface EbboData {
  benchmark: string | null;
  priceUSD: number;
  oracleAddress: string | null;
  toleranceBps: number;
  timestamp: number;
  error?: string;
}

export function EbboOracle() {
  const [data, setData] = useState<EbboData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchEbbo = useCallback(async () => {
    try {
      const res = await fetch("/api/ebbo");
      const d: EbboData = await res.json();
      setData(d);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEbbo();
    const iv = setInterval(fetchEbbo, 60_000);
    return () => clearInterval(iv);
  }, [fetchEbbo]);

  const hasPrice = data?.benchmark && !data.error;
  const addr = data?.oracleAddress;
  const shortAddr = addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "\u2014";

  return (
    <div className="card card-violet p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="icon-circle" style={{ background: "#8B5CF6", width: 32, height: 32, borderRadius: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <span className="text-[12px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>EBBO Oracle</span>
        </div>
        <span className={`badge ${hasPrice ? "badge-purple" : "badge-amber"}`}>
          {loading ? "..." : hasPrice ? "Live" : "Offline"}
        </span>
      </div>

      {/* Price */}
      <div className="bg-[#F5F3FF] border-2 border-[#DDD6FE] rounded-xl px-3 py-2 mb-3">
        <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wider">WETH / USDC Benchmark</p>
        <p className="text-[22px] font-bold text-[#1E293B] font-mono tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
          {loading ? "..." : hasPrice ? `$${data!.priceUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "\u2014"}
        </p>
      </div>

      {/* Details */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#64748B] font-medium">Tolerance</span>
          <span className="font-mono font-semibold text-[#8B5CF6]">{data?.toleranceBps ?? 100} bps (1%)</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#64748B] font-medium">Contract</span>
          <span className="font-mono font-semibold text-[#1E293B]">{shortAddr}</span>
        </div>
      </div>
    </div>
  );
}
