"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface Stats {
  totalFills: number;
  totalChallenges: number;
  totalSlashes: number;
  totalSlashedUSDC: number;
}

interface FillRecord {
  fillBlock: number;
  fillTimestamp: number;
  [key: string]: unknown;
}

export function IndexerHealth() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastBlock, setLastBlock] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [uptime, setUptime] = useState("00 : 00 : 00");
  const mountTime = useRef(Date.now());

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, fillsRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/fills?limit=1"),
      ]);
      if (!statsRes.ok || !fillsRes.ok) throw new Error("fetch failed");
      const statsData: Stats = await statsRes.json();
      const fillsData: FillRecord[] = await fillsRes.json();
      setStats(statsData);
      if (fillsData.length > 0) {
        setLastBlock(fillsData[0].fillBlock);
      }
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  useEffect(() => {
    const tick = () => {
      const elapsed = Math.floor((Date.now() - mountTime.current) / 1000);
      const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      setUptime(`${h}:${m}:${s}`);
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="card card-green p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="icon-circle" style={{ background: "#34D399", width: 32, height: 32, borderRadius: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <span className="text-[12px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>Indexer</span>
        </div>
        <span className={`badge ${error ? "badge-red" : "badge-green"}`}>
          <span className="flex items-center gap-1.5">
            <span className="live-dot" style={{ width: 6, height: 6 }} />
            {error ? "Error" : "Live"}
          </span>
        </span>
      </div>

      {/* Uptime */}
      <div className="bg-[#F1F5F9] border-2 border-[#E2E8F0] rounded-xl px-3 py-2 mb-3">
        <p className="text-[9px] font-semibold text-[#94A3B8] uppercase tracking-wider">Uptime</p>
        <p className="text-[18px] font-bold text-[#1E293B] font-mono tracking-wider">{uptime}</p>
      </div>

      {/* Stats rows */}
      <div className="space-y-2">
        <Row label="Last block" value={lastBlock ? lastBlock.toLocaleString() : "\u2014"} color="#8B5CF6" />
        <Row label="Records" value={stats ? stats.totalFills.toLocaleString() : "\u2014"} color="#34D399" />
        <Row label="Challenges" value={stats ? stats.totalChallenges.toLocaleString() : "\u2014"} color="#FBBF24" />
        <Row label="Slashes" value={stats ? stats.totalSlashes.toLocaleString() : "\u2014"} color="#F472B6" />
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="flex items-center gap-2 text-[#64748B] font-medium">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="font-mono font-semibold text-[#1E293B]">{value}</span>
    </div>
  );
}
