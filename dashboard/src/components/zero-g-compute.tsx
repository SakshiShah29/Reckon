"use client";

const triageResults = [
  { fillHash: "0x8a3f…c912", agent: "Agent #0", model: "qwen-2.5-7b-instruct", score: 0.92, latency: "145ms", time: "2m ago" },
  { fillHash: "0xd1b7…4e08", agent: "Agent #2", model: "GLM-5-FP8", score: 0.67, latency: "312ms", time: "4m ago" },
  { fillHash: "0x3c9e…a5f1", agent: "Agent #0", model: "qwen-2.5-7b-instruct", score: 0.85, latency: "198ms", time: "7m ago" },
  { fillHash: "0xf204…7b3c", agent: "Agent #3", model: "GLM-5-FP8", score: 0.48, latency: "780ms", time: "12m ago" },
  { fillHash: "0x61aa…de90", agent: "Agent #2", model: "GLM-5-FP8", score: 0.73, latency: "425ms", time: "18m ago" },
  { fillHash: "0xb5c8…1f47", agent: "Agent #0", model: "qwen-2.5-7b-instruct", score: 0.51, latency: "620ms", time: "23m ago" },
];

const slashExplanations = [
  {
    fillHash: "0x8a3f…c912",
    text: "The DeFi solver fill was slashed due to a significant shortfall of 59.60% beyond the 1% tolerance. The solver executed USDC\u2192WETH at an effective rate 12 bps below the best available EBBO quote.",
  },
  {
    fillHash: "0xd1b7…4e08",
    text: "Marginal deviation detected: solver provided 0.3% worse execution than the reference EBBO quote. Score below auto-slash threshold \u2014 flagged for manual committee review.",
  },
  {
    fillHash: "0x61aa…de90",
    text: "Fill validated as compliant. Execution price within 0.08% of EBBO benchmark. No slashing action required. Bond returned to solver after 553-block cooldown.",
  },
];

function scoreColor(score: number): string {
  if (score > 0.7) return "#34d399";
  if (score >= 0.5) return "#f59e0b";
  return "#666";
}

export function ZeroGCompute() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white text-[14px] font-medium">0G Compute — Suspicion Triage</p>
          <p className="text-[11px] text-[#555] mt-0.5">AI model inference results for fill validation</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="live-dot" />
          <span className="text-[11px] text-[#555]">Live</span>
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Triaged (24h)</p>
          <p className="text-white text-lg font-medium">1,284</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Avg Score</p>
          <p className="text-[#00D4AA] text-lg font-medium">0.74</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Avg Latency</p>
          <p className="text-[#f59e0b] text-lg font-medium">413ms</p>
        </div>
      </div>

      {/* Triage results table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#222]">
              <th className="text-[10px] text-[#555] uppercase tracking-wider pb-2 font-medium">Fill Hash</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider pb-2 font-medium">Agent</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider pb-2 font-medium">Model</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider pb-2 font-medium">Score</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider pb-2 font-medium">Latency</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider pb-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {triageResults.map((row, i) => (
              <tr key={i} className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] transition-colors">
                <td className="py-2.5 text-[12px] font-mono text-[#6366f1]">{row.fillHash}</td>
                <td className="py-2.5 text-[12px] text-[#ccc]">{row.agent}</td>
                <td className="py-2.5 text-[11px] font-mono text-[#888]">{row.model}</td>
                <td className="py-2.5">
                  <span
                    className="text-[12px] font-semibold px-2 py-0.5 rounded"
                    style={{
                      color: scoreColor(row.score),
                      backgroundColor: `${scoreColor(row.score)}15`,
                    }}
                  >
                    {row.score.toFixed(2)}
                  </span>
                </td>
                <td className="py-2.5 text-[12px] font-mono text-[#888]">{row.latency}</td>
                <td className="py-2.5 text-[11px] text-[#555]">{row.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* NL Slash Explanations */}
      <div className="mt-5 pt-4 border-t border-[#1e1e1e]">
        <p className="text-[12px] text-[#888] font-medium mb-3">NL Slash Explanations</p>
        <div className="space-y-2">
          {slashExplanations.map((exp, i) => (
            <div
              key={i}
              className="border-l-2 pl-3 py-2 bg-[#1a1a1a] rounded-r-lg"
              style={{ borderLeftColor: i === 2 ? "#34d399" : i === 1 ? "#f59e0b" : "#ef4444" }}
            >
              <p className="text-[10px] font-mono text-[#555] mb-1">{exp.fillHash}</p>
              <p className="text-[12px] text-[#bbb] leading-relaxed">{exp.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
