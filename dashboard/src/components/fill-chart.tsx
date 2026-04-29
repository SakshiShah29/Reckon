"use client";

const data = [
  { label: "Jan", v: 8 }, { label: "Feb", v: 12 }, { label: "Mar", v: 10 },
  { label: "Apr", v: 18 }, { label: "May", v: 14 }, { label: "Jun", v: 22 },
  { label: "Jul", v: 19 }, { label: "Aug", v: 24 },
];

const max = 30;
const W = 560;
const H = 160;

function x(i: number) { return 40 + (i / (data.length - 1)) * (W - 80); }
function y(v: number) { return 10 + (1 - v / max) * (H - 30); }

const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.v)}`).join(" ");
const area = `${line} L${x(data.length - 1)},${H - 20} L${x(0)},${H - 20} Z`;

export function FillChart() {
  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-[11px] text-[#666]">Fill Volume</p>
          <p className="text-[28px] font-semibold text-white leading-tight">$12,450,230<span className="text-[#555] text-lg">.00</span></p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[11px] text-[#555]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#00D4AA]" /> Volume</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#a78bfa]" /> Fills</span>
          </div>
          <select className="bg-[#1a1a1a] text-[#888] text-[11px] border border-[#222] rounded-lg px-2 py-1 outline-none">
            <option>This Year</option><option>This Month</option><option>This Week</option>
          </select>
        </div>
      </div>

      {/* Chart */}
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
        <text x="35" y="15" textAnchor="end" fill="#444" fontSize="9" fontFamily="var(--font-mono)">30k</text>
        <text x="35" y={10 + 0.33 * (H - 30) + 3} textAnchor="end" fill="#444" fontSize="9" fontFamily="var(--font-mono)">20k</text>
        <text x="35" y={10 + 0.66 * (H - 30) + 3} textAnchor="end" fill="#444" fontSize="9" fontFamily="var(--font-mono)">10k</text>

        {/* Area + Line */}
        <path d={area} fill="url(#areaFill)" />
        <path d={line} fill="none" stroke="#00D4AA" strokeWidth="2" strokeLinecap="round" />

        {/* Purple secondary line */}
        {(() => {
          const line2 = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.v * 0.7 + 2)}`).join(" ");
          return <path d={line2} fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />;
        })()}

        {/* Data points */}
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={y(d.v)} r="3" fill="#00D4AA" />
        ))}

        {/* Tooltip on highest point */}
        {(() => {
          const hi = data.reduce((a, b, i) => b.v > data[a].v ? i : a, 0);
          return (
            <g>
              <rect x={x(hi) - 24} y={y(data[hi].v) - 22} width="48" height="18" rx="6" fill="#1a1a1a" stroke="#333" strokeWidth="0.5" />
              <text x={x(hi)} y={y(data[hi].v) - 10} textAnchor="middle" fill="white" fontSize="9" fontFamily="var(--font-mono)">$24,235</text>
            </g>
          );
        })()}

        {/* X labels */}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fill="#444" fontSize="9">{d.label}</text>
        ))}
      </svg>
    </div>
  );
}
