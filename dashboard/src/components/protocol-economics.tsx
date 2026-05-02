"use client";

import { useEffect, useState, useCallback } from "react";

interface Stats {
  totalFills: number;
  totalChallenges: number;
  totalSlashes: number;
  totalSlashedUSDC: number;
}

interface SlashRecord {
  swapperRestitution: string;
  [key: string]: unknown;
}

interface Solver {
  solverNamehash: string;
  [key: string]: unknown;
}

const ECON_CARDS = [
  {
    key: "solvers",
    label: "Active Solvers",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    iconBg: "#8B5CF6",
    shadow: "card-violet",
  },
  {
    key: "protected",
    label: "Swapper Protected",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    iconBg: "#34D399",
    shadow: "card-green",
  },
  {
    key: "slashRate",
    label: "Slash Rate",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
    iconBg: "#FBBF24",
    shadow: "card-amber",
  },
  {
    key: "challengeRate",
    label: "Challenge Success",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    ),
    iconBg: "#F472B6",
    shadow: "card-pink",
  },
];

export function ProtocolEconomics() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [solverCount, setSolverCount] = useState<number>(0);
  const [totalProtected, setTotalProtected] = useState<number>(0);

  const fetchData = useCallback(async () => {
    try {
      const [statsRes, solversRes, slashesRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/solvers"),
        fetch("/api/slashes?limit=200"),
      ]);

      if (statsRes.ok) {
        const s: Stats = await statsRes.json();
        setStats(s);
      }
      if (solversRes.ok) {
        const solvers: Solver[] = await solversRes.json();
        setSolverCount(solvers.length);
      }
      if (slashesRes.ok) {
        const slashes: SlashRecord[] = await slashesRes.json();
        const total = slashes.reduce((sum, s) => {
          try {
            return sum + Number(BigInt(s.swapperRestitution || "0"));
          } catch {
            return sum;
          }
        }, 0);
        setTotalProtected(total / 1e6);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  function getValue(key: string): string {
    switch (key) {
      case "solvers":
        return solverCount.toString();
      case "protected":
        return `$${totalProtected.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case "slashRate":
        if (!stats || stats.totalFills === 0) return "0%";
        return `${((stats.totalSlashes / stats.totalFills) * 100).toFixed(1)}%`;
      case "challengeRate":
        if (!stats || stats.totalChallenges === 0) return "0%";
        return `${((stats.totalSlashes / stats.totalChallenges) * 100).toFixed(1)}%`;
      default:
        return "\u2014";
    }
  }

  return (
    <div>
      <p className="text-[11px] font-bold text-[#94A3B8] uppercase tracking-wider mb-3">Protocol Economics</p>
      <div className="grid grid-cols-4 gap-4">
        {ECON_CARDS.map((c) => (
          <div key={c.key} className={`card ${c.shadow} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="icon-circle" style={{ background: c.iconBg, width: 32, height: 32, borderRadius: 8 }}>
                {c.icon}
              </div>
              <p className="text-[11px] font-semibold text-[#64748B]">{c.label}</p>
            </div>
            <p className="text-[24px] font-bold text-[#1E293B] tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
              {getValue(c.key)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
