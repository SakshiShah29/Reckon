"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Types ──────────────────────────────────────────────────────── */

interface ChallengeRecord {
  orderHash: string;
  challengerAddress: string;
  challengerNamehash: string;
  agentTokenId: string;
  benchmarkOutput: string;
  actualOutput: string;
  eboToleranceBps: number;
  succeeded: boolean;
  slashAmount: string;
  challengeBlock: number;
  challengeTimestamp: number;
  txHash: string;
}

interface SlashDocRecord {
  orderHash: string;
  solverNamehash: string;
  solverEnsName?: string;
  solverAddress?: string;
  challengerNamehash: string;
  agentTokenId: string;
  slashAmount: string;
  swapperRestitution: string;
  ownerBounty: string;
  protocolCut: string;
  nlExplanation: string;
  timestamp: number;
  txHash: string;
}

type ChallengeResult = "Slashed" | "Rejected" | "Pending";

const resultColors: Record<ChallengeResult, string> = {
  Slashed: "#ef4444",
  Rejected: "#555",
  Pending: "#f59e0b",
};

function truncateHex(hex: string): string {
  if (hex.length <= 10) return hex;
  return `${hex.slice(0, 6)}...${hex.slice(-4)}`;
}

/* ── Solver Badge ── */
function SolverBadge({ namehash, ensName, address }: { namehash?: string; ensName?: string; address?: string }) {
  const displayName = ensName || truncateHex(namehash ?? address ?? "");
  const explorerUrl = address ? `https://sepolia.basescan.org/address/${address}` : null;

  const badge = (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F5F3FF] border border-[#DDD6FE] text-[10px] font-bold text-[#7C3AED] hover:bg-[#EDE9FE] transition-all cursor-pointer">
      {displayName}
      {explorerUrl && (
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      )}
    </span>
  );

  if (explorerUrl) return <a href={explorerUrl} target="_blank" rel="noopener noreferrer">{badge}</a>;
  return badge;
}

