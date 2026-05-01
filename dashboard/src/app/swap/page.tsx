"use client";

import { useState } from "react";

/* ─── Token data ─── */
const tokens = [
  { symbol: "WETH", name: "Wrapped Ether", color: "#627EEA", balance: "2.4821", usdPrice: 3245.67 },
  { symbol: "USDC", name: "USD Coin", color: "#2775CA", balance: "5,231.45", usdPrice: 1.0 },
  { symbol: "DAI", name: "Dai Stablecoin", color: "#F5AC37", balance: "1,892.10", usdPrice: 1.0 },
];

/* ─── Solver quotes ─── */
const solverQuotes = [
  { name: "alice.solvers", output: "2,450.32", gas: "$0.12", time: "2s", best: true },
  { name: "bob.solvers", output: "2,447.88", gas: "$0.15", time: "3s", best: false },
  { name: "carol.solvers", output: "2,443.01", gas: "$0.09", time: "5s", best: false },
];

/* ─── Order steps ─── */
const orderSteps = [
  { label: "Submitted", done: true },
  { label: "Picked up by solver", done: true },
  { label: "Filled", done: true },
  { label: "Verified by EBBO", done: false },
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

/* ─── Token selector dropdown ─── */
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
              onClick={() => {
                onSelect(t);
                onToggle();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#222] transition-colors ${
                t.symbol === selected.symbol ? "bg-[#222]" : ""
              }`}
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

/* ─── Settings gear icon ─── */
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.8" className="cursor-pointer hover:stroke-[#888] transition-colors">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export default function SwapPage() {
  const [payToken, setPayToken] = useState(tokens[0]);
  const [receiveToken, setReceiveToken] = useState(tokens[1]);
  const [payAmount, setPayAmount] = useState("0.75");
  const [payDropdownOpen, setPayDropdownOpen] = useState(false);
  const [receiveDropdownOpen, setReceiveDropdownOpen] = useState(false);
  const [selectedSolver, setSelectedSolver] = useState("alice.solvers");

  const connected = false;

  /* Compute estimated output based on mock USD prices */
  const numericPay = parseFloat(payAmount) || 0;
  const estimatedOutput = numericPay * (payToken.usdPrice / receiveToken.usdPrice);
  const formattedOutput = estimatedOutput.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  /* Swap direction */
  const handleFlip = () => {
    setPayToken(receiveToken);
    setReceiveToken(payToken);
  };

  return (
    <div className="p-5 flex flex-col items-center">
      {/* Header */}
      <div className="w-full max-w-md mb-6">
        <h1 className="text-2xl font-semibold text-white">Swap</h1>
        <p className="text-[13px] text-[#666] mt-1">
          Submit fills through UniswapX solvers with automatic EBBO validation
        </p>
      </div>

      {/* ── Swap Card ── */}
      <div className="card p-5 w-full max-w-md">
        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Swap</h2>
          <GearIcon />
        </div>

        {/* ── You pay ── */}
        <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1e1e1e]">
          <p className="text-[12px] text-[#555] mb-2">You pay</p>
          <div className="flex items-center justify-between gap-3">
            <TokenSelector
              selected={payToken}
              onSelect={setPayToken}
              open={payDropdownOpen}
              onToggle={() => {
                setPayDropdownOpen(!payDropdownOpen);
                setReceiveDropdownOpen(false);
              }}
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
              Balance: <span className="text-[#888]">{payToken.balance}</span>
            </p>
            <p className="text-[11px] text-[#555]">
              ~${(numericPay * payToken.usdPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* ── Swap direction button ── */}
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

        {/* ── You receive ── */}
        <div className="bg-[#0a0a0a] rounded-xl p-4 border border-[#1e1e1e]">
          <p className="text-[12px] text-[#555] mb-2">You receive</p>
          <div className="flex items-center justify-between gap-3">
            <TokenSelector
              selected={receiveToken}
              onSelect={setReceiveToken}
              open={receiveDropdownOpen}
              onToggle={() => {
                setReceiveDropdownOpen(!receiveDropdownOpen);
                setPayDropdownOpen(false);
              }}
            />
            <p className="text-white text-right text-[28px] font-medium flex-1 truncate">
              {numericPay > 0 ? formattedOutput : "0"}
            </p>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-[#555]">Estimated output</p>
            <p className="text-[11px] text-[#555]">
              ~${(estimatedOutput * receiveToken.usdPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* ── Solver Quotes ── */}
        <div className="mt-4">
          <p className="text-[12px] text-[#555] mb-2.5">Solver Quotes</p>
          <div className="flex flex-col gap-2">
            {solverQuotes.map((q) => (
              <button
                key={q.name}
                onClick={() => setSelectedSolver(q.name)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors text-left ${
                  selectedSolver === q.name
                    ? "border-[#00D4AA]/60 bg-[#00D4AA]/5"
                    : "border-[#1e1e1e] bg-[#0a0a0a] hover:border-[#333]"
                }`}
              >
                <div className="flex items-center gap-2">
                  {q.best && (
                    <span className="text-[9px] font-bold text-[#00D4AA] bg-[#00D4AA]/10 px-1.5 py-0.5 rounded">
                      BEST
                    </span>
                  )}
                  <span className="text-[13px] text-[#ccc] font-mono">{q.name}</span>
                </div>
                <div className="flex items-center gap-4 text-[12px]">
                  <span className="text-white font-medium">{q.output} <span className="text-[#555]">{receiveToken.symbol}</span></span>
                  <span className="text-[#555]">{q.gas} gas</span>
                  <span className="text-[#555]">{q.time}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── Swap button ── */}
        <button
          disabled={connected ? false : true}
          className={`w-full mt-4 py-3.5 rounded-lg text-[15px] font-semibold transition-all ${
            connected
              ? "bg-[#00D4AA] text-black hover:opacity-90 cursor-pointer"
              : "bg-[#1a1a1a] text-[#555] border border-[#222] cursor-not-allowed"
          }`}
        >
          {connected ? "Swap" : "Connect Wallet"}
        </button>
      </div>

      {/* ── Order Status Tracker ── */}
      <div className="card p-5 w-full max-w-md mt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium text-[14px]">Order Status</h3>
          <span className="text-[11px] font-mono text-[#555] bg-[#1a1a1a] px-2 py-0.5 rounded">
            0x4a8f...c2d1
          </span>
        </div>

        {/* Stepper */}
        <div className="flex items-center justify-between">
          {orderSteps.map((step, i) => (
            <div key={step.label} className="flex items-center flex-1 last:flex-none">
              {/* Dot */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    step.done
                      ? "bg-[#00D4AA]"
                      : "border-2 border-[#333] bg-transparent"
                  }`}
                >
                  {step.done && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <p
                  className={`text-[10px] mt-1.5 text-center whitespace-nowrap ${
                    step.done ? "text-[#00D4AA]" : "text-[#444]"
                  }`}
                >
                  {step.label}
                </p>
              </div>

              {/* Line */}
              {i < orderSteps.length - 1 && (
                <div
                  className={`h-[2px] flex-1 mx-1.5 mt-[-18px] rounded-full ${
                    orderSteps[i + 1].done ? "bg-[#00D4AA]" : "bg-[#222]"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Order details */}
        <div className="mt-4 pt-3 border-t border-[#1e1e1e] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="live-dot" />
            <span className="text-[12px] text-[#888]">Filled by <span className="text-[#ccc] font-mono">alice.solvers</span></span>
          </div>
          <span className="text-[11px] text-[#555]">12s ago</span>
        </div>
      </div>
    </div>
  );
}
