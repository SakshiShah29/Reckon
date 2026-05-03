"use client";

import { useState } from "react";
import { PartnerLogos } from "@/components/partner-logos";

/* ─── Types ─── */
interface SwapResult {
  txHash: string;
  orderHash: string;
  fillBlock: number;
  solver: string;
  inputAmount: string;
  outputAmount: string;
  fairOutput: string;
  benchmarkPrice: string;
  badFillPct: number;
  swapper: string;
}

type SwapStep = "idle" | "submitting" | "filled" | "error";

/* ─── Helpers ─── */
function truncAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatWei(wei: string, decimals = 4): string {
  const n = BigInt(wei);
  const whole = n / 10n ** 18n;
  const frac = (n % 10n ** 18n).toString().padStart(18, "0").slice(0, decimals);
  return `${whole}.${frac}`;
}

function formatUsdc(raw: string): string {
  const n = BigInt(raw);
  const whole = n / 1_000_000n;
  const frac = (n % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole.toLocaleString()}.${frac}` : whole.toLocaleString();
}

/* ─── Token Icon ─── */
function TokenIcon({ symbol, size = 32 }: { symbol: string; size?: number }) {
  const colors: Record<string, string> = { WETH: "#627EEA", USDC: "#2775CA", ETH: "#627EEA" };
  const color = colors[symbol] || "#8B5CF6";
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0 border-2 border-[#1E293B]"
      style={{ width: size, height: size, background: color, fontSize: size * 0.35 }}
    >
      {symbol === "WETH" ? "W" : symbol[0]}
    </div>
  );
}

/* ─── Pipeline Steps ─── */
const PIPELINE = [
  { label: "Build Order", color: "#8B5CF6" },
  { label: "Sign & Wrap", color: "#F472B6" },
  { label: "Submit", color: "#FBBF24" },
  { label: "Filled", color: "#34D399" },
];

function OrderProgress({ step, result }: { step: SwapStep; result: SwapResult | null }) {
  const filled = step === "filled";

  return (
    <div className="card card-green p-5 pop-in">
      <h3 className="text-[14px] font-bold text-[#1E293B] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
        Order Progress
      </h3>

      <div className="flex items-center justify-between mb-4">
        {PIPELINE.map((p, i) => {
          const done = filled || (step === "submitting" && i < 3);
          const active = step === "submitting" && i === 2;

          return (
            <div key={p.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border-2 transition-all"
                  style={{
                    background: done ? p.color : "transparent",
                    borderColor: done || active ? p.color : "#E2E8F0",
                    color: done ? "white" : active ? p.color : "#94A3B8",
                  }}
                >
                  {done ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <p className="text-[9px] mt-1 font-semibold whitespace-nowrap" style={{ color: done ? p.color : active ? "#1E293B" : "#94A3B8" }}>
                  {p.label}
                </p>
              </div>
              {i < PIPELINE.length - 1 && (
                <div className="h-[2px] flex-1 mx-1.5 mt-[-14px] rounded-full" style={{ background: done ? p.color : "#E2E8F0" }} />
              )}
            </div>
          );
        })}
      </div>

      {result && (
        <div className="p-3 rounded-xl bg-[#ECFDF5] border-2 border-[#A7F3D0] space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="live-dot" />
            <span className="text-[12px] font-semibold text-[#059669]">
              Filled by <span className="font-mono">{truncAddr(result.solver)}</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748B]">Transaction</span>
            <span className="text-[10px] font-mono text-[#059669]">{truncAddr(result.txHash)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748B]">Order Hash</span>
            <span className="text-[10px] font-mono text-[#64748B]">{truncAddr(result.orderHash)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748B]">Block</span>
            <span className="text-[10px] font-mono text-[#64748B]">{result.fillBlock}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748B]">Input</span>
            <span className="text-[10px] font-mono text-[#1E293B]">{formatWei(result.inputAmount)} WETH</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#64748B]">Output</span>
            <span className="text-[10px] font-mono text-[#1E293B]">{formatUsdc(result.outputAmount)} USDC</span>
          </div>
          {result.badFillPct < 100 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#64748B]">Fair Output</span>
              <span className="text-[10px] font-mono text-[#DC2626] line-through">{formatUsdc(result.fairOutput)} USDC</span>
            </div>
          )}
          <div className="mt-2 p-2 rounded-lg bg-[#F5F3FF] border border-[#DDD6FE]">
            <p className="text-[10px] text-[#7C3AED]">
              {result.badFillPct < 100
                ? "This was a bad fill — challenger agents should detect and slash within ~30 min."
                : "Challenge window is now open (~30 min). Challenger agents will verify this fill against EBBO."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Swap Page ─── */
export default function SwapPage() {
  const [amount, setAmount] = useState("0.01");
  const [badFill, setBadFill] = useState(false);
  const [step, setStep] = useState<SwapStep>("idle");
  const [result, setResult] = useState<SwapResult | null>(null);
  const [error, setError] = useState("");

  const numericAmt = parseFloat(amount) || 0;

  const handleSwap = async () => {
    if (numericAmt <= 0) return;
    setError("");
    setResult(null);
    setStep("submitting");

    try {
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          badFillPct: badFill ? 50 : 100,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Swap failed");

      setResult(data);
      setStep("filled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Swap failed");
      setStep("error");
    }
  };

  const canSwap = numericAmt > 0 && step === "idle";

  return (
    <div className="p-5">
      {/* Header */}
      <div className="mb-6 max-w-5xl mx-auto">
        <h1 className="text-[32px] font-extrabold text-[#1E293B] tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
          Swap
        </h1>
        <p className="text-[14px] text-[#64748B] mt-1">
          Simulate intent-based orders filled by UniswapX solvers with EBBO validation
        </p>
      </div>

      {/* Simulation notice */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl bg-[#F5F3FF] border-2 border-[#DDD6FE] max-w-5xl mx-auto">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
        <p className="text-[11px] text-[#7C3AED] font-medium">
          Swaps run on an Anvil fork of Base mainnet since UniswapX contracts are not deployed on Base Sepolia. No wallet needed — uses a demo swapper key server-side.
        </p>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-6 max-w-5xl mx-auto items-start">
        {/* Left: Swap Card */}
        <div className="flex-1 min-w-0">
          {/* Bad fill toggle */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${badFill ? "bg-[#EF4444]" : "bg-[#34D399]"}`} />
              <span className="text-[12px] font-semibold text-[#64748B]">
                {badFill ? "Bad fill mode (50%)" : "Honest fill (100%)"}
              </span>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-[11px] text-[#64748B] font-medium">Simulate bad fill</span>
              <div
                onClick={() => { setBadFill(!badFill); setStep("idle"); setResult(null); setError(""); }}
                className={`w-9 h-5 rounded-full border-2 transition-all cursor-pointer relative ${
                  badFill ? "bg-[#EF4444] border-[#DC2626]" : "bg-[#E2E8F0] border-[#CBD5E1]"
                }`}
              >
                <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[1px] transition-all shadow-sm ${
                  badFill ? "left-[16px]" : "left-[2px]"
                }`} />
              </div>
            </label>
          </div>

          {/* Swap Card */}
          <div className={`card ${badFill ? "card-pink" : "card-violet"} p-5`}>
            {/* You Pay */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border-2 border-[#E2E8F0]">
              <p className="text-[12px] text-[#64748B] font-semibold mb-2">You pay</p>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 bg-white rounded-xl border-2 border-[#1E293B] px-3 py-2 shadow-[2px_2px_0_#DDD6FE]">
                  <TokenIcon symbol="WETH" size={26} />
                  <span className="text-[15px] font-bold text-[#1E293B]">WETH</span>
                </div>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => { setAmount(e.target.value); setStep("idle"); setResult(null); setError(""); }}
                  className="bg-transparent text-[#1E293B] text-right text-[28px] font-bold w-full outline-none placeholder-[#CBD5E1]"
                  placeholder="0"
                  style={{ fontFamily: "var(--font-mono)" }}
                />
              </div>
              <p className="text-[11px] text-[#94A3B8] mt-2">
                Wraps ETH automatically if WETH balance is insufficient
              </p>
            </div>

            {/* Arrow */}
            <div className="flex justify-center -my-2.5 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-white border-2 border-[#1E293B] flex items-center justify-center shadow-[3px_3px_0_#DDD6FE] wiggle-hover cursor-default">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <polyline points="19 12 12 19 5 12" />
                </svg>
              </div>
            </div>

            {/* You Receive */}
            <div className="p-4 rounded-xl bg-[#F8FAFC] border-2 border-[#E2E8F0]">
              <p className="text-[12px] text-[#64748B] font-semibold mb-2">You receive</p>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 bg-white rounded-xl border-2 border-[#1E293B] px-3 py-2 shadow-[2px_2px_0_#FBCFE8]">
                  <TokenIcon symbol="USDC" size={26} />
                  <span className="text-[15px] font-bold text-[#1E293B]">USDC</span>
                </div>
                <p className="text-[#94A3B8] text-right text-[22px] font-bold flex-1 italic" style={{ fontFamily: "var(--font-mono)" }}>
                  {badFill ? "~50% of EBBO" : "~EBBO price"}
                </p>
              </div>
              {badFill && (
                <div className="mt-2">
                  <span className="badge badge-red text-[9px]">50% of fair price — will trigger slash</span>
                </div>
              )}
            </div>

            {/* Route info */}
            {numericAmt > 0 && (step === "idle" || step === "error") && (
              <div className="mt-4 p-3 rounded-xl bg-[#F1F5F9] border border-[#E2E8F0] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#64748B]">Route</span>
                  <span className="text-[11px] font-mono text-[#1E293B] font-medium">WETH → Permit2 → Reactor → USDC</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#64748B]">Validation</span>
                  <span className="text-[11px] text-[#8B5CF6] font-semibold">EBBO Oracle (1% tolerance)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#64748B]">Protection</span>
                  <span className="text-[11px] text-[#059669] font-semibold">Auto-slash if underfilled</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[#64748B]">Fill %</span>
                  <span className={`text-[11px] font-semibold ${badFill ? "text-[#DC2626]" : "text-[#059669]"}`}>
                    {badFill ? "50% (bad)" : "100% (honest)"}
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 p-3 rounded-xl bg-[#FEF2F2] border-2 border-[#FECACA]">
                <p className="text-[12px] text-[#DC2626] font-medium">{error}</p>
                <button
                  onClick={() => { setError(""); setStep("idle"); }}
                  className="text-[11px] text-[#64748B] mt-1 hover:text-[#1E293B] transition-colors underline"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Swap button */}
            <button
              onClick={handleSwap}
              disabled={!canSwap}
              className={`w-full mt-4 py-3.5 rounded-xl text-[15px] font-bold transition-all border-2 ${
                canSwap
                  ? "btn-primary"
                  : step === "submitting"
                  ? "bg-[#F1F5F9] text-[#94A3B8] border-[#E2E8F0] cursor-wait"
                  : "bg-[#F1F5F9] text-[#94A3B8] border-[#E2E8F0] cursor-not-allowed"
              }`}
            >
              {step === "idle" || step === "filled" || step === "error" ? (
                numericAmt <= 0 ? "Enter an amount" : badFill ? "Simulate Bad Fill" : "Simulate Swap"
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting to solver...
                </span>
              )}
            </button>
          </div>

          {/* Order progress */}
          {step !== "idle" && step !== "error" && (
            <div className="mt-5">
              <OrderProgress step={step} result={result} />
            </div>
          )}
        </div>

        {/* Right: How it works */}
        <div className="w-[340px] shrink-0">
          <div className="card card-amber p-5">
            <h3 className="text-[14px] font-bold text-[#1E293B] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
              How it works
            </h3>
            <div className="space-y-3">
              {[
                { num: "1", label: "Build Order", desc: "Reads EBBO benchmark from Base Sepolia, builds a UniswapX PriorityOrder" },
                { num: "2", label: "Sign & Wrap", desc: "Wraps ETH → WETH if needed, approves Permit2, signs EIP-712 typed data" },
                { num: "3", label: "Submit to Solver", desc: "POSTs the signed order to the solver's /fill endpoint" },
                { num: "4", label: "Fill & Validate", desc: "Solver fills on-chain. Relayer opens challenge window. Agents verify against EBBO." },
              ].map((s) => (
                <div key={s.num} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#FBBF24] border-2 border-[#1E293B] flex items-center justify-center text-[10px] font-bold text-[#1E293B] shrink-0 mt-0.5">
                    {s.num}
                  </div>
                  <div>
                    <p className="text-[12px] font-bold text-[#1E293B]">{s.label}</p>
                    <p className="text-[11px] text-[#64748B]">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Partner logos — full width bottom */}
      <div className="max-w-5xl mx-auto mt-8">
        <PartnerLogos />
      </div>
    </div>
  );
}
