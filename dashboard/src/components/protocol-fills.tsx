"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Token helpers ──────────────────────────────────────────────── */

const TOKEN_NAMES: Record<string, { symbol: string; decimals: number }> = {
  "0x868d2ea6d9885e3909ab82a9b5ac1ee02d50cf93": { symbol: "USDC", decimals: 6 },
  "0xb8d5d470ffc5d08cf3b0be5f6bce8dff54cc84d8": { symbol: "WETH", decimals: 18 },
};

function resolveToken(addr: string) {
  return TOKEN_NAMES[addr.toLowerCase()] ?? { symbol: addr.slice(0, 6), decimals: 18 };
}

function formatAmount(raw: string, decimals: number): string {
  const n = Number(BigInt(raw)) / 10 ** decimals;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals === 6 ? 2 : 6 });
}

function truncateHex(hex: string): string {
  if (hex.length <= 10) return hex;
  return `${hex.slice(0, 6)}...${hex.slice(-4)}`;
}

/* ── Types ──────────────────────────────────────────────────────── */

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

type FillStatus = "Clean" | "Slashable" | "Pending";

const statusColors: Record<FillStatus, string> = {
  Clean: "#34d399",
  Slashable: "#ef4444",
  Pending: "#f59e0b",
};

const tabs = ["All", "Slashable", "Clean"] as const;

const POLL_INTERVAL = 15_000;

/* ── Component ──────────────────────────────────────────────────── */

export function ProtocolFills() {
  const [fills, setFills] = useState<FillRecord[]>([]);
  const [challengedOrders, setChallengedOrders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("All");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [currentBlock, setCurrentBlock] = useState<number>(0);

  const fetchData = useCallback(async () => {
    try {
      const [fillsRes, challengesRes] = await Promise.all([
        fetch("/api/fills?limit=100"),
        fetch("/api/challenges?limit=200"),
      ]);

      if (!fillsRes.ok) throw new Error("Failed to fetch fills");

      const fillsData: FillRecord[] = await fillsRes.json();
      setFills(fillsData);

      // Track which orders have been challenged
      if (challengesRes.ok) {
        const challengesData: { orderHash: string }[] = await challengesRes.json();
        setChallengedOrders(new Set(challengesData.map((c) => c.orderHash)));
      }

      // Estimate current block from the most recent fill
      if (fillsData.length > 0) {
        const latest = fillsData[0];
        const elapsed = Math.floor(Date.now() / 1000) - latest.fillTimestamp;
        setCurrentBlock(latest.fillBlock + Math.floor(elapsed / 2)); // ~2s block time
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData]);

  /* Derive status for a fill */
  function getStatus(fill: FillRecord): FillStatus {
    if (challengedOrders.has(fill.orderHash)) return "Slashable";
    if (currentBlock > 0 && currentBlock >= fill.challengeDeadline) return "Clean";
    return "Pending";
  }

  const filtered =
    activeTab === "All"
      ? fills
      : fills.filter((f) => getStatus(f) === activeTab);

  /* ── Loading state ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white text-[14px] font-medium">Fill Records</p>
        </div>
        <p className="text-[#555] text-[12px]">Loading...</p>
      </div>
    );
  }

  /* ── Error state ────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white text-[14px] font-medium">Fill Records</p>
        </div>
        <p className="text-[#ef4444] text-[12px]">Error: {error}</p>
      </div>
    );
  }

  /* ── Empty state ────────────────────────────────────────────── */
  if (fills.length === 0) {
    return (
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white text-[14px] font-medium">Fill Records</p>
        </div>
        <p className="text-[#555] text-[12px]">No fills recorded yet</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <p className="text-white text-[14px] font-medium">Fill Records</p>
          <span className="text-[10px] font-mono bg-[#1a1a1a] text-[#888] px-2 py-0.5 rounded-full">
            {fills.length}
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
              activeTab === tab
                ? "bg-[#1a1a1a] text-white"
                : "text-[#555] hover:text-[#888]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#222]">
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Order Hash</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Solver</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Pair</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Input</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Output</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Fill Block</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2 pr-3">Status</th>
              <th className="text-[10px] text-[#555] uppercase tracking-wider font-medium pb-2">Deadline</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((fill, i) => {
              const tokenIn = resolveToken(fill.tokenIn);
              const tokenOut = resolveToken(fill.tokenOut);
              const status = getStatus(fill);

              return (
                <>
                  <tr
                    key={fill.orderHash}
                    onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                    className="border-b border-[#1a1a1a] hover:bg-[#1a1a1a] cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pr-3 text-[12px] font-mono text-[#888]">{truncateHex(fill.orderHash)}</td>
                    <td className="py-2.5 pr-3 text-[12px] text-[#6366f1] font-medium">{truncateHex(fill.fillerNamehash)}</td>
                    <td className="py-2.5 pr-3 text-[12px] text-white">{tokenIn.symbol}/{tokenOut.symbol}</td>
                    <td className="py-2.5 pr-3 text-[12px] font-mono text-[#ccc]">{formatAmount(fill.inputAmount, tokenIn.decimals)} {tokenIn.symbol}</td>
                    <td className="py-2.5 pr-3 text-[12px] font-mono text-[#ccc]">{formatAmount(fill.outputAmount, tokenOut.decimals)} {tokenOut.symbol}</td>
                    <td className="py-2.5 pr-3 text-[12px] font-mono text-[#888]">{fill.fillBlock.toLocaleString()}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                        style={{
                          color: statusColors[status],
                          background: `${statusColors[status]}15`,
                        }}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="py-2.5 text-[11px] font-mono text-[#555]">Block {fill.challengeDeadline.toLocaleString()}</td>
                  </tr>
                  {expandedRow === i && (
                    <tr key={`${fill.orderHash}-detail`} className="border-b border-[#1a1a1a]">
                      <td colSpan={8} className="py-3 px-4">
                        <div className="bg-[#1a1a1a] rounded-lg p-4">
                          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">EBBO Details</p>
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <p className="text-[10px] text-[#555]">Tolerance BPS</p>
                              <p className="text-[13px] font-mono text-white">{fill.eboToleranceBps} bps</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#555]">Raw Input</p>
                              <p className="text-[13px] font-mono text-white">{fill.inputAmount}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-[#555]">Raw Output</p>
                              <p className="text-[13px] font-mono text-white">{fill.outputAmount}</p>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
