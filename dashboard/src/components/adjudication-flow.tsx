"use client";

import { useState, useEffect, useCallback } from "react";

/* ── Solver Badge (linkable to explorer) ─────────────────────── */

function SolverBadge({ ensName, namehash, address }: { ensName?: string; namehash?: string; address?: string }) {
  const displayName = ensName || (namehash ? truncHex(namehash) : truncHex(address ?? ""));
  const explorerUrl = address ? `https://sepolia.basescan.org/address/${address}` : null;

  const inner = (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5F3FF] border-2 border-[#DDD6FE] text-[11px] font-bold text-[#7C3AED] hover:bg-[#EDE9FE] hover:shadow-[3px_3px_0_#DDD6FE] hover:translate-x-[-1px] hover:translate-y-[-1px] transition-all duration-200 cursor-pointer">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      </svg>
      {displayName}
      {explorerUrl && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2.5" strokeLinecap="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      )}
    </span>
  );

  if (explorerUrl) {
    return <a href={explorerUrl} target="_blank" rel="noopener noreferrer">{inner}</a>;
  }
  return inner;
}

/* ── Types ────────────────────────────────────────────────────── */

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
  reputationPenalty?: string;
  challengerNamehash: string;
  agentTokenId: string;
  slashAmount: string;
  swapperRestitution: string;
  ownerBounty: string;
  protocolCut: string;
  swapperAddress?: string;
  ownerAddress?: string;
  protocolAddress?: string;
  nlExplanation: string;
  timestamp: number;
  txHash: string;
}

/* ── Helpers ──────────────────────────────────────────────────── */

function truncHex(hex: string | undefined | null): string {
  if (!hex) return "N/A";
  if (hex.length <= 12) return hex;
  return `${hex.slice(0, 6)}\u2026${hex.slice(-4)}`;
}

function fmtUsdc(raw: string): string {
  try {
    const n = Number(BigInt(raw)) / 1e6;
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  } catch {
    return "0.00";
  }
}

