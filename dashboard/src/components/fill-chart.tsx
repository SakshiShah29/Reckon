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
  volume: number; // in USD terms
}

function groupFillsByDay(fills: FillRecord[]): ChartPoint[] {
  const buckets: Record<string, { fills: number; volume: number }> = {};

  for (const f of fills) {
    const d = new Date(f.fillTimestamp * 1000);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    if (!buckets[key]) buckets[key] = { fills: 0, volume: 0 };
    buckets[key].fills += 1;

    // Convert inputAmount to USD equivalent
    const token = resolveToken(f.tokenIn);
    const amount = Number(BigInt(f.inputAmount)) / 10 ** token.decimals;
    buckets[key].volume += amount;
  }

  // Sort by date order (we rely on fillTimestamp ordering from API)
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

  // Reverse so earliest is first
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

  // Compute total volume
  const totalVolume = fills.reduce((sum, f) => {
    const token = resolveToken(f.tokenIn);
    return sum + Number(BigInt(f.inputAmount)) / 10 ** token.decimals;
  }, 0);

  const data = groupFillsByDay(fills);

  // Chart rendering
  const W = 560;
  const H = 160;
  const max = data.length > 0 ? Math.max(...data.map((d) => d.fills), 1) * 1.2 : 30;

  function xPos(i: number) {
    return data.length > 1 ? 40 + (i / (data.length - 1)) * (W - 80) : W / 2;
  }
  function yPos(v: number) {
    return 10 + (1 - v / max) * (H - 30);
  }

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yPos(d.fills)}`).join(" ");
  const area = data.length > 0
    ? `${line} L${xPos(data.length - 1)},${H - 20} L${xPos(0)},${H - 20} Z`
    : "";

  // Format volume
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
          <p className="text-[11px] text-[#666]">Fill Volume</p>
          {loading ? (
            <p className="text-[28px] font-semibold text-white leading-tight">&mdash;</p>
          ) : (
            <p className="text-[28px] font-semibold text-white leading-tight">
              {volWhole >= 1_000_000 ? (
                volDisplay
              ) : (
                <>${volWhole.toLocaleString()}<span className="text-[#555] text-lg">{volFrac}</span></>
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[11px] text-[#555]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00D4AA]" /> Volume</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#a78bfa]" /> Fills</span>
          </div>
          <select className="bg-[#1a1a1a] text-[#888] text-[11px] border border-[#222] rounded-lg px-2 py-1 outline-none">
            <option>All Time</option>
          </select>
        </div>
      </div>

      {/* Chart */}
      {loading && (
        <div className="flex items-center justify-center h-[160px]">
          <p className="text-[12px] text-[#555]">...</p>
        </div>
      )}
      {error && !loading && fills.length === 0 && (
        <div className="flex items-center justify-center h-[160px]">
          <p className="text-[12px] text-[#ef4444]">Error loading chart data</p>
        </div>
      )}
      {!loading && data.length === 0 && !error && (
        <div className="flex items-center justify-center h-[160px]">
          <p className="text-[12px] text-[#555]">No fill data yet</p>
        </div>
      )}
      {!loading && data.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-3">
          <defs>
            <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#00D4AA" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#00D4AA" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {[0, 0.33, 0.66, 1].map((p) => (
            <line key={p} x1="40" y1={10 + p * (H - 30)} x2={W - 40} y2={10 + p * (H - 30)} stroke="#1a1a1a" strokeWidth="1" />
          ))}

          {/* Y labels */}
          <text x="35" y="15" textAnchor="end" fill="#444" fontSize="9" fontFamily="var(--font-mono)">{Math.round(max)}</text>
          <text x="35" y={10 + 0.33 * (H - 30) + 3} textAnchor="end" fill="#444" fontSize="9" fontFamily="var(--font-mono)">{Math.round(max * 0.66)}</text>
          <text x="35" y={10 + 0.66 * (H - 30) + 3} textAnchor="end" fill="#444" fontSize="9" fontFamily="var(--font-mono)">{Math.round(max * 0.33)}</text>

          {/* Area + Line */}
          {area && <path d={area} fill="url(#areaFill)" />}
          <path d={line} fill="none" stroke="#00D4AA" strokeWidth="2" strokeLinecap="round" />

          {/* Purple secondary line (volume) */}
          {(() => {
            const maxVol = Math.max(...data.map((d) => d.volume), 1);
            const line2 = data.map((d, i) => `${i === 0 ? "M" : "L"}${xPos(i)},${yPos((d.volume / maxVol) * max * 0.8)}`).join(" ");
            return <path d={line2} fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />;
          })()}

          {/* Data points */}
          {data.map((d, i) => (
            <circle key={i} cx={xPos(i)} cy={yPos(d.fills)} r="3" fill="#00D4AA" />
          ))}

          {/* Tooltip on highest point */}
          {(() => {
            const hi = data.reduce((a, b, i) => b.fills > data[a].fills ? i : a, 0);
            return (
              <g>
                <rect x={xPos(hi) - 24} y={yPos(data[hi].fills) - 22} width="48" height="18" rx="6" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
                <text x={xPos(hi)} y={yPos(data[hi].fills) - 10} textAnchor="middle" fill="white" fontSize="9" fontFamily="var(--font-mono)">{data[hi].fills} fills</text>
              </g>
            );
          })()}

          {/* X labels */}
          {data.map((d, i) => (
            <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fill="#444" fontSize="9">{d.label}</text>
          ))}
        </svg>
      )}
    </div>
  );
}
