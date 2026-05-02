"use client";

import { useEffect, useState, useCallback } from "react";

interface Stats {
  totalFills: number;
  totalChallenges: number;
  totalSlashes: number;
  totalSlashedUSDC: number;
}

const CARDS = [
  {
    key: "fills" as const,
    label: "Total Fills",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    iconBg: "#8B5CF6",
    shadow: "card-violet",
  },
  {
    key: "challenges" as const,
    label: "Challenges",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    iconBg: "#F472B6",
    shadow: "card-pink",
  },
  {
    key: "slashes" as const,
    label: "Slashes",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    ),
    iconBg: "#FBBF24",
    shadow: "card-amber",
  },
  {
    key: "slashedUSDC" as const,
    label: "Slashed USDC",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
    iconBg: "#34D399",
    shadow: "card-green",
  },
];

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

  function getValue(key: string): string {
    if (!stats) return "\u2014";
    switch (key) {
      case "fills": return stats.totalFills.toLocaleString();
      case "challenges": return stats.totalChallenges.toLocaleString();
      case "slashes": return stats.totalSlashes.toLocaleString();
      case "slashedUSDC": return `$${stats.totalSlashedUSDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      default: return "\u2014";
    }
  }

  function getSubtext(key: string): string {
    if (!stats || stats.totalFills === 0) return "";
    switch (key) {
      case "challenges": return `${Math.round((stats.totalChallenges / stats.totalFills) * 100)}% of fills`;
      case "slashes": return `${Math.round((stats.totalSlashes / stats.totalFills) * 100)}% of fills`;
      default: return "";
    }
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      {CARDS.map((c, i) => (
        <div key={c.key} className={`card ${c.shadow} p-5 pop-in pop-in-${i + 1}`}>
          <div className="flex items-center justify-between mb-3">
            <div
              className="icon-circle"
              style={{ background: c.iconBg }}
            >
              {c.icon}
            </div>
            {error ? (
              <span className="badge badge-red">Error</span>
            ) : stats ? (
              <span className="badge badge-green">Live</span>
            ) : (
              <span className="text-[11px] text-[#94A3B8]">...</span>
            )}
          </div>

          <p className="text-[32px] font-bold text-[#1E293B] leading-tight tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
            {getValue(c.key)}
          </p>
          <p className="text-[13px] font-medium text-[#64748B] mt-1">{c.label}</p>
          {getSubtext(c.key) && (
            <p className="text-[11px] text-[#94A3B8] mt-0.5">{getSubtext(c.key)}</p>
          )}
        </div>
      ))}
    </div>
  );
}