function fmtRelTime(ts: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const PIPELINE_STEPS = [
  { label: "EBBO", color: "#8B5CF6", desc: "Benchmark price" },
  { label: "Compare", color: "#F472B6", desc: "actual vs expected" },
  { label: "Adjudicate", color: "#FBBF24", desc: "On-chain verdict" },
  { label: "Slash", color: "#EF4444", desc: "Bond slashed" },
  { label: "Distribute", color: "#34D399", desc: "60 / 30 / 10" },
];

/* ── Expanded Row Detail ─────────────────────────────────────── */

function RowDetail({ challenge, slash }: { challenge: ChallengeRecord; slash?: SlashDocRecord }) {
  const succeeded = challenge.succeeded;

  return (
    <div className="px-4 pb-4 pt-1 space-y-3">
      {/* EBBO comparison */}
      <div className="grid grid-cols-3 gap-4 bg-[#F8FAFC] rounded-xl p-3 border border-[#E2E8F0]">
        <div>
          <p className="text-[10px] text-[#94A3B8] font-semibold uppercase">Expected Output</p>
          <p className="text-[13px] font-mono font-bold text-[#1E293B]">
            {challenge.benchmarkOutput ? `$${fmtUsdc(challenge.benchmarkOutput)} USDC` : "N/A"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#94A3B8] font-semibold uppercase">Actual Output</p>
          <p className={`text-[13px] font-mono font-bold ${succeeded ? "text-[#DC2626]" : "text-[#059669]"}`}>
            {challenge.actualOutput ? `$${fmtUsdc(challenge.actualOutput)} USDC` : "N/A"}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-[#94A3B8] font-semibold uppercase">Tolerance</p>
          <p className="text-[13px] font-mono font-bold text-[#1E293B]">{challenge.eboToleranceBps} bps</p>
        </div>
      </div>

      {/* Split rows (only for successful slashes) */}
      {succeeded && slash && (
        <div className="bg-[#F8FAFC] rounded-xl p-3 border border-[#E2E8F0]">
          <p className="text-[10px] text-[#94A3B8] font-semibold uppercase mb-2">Bond Redistribution</p>
          <div className="flex gap-0.5 h-4 rounded-full overflow-hidden border-2 border-[#1E293B] mb-3">
            <div className="h-full rounded-l-full" style={{ width: "60%", background: "#34D399" }} />
            <div className="h-full" style={{ width: "30%", background: "#8B5CF6" }} />
            <div className="h-full rounded-r-full" style={{ width: "10%", background: "#FBBF24" }} />
          </div>
          <div className="space-y-2">
            {/* Swapper row */}
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "#34D399" }} />
              <span className="text-[11px] font-semibold text-[#059669] w-[70px] flex-shrink-0">Swapper 60%</span>
              <span className="text-[12px] font-mono font-bold text-[#059669]">${fmtUsdc(slash.swapperRestitution)}</span>
              <span className="text-[10px] text-[#94A3B8] mx-1">&rarr;</span>
              {slash.swapperAddress ? (
                <a href={`https://sepolia.basescan.org/address/${slash.swapperAddress}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-[#8B5CF6] hover:underline">
                  {truncHex(slash.swapperAddress)}
                </a>
              ) : <span className="text-[10px] font-mono text-[#94A3B8]">—</span>}
              <a href={`https://sepolia.basescan.org/tx/${slash.txHash}#eventlog`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-[#94A3B8] hover:text-[#8B5CF6] ml-auto flex-shrink-0">
                tx &rarr;
              </a>
            </div>
            {/* Owner row */}
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "#8B5CF6" }} />
              <span className="text-[11px] font-semibold text-[#7C3AED] w-[70px] flex-shrink-0">Owner 30%</span>
              <span className="text-[12px] font-mono font-bold text-[#7C3AED]">${fmtUsdc(slash.ownerBounty)}</span>
              <span className="text-[10px] text-[#94A3B8] mx-1">&rarr;</span>
              <span className="text-[10px] text-[#64748B] italic">Held in RoyaltyDistributor — claimable by iNFT owner</span>
              <a href={`https://sepolia.basescan.org/tx/${slash.txHash}#eventlog`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-[#94A3B8] hover:text-[#8B5CF6] ml-auto flex-shrink-0">
                tx &rarr;
              </a>
            </div>
            {/* Protocol row */}
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "#FBBF24" }} />
              <span className="text-[11px] font-semibold text-[#D97706] w-[70px] flex-shrink-0">Protocol 10%</span>
              <span className="text-[12px] font-mono font-bold text-[#D97706]">${fmtUsdc(slash.protocolCut)}</span>
              <span className="text-[10px] text-[#94A3B8] mx-1">&rarr;</span>
              {slash.protocolAddress ? (
                <a href={`https://sepolia.basescan.org/address/${slash.protocolAddress}`} target="_blank" rel="noopener noreferrer" className="text-[10px] font-mono text-[#8B5CF6] hover:underline">
                  {truncHex(slash.protocolAddress)}
                </a>
              ) : <span className="text-[10px] font-mono text-[#94A3B8]">—</span>}
              <a href={`https://sepolia.basescan.org/tx/${slash.txHash}#eventlog`} target="_blank" rel="noopener noreferrer" className="text-[9px] text-[#94A3B8] hover:text-[#8B5CF6] ml-auto flex-shrink-0">
                tx &rarr;
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Reputation impact (only for successful slashes) */}
      {succeeded && slash && (
        <div className="flex items-center gap-2 flex-wrap bg-[#FEF2F2] rounded-xl px-3 py-2.5 border border-[#FECACA]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" className="flex-shrink-0">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
          <span className="text-[11px] font-semibold text-[#DC2626]">Reputation &minus;5%</span>
          <span className="text-[10px] text-[#64748B]">for solver</span>
          <SolverBadge
            ensName={slash.solverEnsName}
            namehash={slash.solverNamehash}
            address={slash.solverAddress}
          />
        </div>
      )}

      {/* Tx links */}
      <div className="flex items-center gap-4 text-[11px] flex-wrap">
        <a
          href={`https://sepolia.basescan.org/tx/${challenge.txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[#8B5CF6] hover:underline"
        >
          View on BaseScan &rarr;
        </a>
        {challenge.challengerAddress && (
          <a
            href={`https://sepolia.basescan.org/address/${challenge.challengerAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[#64748B] hover:underline"
          >
            Challenger: {truncHex(challenge.challengerAddress)}
          </a>
        )}
        {slash && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#64748B]">Solver:</span>
            <SolverBadge
              ensName={slash.solverEnsName}
              namehash={slash.solverNamehash}
              address={slash.solverAddress}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────── */

export function AdjudicationFlow() {
  const [challenges, setChallenges] = useState<ChallengeRecord[]>([]);
  const [slashDocs, setSlashDocs] = useState<SlashDocRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (hash: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
  };

  const fetchData = useCallback(async () => {
    try {
      const [chRes, slRes] = await Promise.all([
        fetch("/api/challenges?limit=20"),
        fetch("/api/slashes?limit=20"),
      ]);
      if (chRes.ok) setChallenges(await chRes.json());
      if (slRes.ok) setSlashDocs(await slRes.json());
    } catch {
      /* retry on next interval */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 15_000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const slashByOrder = new Map<string, SlashDocRecord>();
  for (const s of slashDocs) slashByOrder.set(s.orderHash, s);

  const succeeded = challenges.filter((c) => c.succeeded).length;
  const failed = challenges.length - succeeded;

  return (
    <div className="space-y-5">
      {/* ── Pipeline strip ─────────────────────────────────────── */}
      <div className="card p-4">
        <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">
          Adjudication Pipeline
        </p>
        <div className="flex items-center gap-0">
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.label} className="flex items-center">
              {i > 0 && (
                <svg width="20" height="12" viewBox="0 0 20 12" fill="none" className="flex-shrink-0 mx-1">
                  <path d="M0 6h16M13 2l4 4-4 4" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-[#1E293B]" style={{ background: step.color + "18" }}>
                <div className="w-2.5 h-2.5 rounded-full border-2 border-[#1E293B]" style={{ background: step.color }} />
                <span className="text-[11px] font-bold text-[#1E293B] whitespace-nowrap">{step.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl border-2 border-[#1E293B] flex items-center justify-center" style={{ background: "#8B5CF6" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </div>
          <div>
            <p className="text-[10px] text-[#94A3B8] font-semibold uppercase">Total</p>
            <p className="text-[20px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>{challenges.length}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl border-2 border-[#1E293B] flex items-center justify-center" style={{ background: "#34D399" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div>
            <p className="text-[10px] text-[#94A3B8] font-semibold uppercase">Slashed</p>
            <p className="text-[20px] font-bold text-[#059669]" style={{ fontFamily: "var(--font-heading)" }}>{succeeded}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl border-2 border-[#1E293B] flex items-center justify-center" style={{ background: "#EF4444" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </div>
          <div>
            <p className="text-[10px] text-[#94A3B8] font-semibold uppercase">Rejected</p>
            <p className="text-[20px] font-bold text-[#DC2626]" style={{ fontFamily: "var(--font-heading)" }}>{failed}</p>
          </div>
        </div>
      </div>

      {/* ── Challenge rows ─────────────────────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="icon-circle" style={{ background: "#EF4444", width: 32, height: 32, borderRadius: 10 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <p className="text-[14px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
              Challenge Outcomes
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="live-dot" />
            <span className="text-[10px] text-[#64748B] font-medium">Live</span>
          </div>
        </div>

        {loading && <p className="text-[13px] text-[#94A3B8] text-center py-6">Loading...</p>}

        {!loading && challenges.length === 0 && (
          <p className="text-[13px] text-[#94A3B8] text-center py-6">No challenges yet</p>
        )}

        <div className="divide-y-2 divide-[#F1F5F9]">
          {challenges.map((ch) => {
            const slash = slashByOrder.get(ch.orderHash);
            const isOpen = expanded.has(ch.txHash);
            const amt = fmtUsdc(ch.slashAmount);

            return (
              <div key={ch.txHash}>
                {/* Row */}
                <button
                  onClick={() => toggle(ch.txHash)}
                  className="w-full flex items-center gap-3 py-3 px-2 text-left hover:bg-[#F8FAFC] rounded-lg transition-colors duration-150"
                >
                  {/* Status dot */}
                  <div
                    className="w-3 h-3 rounded-full border-2 border-[#1E293B] flex-shrink-0"
                    style={{ background: ch.succeeded ? "#34D399" : "#EF4444" }}
                  />

                  {/* Order hash */}
                  <span className="text-[12px] font-mono font-bold text-[#1E293B] w-[100px] truncate flex-shrink-0">
                    {truncHex(ch.orderHash)}
                  </span>

                  {/* Badge */}
                  <span className={`badge ${ch.succeeded ? "badge-green" : "badge-red"} flex-shrink-0`}>
                    {ch.succeeded ? "Slashed" : "Rejected"}
                  </span>

                  {/* Amount */}
                  {ch.succeeded && (
                    <span className="text-[12px] font-mono font-bold text-[#DC2626] flex-shrink-0">
                      ${amt}
                    </span>
                  )}

                  {/* Agent */}
                  {ch.agentTokenId && (
                    <span className="badge badge-purple flex-shrink-0">
                      iNFT #{ch.agentTokenId}
                    </span>
                  )}

                  {/* Spacer */}
                  <span className="flex-1" />

                  {/* Time */}
                  <span className="text-[10px] text-[#94A3B8] font-medium flex-shrink-0">
                    {fmtRelTime(ch.challengeTimestamp)}
                  </span>

                  {/* Chevron */}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#94A3B8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className={`flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {/* Expandable detail */}
                {isOpen && <RowDetail challenge={ch} slash={slash} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Split legend (compact) ─────────────────────────────── */}
      <div className="card p-4">
        <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">
          Slash Distribution Rule
        </p>
        <div className="flex gap-0.5 h-6 rounded-full overflow-hidden border-2 border-[#1E293B]">
          <div className="h-full rounded-l-full flex items-center justify-center" style={{ width: "60%", background: "#34D399" }}>
            <span className="text-[10px] font-bold text-white">Swapper 60%</span>
          </div>
          <div className="h-full flex items-center justify-center" style={{ width: "30%", background: "#8B5CF6" }}>
            <span className="text-[10px] font-bold text-white">Owner 30%</span>
          </div>
          <div className="h-full rounded-r-full flex items-center justify-center" style={{ width: "10%", background: "#FBBF24" }}>
            <span className="text-[9px] font-bold text-white">10%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
