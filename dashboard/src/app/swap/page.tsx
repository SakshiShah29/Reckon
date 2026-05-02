"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const SOLVER_URL = process.env.NEXT_PUBLIC_SOLVER_URL ?? "http://localhost:3000";

/* ─── Types ─── */
interface FillResult {
  txHash: string;
  orderHash: string;
  fillBlock: number;
  solver: string;
  inputAmount: string;
  outputAmount: string;
  benchmarkPrice: string;
  swapper: string;
}

interface SolverHealth {
  solver: string;
  status: string;
  wethBalance: string;
}

type SwapStep = "idle" | "signing" | "submitted" | "filling" | "filled" | "error";

/* ─── Token data ─── */
const tokens = [
  { symbol: "WETH", name: "Wrapped Ether", color: "#627EEA", decimals: 18 },
  { symbol: "USDC", name: "USD Coin", color: "#2775CA", decimals: 6 },
];

/* ─── Token icon ─── */
function TokenIcon({ symbol, color, size = 28 }: { symbol: string; color: string; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, backgroundColor: color, fontSize: size * 0.38 }}
    >
      {symbol[0]}
    </div>
  );
}

/* ─── Token selector ─── */
function TokenSelector({
  selected,
  onSelect,
  open,
  onToggle,
}: {
  selected: (typeof tokens)[0];
  onSelect: (t: (typeof tokens)[0]) => void;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#333] rounded-xl px-3 py-2 transition-colors"
      >
        <TokenIcon symbol={selected.symbol} color={selected.color} size={24} />
        <span className="text-white font-medium text-[15px]">{selected.symbol}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-[#1a1a1a] border border-[#333] rounded-xl overflow-hidden z-50 shadow-xl shadow-black/40">
          {tokens.map((t) => (
            <button
              key={t.symbol}
              onClick={() => { onSelect(t); onToggle(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#222] transition-colors ${t.symbol === selected.symbol ? "bg-[#222]" : ""}`}
            >
              <TokenIcon symbol={t.symbol} color={t.color} size={24} />
              <div className="text-left">
                <p className="text-white text-[13px] font-medium">{t.symbol}</p>
                <p className="text-[#555] text-[11px]">{t.name}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Gear icon ─── */
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.8" className="cursor-pointer hover:stroke-[#888] transition-colors">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function SwapPage() {
  const [payToken, setPayToken] = useState(tokens[0]);
  const [receiveToken, setReceiveToken] = useState(tokens[1]);
  const [payAmount, setPayAmount] = useState("0.75");
  const [payDropdownOpen, setPayDropdownOpen] = useState(false);
  const [receiveDropdownOpen, setReceiveDropdownOpen] = useState(false);
  const [step, setStep] = useState<SwapStep>("idle");
  const [result, setResult] = useState<FillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<SolverHealth | null>(null);
  const stepTimers = useRef<NodeJS.Timeout[]>([]);

  // Check solver health
  useEffect(() => {
    fetch(`${SOLVER_URL}/health`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => d && setHealth(d))
      .catch(() => setHealth(null));
  }, []);

  /* Price estimate */
  const wethPrice = 2500;
  const numericPay = parseFloat(payAmount) || 0;
  const estimatedOutput =
    payToken.symbol === "WETH"
      ? numericPay * wethPrice
      : numericPay / wethPrice;
  const formattedOutput = estimatedOutput.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: receiveToken.symbol === "WETH" ? 6 : 2,
  });

  const handleFlip = () => {
    setPayToken(receiveToken);
    setReceiveToken(payToken);
  };

  /*
   * Submit swap:
   *  1. Frontend → POST /api/swap (Next.js API route)
   *  2. API route builds + signs the order (swapper side)
   *  3. API route POSTs to solver's /fill endpoint
   *  4. Solver picks it up, validates, fills on-chain
   *  5. Result flows back
   */
  const handleSwap = useCallback(async () => {
    stepTimers.current.forEach(clearTimeout);
    stepTimers.current = [];
    setError(null);
    setResult(null);
    setStep("signing");

    // Show realistic multi-step progress while the actual call runs
    const t1 = setTimeout(() => setStep("submitted"), 900);
    const t2 = setTimeout(() => setStep("filling"), 2500);
    stepTimers.current.push(t1, t2);

    try {
      const res = await fetch("/api/swap", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Swap failed");
      }

      stepTimers.current.forEach(clearTimeout);
      stepTimers.current = [];
      setResult(data);
      setStep("filled");

      // Refresh health
      fetch(`${SOLVER_URL}/health`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => d && setHealth(d))
        .catch(() => {});
    } catch (err: any) {
      stepTimers.current.forEach(clearTimeout);
      stepTimers.current = [];
      setError(err.message || "Failed to execute swap");
      setStep("error");
    }
  }, []);

  /* Pipeline steps */
  const pipelineSteps = [
    { label: "Signing order", key: "signing" },
    { label: "Submitted to solver", key: "submitted" },
    { label: "Filling on-chain", key: "filling" },
    { label: "Filled", key: "filled" },
  ];
  const stepOrder: SwapStep[] = ["signing", "submitted", "filling", "filled"];
  const currentStepIdx = stepOrder.indexOf(step);
  const canSwap = numericPay > 0 && !!health && step === "idle";

  return (
    <div className="p-5 flex flex-col items-center">
      {/* Header */}
      <div className="w-full max-w-md mb-6">
        <h1 className="text-[20px] font-semibold text-white/90 tracking-tight">Swap</h1>
        <p className="text-[13px] text-white/35 mt-1">
          Submit intent-based orders filled by UniswapX solvers with EBBO validation
        </p>
      </div>

      {/* ── Swap Card ── */}
      <div className="card p-5 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Swap</h2>
          <div className="flex items-center gap-3">
            {health ? (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#34d399]" />
                <span className="text-[10px] text-[#555]">{shortAddr(health.solver)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-[#FF6B6B]" />
                <span className="text-[10px] text-[#555]">Solver offline</span>
              </div>
            )}
            <GearIcon />
          </div>
        </div>

        {/* You pay */}
        <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1e1e1e]">
          <p className="text-[12px] text-[#555] mb-2">You pay</p>
          <div className="flex items-center justify-between gap-3">
            <TokenSelector
              selected={payToken}
              onSelect={setPayToken}
              open={payDropdownOpen}
              onToggle={() => { setPayDropdownOpen(!payDropdownOpen); setReceiveDropdownOpen(false); }}
            />
            <input
              type="text"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="bg-transparent text-white text-right text-[28px] font-medium w-full outline-none placeholder-[#333]"
              placeholder="0"
            />
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-[#555]">
              ~${(numericPay * (payToken.symbol === "WETH" ? wethPrice : 1)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Swap button */}
        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={handleFlip}
            className="w-9 h-9 rounded-lg bg-[#141414] border border-[#333] flex items-center justify-center hover:bg-[#1a1a1a] hover:border-[#444] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <polyline points="19 12 12 19 5 12" />
            </svg>
          </button>
        </div>

        {/* You receive */}
        <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1e1e1e]">
          <p className="text-[12px] text-[#555] mb-2">You receive</p>
          <div className="flex items-center justify-between gap-3">
            <TokenSelector
              selected={receiveToken}
              onSelect={setReceiveToken}
              open={receiveDropdownOpen}
              onToggle={() => { setReceiveDropdownOpen(!receiveDropdownOpen); setPayDropdownOpen(false); }}
            />
            <p className="text-white text-right text-[28px] font-medium flex-1 truncate">
              {numericPay > 0 ? formattedOutput : "0"}
            </p>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-[#555]">Estimated output</p>
            <p className="text-[11px] text-[#555]">
              ~${(estimatedOutput * (receiveToken.symbol === "WETH" ? wethPrice : 1)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Route info */}
        {numericPay > 0 && step === "idle" && (
          <div className="mt-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#555]">Route</span>
              <span className="text-[11px] text-[#888]">{payToken.symbol} → Permit2 → Reactor → {receiveToken.symbol}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#555]">Validation</span>
              <span className="text-[11px] text-[#888]">EBBO Oracle (1% tolerance)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#555]">Protection</span>
              <span className="text-[11px] text-[#00D4AA]">Automatic slash if underfilled</span>
            </div>
          </div>
        )}

        {/* Swap button */}
        <button
          onClick={handleSwap}
          disabled={!canSwap}
          className={`w-full mt-4 py-3.5 rounded-lg text-[15px] font-semibold transition-all ${
            canSwap
              ? "bg-[#00D4AA] text-black hover:opacity-90 cursor-pointer"
              : step !== "idle" && step !== "error" && step !== "filled"
              ? "bg-[#1a1a1a] text-[#555] border border-[#222] cursor-wait"
              : "bg-[#1a1a1a] text-[#555] border border-[#222] cursor-not-allowed"
          }`}
        >
          {step === "idle" || step === "filled" || step === "error" ? (
            !health ? "Solver offline" :
            numericPay <= 0 ? "Enter an amount" :
            "Swap"
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {step === "signing" && "Signing order..."}
              {step === "submitted" && "Solver picking up..."}
              {step === "filling" && "Filling on-chain..."}
            </span>
          )}
        </button>

        {error && (
          <div className="mt-3 p-3 rounded-lg bg-[#FF6B6B]/10 border border-[#FF6B6B]/20">
            <p className="text-[12px] text-[#FF6B6B]">{error}</p>
            <button
              onClick={() => { setError(null); setStep("idle"); }}
              className="text-[11px] text-[#888] mt-1 hover:text-white transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>

      {/* ── Order Status Tracker ── */}
      {step !== "idle" && step !== "error" && (
        <div className="card p-5 w-full max-w-md mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-medium text-[14px]">Order Status</h3>
            {result && (
              <span className="text-[11px] font-mono text-[#555] bg-[#1a1a1a] px-2 py-0.5 rounded">
                {result.orderHash.slice(0, 6)}...{result.orderHash.slice(-4)}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between">
            {pipelineSteps.map((ps, i) => {
              const done = i < currentStepIdx || step === "filled";
              const active = i === currentStepIdx && step !== "filled";
              return (
                <div key={ps.key} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all ${
                        done ? "bg-[#00D4AA]" : active ? "border-2 border-[#00D4AA] animate-pulse" : "border-2 border-[#333] bg-transparent"
                      }`}
                    >
                      {done && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <p className={`text-[10px] mt-1.5 text-center whitespace-nowrap ${done ? "text-[#00D4AA]" : active ? "text-[#ccc]" : "text-[#444]"}`}>
                      {ps.label}
                    </p>
                  </div>
                  {i < pipelineSteps.length - 1 && (
                    <div className={`h-[2px] flex-1 mx-1.5 mt-[-18px] rounded-full transition-all ${i < currentStepIdx || step === "filled" ? "bg-[#00D4AA]" : "bg-[#222]"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {result && (
            <div className="mt-4 pt-3 border-t border-[#1e1e1e]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="live-dot" />
                  <span className="text-[12px] text-[#888]">
                    Filled by <span className="text-[#ccc] font-mono">{shortAddr(result.solver)}</span>
                  </span>
                </div>
                <span className="text-[11px] text-[#555]">just now</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#444]">Transaction</span>
                  <span className="text-[10px] font-mono text-[#00D4AA]">
                    {result.txHash.slice(0, 10)}...{result.txHash.slice(-6)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#444]">Block</span>
                  <span className="text-[10px] font-mono text-[#888]">{result.fillBlock}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#444]">Received</span>
                  <span className="text-[10px] font-mono text-[#ccc]">
                    {(Number(result.outputAmount) / 1e6).toFixed(2)} USDC
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
