"use client";

import { useEffect, useState, useCallback } from "react";
import { resolveToken } from "@/lib/tokens";

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

interface ChartPoint {
  label: string;
  fills: number;
  volume: number;
}

function groupFillsByDay(fills: FillRecord[]): ChartPoint[] {
  const buckets: Record<string, { fills: number; volume: number }> = {};

  for (const f of fills) {
    const d = new Date(f.fillTimestamp * 1000);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (!buckets[key]) buckets[key] = { fills: 0, volume: 0 };
    buckets[key].fills += 1;

    const token = resolveToken(f.tokenIn);
    const amount = Number(BigInt(f.inputAmount)) / 10 ** token.decimals;
    buckets[key].volume += amount;
  }

  const seen = new Set<string>();
  const ordered: ChartPoint[] = [];
  for (const f of fills) {
    const d = new Date(f.fillTimestamp * 1000);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push({ label: key, fills: buckets[key].fills, volume: buckets[key].volume });
    }
  }

  return ordered.reverse();
}

export function FillChart() {
  const [fills, setFills] = useState<FillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchFills = useCallback(async () => {
    try {
      const res = await fetch("/api/fills?limit=50");
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

  const totalVolume = fills.reduce((sum, f) => {
    const token = resolveToken(f.tokenIn);
    return sum + Number(BigInt(f.inputAmount)) / 10 ** token.decimals;
  }, 0);

  const data = groupFillsByDay(fills);

  const W = 560;
  const H = 180;
  const max = data.length > 0 ? Math.max(...data.map((d) => d.fills), 1) * 1.2 : 30;

  function xPos(i: number) {
    return data.length > 1 ? 40 + (i / (data.length - 1)) * (W - 80) : W / 2;
  }
  function yPos(v: number) {
    return 15 + (1 - v / max) * (H - 40);
  }

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yPos(d.fills)}`).join(" ");
  const area = data.length > 0
    ? `${line} L${xPos(data.length - 1)},${H - 25} L${xPos(0)},${H - 25} Z`
    : "";

  const volWhole = Math.floor(totalVolume);
  const volFrac = totalVolume > 0 ? (totalVolume - volWhole).toFixed(2).slice(1) : ".00";
  const volDisplay = volWhole >= 1_000_000
    ? `$${(totalVolume / 1_000_000).toFixed(2)}M`
    : `$${volWhole.toLocaleString()}`;

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wider">Fill Volume</p>
          {loading ? (
            <p className="text-[32px] font-bold text-[#1E293B] leading-tight" style={{ fontFamily: "var(--font-heading)" }}>&mdash;</p>
          ) : (
            <p className="text-[32px] font-bold text-[#1E293B] leading-tight" style={{ fontFamily: "var(--font-heading)" }}>
              {volWhole >= 1_000_000 ? (
                volDisplay
              ) : (
                <>${volWhole.toLocaleString()}<span className="text-[#94A3B8] text-lg">{volFrac}</span></>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-[11px] font-semibold text-[#64748B]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#8B5CF6] border-2 border-[#1E293B]" /> Fills
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#FBBF24] border-2 border-[#1E293B]" /> Volume
            </span>
          </div>
        </div>
      </div>

      {/* Chart */}
      {loading && (
        <div className="flex items-center justify-center h-[180px]">
          <p className="text-[13px] text-[#94A3B8] font-medium">Loading chart data...</p>
        </div>
      )}
      {error && !loading && fills.length === 0 && (
        <div className="flex items-center justify-center h-[180px]">
          <div className="badge badge-red">Error loading chart data</div>
        </div>
      )}
      {!loading && data.length === 0 && !error && (
        <div className="flex items-center justify-center h-[180px]">
          <p className="text-[13px] text-[#94A3B8]">No fill data yet</p>
        </div>
      )}
      {!loading && data.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-3">
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {[0, 0.33, 0.66, 1].map((p) => (
            <line key={p} x1="40" y1={15 + p * (H - 40)} x2={W - 40} y2={15 + p * (H - 40)} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="4 4" />
          ))}

          {/* Y labels */}
          <text x="35" y="20" textAnchor="end" fill="#94A3B8" fontSize="10" fontFamily="var(--font-mono)" fontWeight="500">{Math.round(max)}</text>
          <text x="35" y={15 + 0.5 * (H - 40) + 3} textAnchor="end" fill="#94A3B8" fontSize="10" fontFamily="var(--font-mono)" fontWeight="500">{Math.round(max * 0.5)}</text>

          {/* Area + Line */}
          {area && <path d={area} fill="url(#areaFill)" />}
          <path d={line} fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Volume secondary line */}
          {(() => {
            const maxVol = Math.max(...data.map((d) => d.volume), 1);
            const line2 = data.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yPos((d.volume / maxVol) * max * 0.8)}`).join(" ");
            return <path d={line2} fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeDasharray="6 3" opacity="0.7" />;
          })()}

          {/* Data points */}
          {data.map((d, i) => (
            <g key={i}>
              <circle cx={xPos(i)} cy={yPos(d.fills)} r="5" fill="white" stroke="#8B5CF6" strokeWidth="2.5" />
            </g>
          ))}

          {/* Peak tooltip */}
          {(() => {
            const hi = data.reduce((a, b, i) => b.fills > data[a].fills ? i : a, 0);
            return (
              <g>
                <rect x={xPos(hi) - 28} y={yPos(data[hi].fills) - 26} width="56" height="22" rx="8" fill="#1E293B" />
                <text x={xPos(hi)} y={yPos(data[hi].fills) - 12} textAnchor="middle" fill="white" fontSize="10" fontFamily="var(--font-mono)" fontWeight="600">{data[hi].fills} fills</text>
              </g>
            );
          })()}

          {/* X labels */}
          {data.map((d, i) => (
            <text key={i} x={xPos(i)} y={H - 6} textAnchor="middle" fill="#94A3B8" fontSize="10" fontWeight="500">{d.label}</text>
          ))}
        </svg>
      )}
    </div>
  );
}