function formatSlashAmount(raw: string): string {
  // Slash amounts are in USDC (6 decimals)
  const n = Number(BigInt(raw)) / 1e6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const POLL_INTERVAL = 15_000;

/* ── Component ──────────────────────────────────────────────────── */

export function ProtocolChallenges() {
  const [challenges, setChallenges] = useState<ChallengeRecord[]>([]);
  const [slashDocs, setSlashDocs] = useState<SlashDocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [challengesRes, slashesRes] = await Promise.all([
        fetch("/api/challenges?limit=50"),
        fetch("/api/slashes?limit=50"),
      ]);

      if (!challengesRes.ok) throw new Error("Failed to fetch challenges");
      if (!slashesRes.ok) throw new Error("Failed to fetch slashes");

      const challengesData: ChallengeRecord[] = await challengesRes.json();
      const slashesData: SlashDocRecord[] = await slashesRes.json();

      setChallenges(challengesData);
      setSlashDocs(slashesData);
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

  /* Build a lookup map: orderHash -> SlashDocRecord */
  const slashByOrder = new Map<string, SlashDocRecord>();
  for (const s of slashDocs) {
    slashByOrder.set(s.orderHash, s);
  }

  /* Derive challenge result */
  function getResult(ch: ChallengeRecord): ChallengeResult {
    if (ch.succeeded) return "Slashed";
    // If succeeded is explicitly false and a slash doc does NOT exist, it was rejected
    return "Rejected";
  }

  /* Stats */
  const openCount = challenges.filter((c) => !c.succeeded && slashByOrder.has(c.orderHash)).length;
  const wonCount = challenges.filter((c) => c.succeeded).length;
  const lostCount = challenges.filter((c) => !c.succeeded && !slashByOrder.has(c.orderHash)).length;
  const totalSlashed = challenges
    .filter((c) => c.succeeded)
    .reduce((sum, c) => {
      try {
        return sum + Number(BigInt(c.slashAmount)) / 1e6;
      } catch {
        return sum;
      }
    }, 0);

  /* ── Loading state ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="card p-5">
        <div className="mb-4">
          <p className="text-white text-[14px] font-medium">Challenge Lifecycle</p>
          <p className="text-[11px] text-[#555] mt-0.5">End-to-end challenge tracking from detection to resolution</p>
        </div>
        <p className="text-[#555] text-[12px]">Loading...</p>
      </div>
    );
  }

  /* ── Error state ────────────────────────────────────────────── */
  if (error) {
    return (
      <div className="card p-5">
        <div className="mb-4">
          <p className="text-white text-[14px] font-medium">Challenge Lifecycle</p>
          <p className="text-[11px] text-[#555] mt-0.5">End-to-end challenge tracking from detection to resolution</p>
        </div>
        <p className="text-[#ef4444] text-[12px]">Error: {error}</p>
      </div>
    );
  }

  /* ── Empty state ────────────────────────────────────────────── */
  if (challenges.length === 0) {
    return (
      <div className="card p-5">
        <div className="mb-4">
          <p className="text-white text-[14px] font-medium">Challenge Lifecycle</p>
          <p className="text-[11px] text-[#555] mt-0.5">End-to-end challenge tracking from detection to resolution</p>
        </div>
        <p className="text-[#555] text-[12px]">No challenges recorded yet</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      {/* Header */}
      <div className="mb-4">
        <p className="text-white text-[14px] font-medium">Challenge Lifecycle</p>
        <p className="text-[11px] text-[#555] mt-0.5">End-to-end challenge tracking from detection to resolution</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Open</p>
          <p className="text-[#f59e0b] text-lg font-medium">{openCount}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Won</p>
          <p className="text-[#34d399] text-lg font-medium">{wonCount}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Lost</p>
          <p className="text-[#ef4444] text-lg font-medium">{lostCount}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-lg px-3 py-2">
          <p className="text-[9px] text-[#555] uppercase tracking-wider">Total Slashed</p>
          <p className="text-white text-lg font-medium font-mono">${totalSlashed.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Challenge cards */}
      <div className="space-y-3">
        {challenges.map((ch, i) => {
          const result = getResult(ch);
          const slash = slashByOrder.get(ch.orderHash);
          const displayAmount = formatSlashAmount(ch.slashAmount);

          return (
            <div
              key={`${ch.orderHash}-${i}`}
              className="bg-[#1a1a1a] rounded-lg border border-[#222] hover:border-[#333] transition-colors"
            >
              {/* Card header */}
              <div
                onClick={() => setExpandedCard(expandedCard === i ? null : i)}
                className="flex items-center justify-between p-4 cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: resultColors[result] }}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-mono text-[#888]">{truncateHex(ch.orderHash)}</span>
                      <span className="text-[10px] text-[#444]">Agent #{ch.agentTokenId}</span>
                    </div>
                    <p className="text-[10px] text-[#444] mt-0.5">
                      Challenger: <span className="text-[#a78bfa]">{truncateHex(ch.challengerNamehash)}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      color: resultColors[result],
                      background: `${resultColors[result]}15`,
                    }}
                  >
                    {result === "Slashed" ? `Slashed $${displayAmount}` : result}
                  </span>
                  <span className="text-[10px] text-[#444] font-mono">{formatRelativeTime(ch.challengeTimestamp)}</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#555"
                    strokeWidth="2"
                    className={`transition-transform ${expandedCard === i ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </div>

              {/* Expanded content */}
              {expandedCard === i && (
                <div className="px-4 pb-4 border-t border-[#222]">
                  {/* EBBO comparison */}
                  <div className="bg-[#141414] rounded-lg p-3 mt-3 mb-3">
                    <p className="text-[10px] text-[#555] uppercase tracking-wider mb-2">EBBO Comparison</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] text-[#555]">Benchmark Output</p>
                        <p className="text-[13px] font-mono text-white">{ch.benchmarkOutput}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#555]">Actual Output</p>
                        <p className="text-[13px] font-mono text-white">{ch.actualOutput}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#555]">Tolerance BPS</p>
                        <p className="text-[13px] font-mono text-white">{ch.eboToleranceBps} bps</p>
                      </div>
                    </div>
                  </div>

                  {/* Tx hash */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] text-[#555]">Tx:</span>
                    <span className="text-[10px] text-[#888] font-mono">{truncateHex(ch.txHash)}</span>
                    <span className="text-[10px] text-[#555]">Block:</span>
                    <span className="text-[10px] text-[#888] font-mono">{ch.challengeBlock.toLocaleString()}</span>
                  </div>

                  {/* Slash distribution */}
                  {result === "Slashed" && slash && (
                    <div className="bg-[#141414] rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] text-[#555] uppercase tracking-wider">Slash Distribution</p>
                        <SolverBadge namehash={slash.solverNamehash} ensName={slash.solverEnsName} address={slash.solverAddress} />
                      </div>
                      <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-3">
                        <div className="h-full rounded-l-full" style={{ width: "60%", background: "#00D4AA" }} />
                        <div className="h-full" style={{ width: "30%", background: "#a78bfa" }} />
                        <div className="h-full rounded-r-full" style={{ width: "10%", background: "#f59e0b" }} />
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#00D4AA]" />
                          <div>
                            <p className="text-[10px] text-[#555]">Swapper (60%)</p>
                            <p className="text-[12px] font-mono text-white">${formatSlashAmount(slash.swapperRestitution)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#a78bfa]" />
                          <div>
                            <p className="text-[10px] text-[#555]">iNFT Owner (30%)</p>
                            <p className="text-[12px] font-mono text-white">${formatSlashAmount(slash.ownerBounty)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-[#f59e0b]" />
                          <div>
                            <p className="text-[10px] text-[#555]">Protocol (10%)</p>
                            <p className="text-[12px] font-mono text-white">${formatSlashAmount(slash.protocolCut)}</p>
                          </div>
                        </div>
                      </div>
                      {slash.nlExplanation && (
                        <div className="mt-3 pt-3 border-t border-[#222]">
                          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Explanation</p>
                          <p className="text-[11px] text-[#888]">{slash.nlExplanation}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {result === "Rejected" && (
                    <div className="bg-[#141414] rounded-lg p-3">
                      <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Result</p>
                      <p className="text-[12px] text-[#888]">Challenge rejected -- fill was within EBBO tolerance. No slash applied.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
