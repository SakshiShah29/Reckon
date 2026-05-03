"use client";

import { useState, useEffect, useCallback } from "react";

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

/* ── Static: How Protocol Decides ─────────────────────────────── */

function ProtocolDecisionCard() {
  return (
    <div className="card card-violet p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-circle" style={{ background: "#8B5CF6", width: 40, height: 40, borderRadius: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        </div>
        <div>
          <h2 className="text-[16px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            How the Protocol Decides
          </h2>
          <p className="text-[12px] text-[#64748B]">On-chain adjudication in the Challenger contract</p>
        </div>
      </div>

      {/* Decision flow steps */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Step 1 */}
        <div className="glass-inner p-4 relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full bg-[#8B5CF6] border-2 border-[#1E293B] text-white text-[11px] font-bold flex items-center justify-center">1</span>
            <span className="text-[12px] font-bold text-[#1E293B]">EBBO Benchmark</span>
          </div>
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            Protocol reads the <span className="font-mono text-[#8B5CF6]">EBBOOracle</span> to compute the fair benchmark price for the token pair from on-chain pools.
          </p>
        </div>

        {/* Step 2 */}
        <div className="glass-inner p-4 relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full bg-[#F472B6] border-2 border-[#1E293B] text-white text-[11px] font-bold flex items-center justify-center">2</span>
            <span className="text-[12px] font-bold text-[#1E293B]">Expected Output</span>
          </div>
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            Computes expected: <span className="font-mono text-[#DB2777]">benchmark &times; input &times; (1 - tolerance)</span>. The tolerance band (default 50bps) accounts for normal slippage.
          </p>
        </div>

        {/* Step 3 */}
        <div className="glass-inner p-4 relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full bg-[#FBBF24] border-2 border-[#1E293B] text-white text-[11px] font-bold flex items-center justify-center">3</span>
            <span className="text-[12px] font-bold text-[#1E293B]">Compare</span>
          </div>
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            If <span className="font-mono text-[#D97706]">actualOutput &lt; expectedOutput</span>, the solver gave the swapper less than fair value. Challenge succeeds.
          </p>
        </div>

        {/* Step 4 */}
        <div className="glass-inner p-4 relative">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-6 h-6 rounded-full bg-[#34D399] border-2 border-[#1E293B] text-white text-[11px] font-bold flex items-center justify-center">4</span>
            <span className="text-[12px] font-bold text-[#1E293B]">Slash &amp; Split</span>
          </div>
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            Slashes <span className="font-mono text-[#059669]">min(shortfall, solverBond)</span> from SolverBondVault and distributes via the 60/30/10 split.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Static: Bond Lifecycle ────────────────────────────────────── */

function BondLifecycleCard() {
  return (
    <div className="card card-green p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-circle" style={{ background: "#34D399", width: 40, height: 40, borderRadius: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div>
          <h2 className="text-[16px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            Bond Lifecycle
          </h2>
          <p className="text-[12px] text-[#64748B]">How solver bond flows through the protocol</p>
        </div>
      </div>

      {/* Horizontal pipeline */}
      <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
        {/* Deposit */}
        <div className="flex-1 min-w-[140px]">
          <div className="bg-[#F5F3FF] border-2 border-[#DDD6FE] rounded-xl p-4 h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#8B5CF6] border-2 border-[#1E293B] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
              </div>
              <span className="text-[12px] font-bold text-[#7C3AED]">Deposit</span>
            </div>
            <p className="text-[10px] text-[#64748B] leading-relaxed">
              Solver deposits USDC to <span className="font-mono">SolverBondVault</span>. Bond is tracked by ENS namehash.
            </p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center px-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </div>

        {/* Lock */}
        <div className="flex-1 min-w-[140px]">
          <div className="bg-[#FFFBEB] border-2 border-[#FDE68A] rounded-xl p-4 h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#FBBF24] border-2 border-[#1E293B] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </div>
              <span className="text-[12px] font-bold text-[#D97706]">Lock</span>
            </div>
            <p className="text-[10px] text-[#64748B] leading-relaxed">
              When a fill is recorded, bond is locked for the challenge window (~30 min). Solver cannot withdraw.
            </p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center px-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </div>

        {/* Challenge */}
        <div className="flex-1 min-w-[140px]">
          <div className="bg-[#FDF2F8] border-2 border-[#FBCFE8] rounded-xl p-4 h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#F472B6] border-2 border-[#1E293B] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              </div>
              <span className="text-[12px] font-bold text-[#DB2777]">Challenge</span>
            </div>
            <p className="text-[10px] text-[#64748B] leading-relaxed">
              Agent detects EBBO violation. Submits challenge on-chain with its own bond via Permit2.
            </p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center px-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </div>

        {/* Adjudicate */}
        <div className="flex-1 min-w-[140px]">
          <div className="bg-[#FEF2F2] border-2 border-[#FECACA] rounded-xl p-4 h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#EF4444] border-2 border-[#1E293B] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <span className="text-[12px] font-bold text-[#DC2626]">Adjudicate</span>
            </div>
            <p className="text-[10px] text-[#64748B] leading-relaxed">
              On-chain comparison: if actual &lt; expected, solver is slashed. Bond returned to challenger on success.
            </p>
          </div>
        </div>

        {/* Arrow */}
        <div className="flex items-center px-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </div>

        {/* Distribute */}
        <div className="flex-1 min-w-[140px]">
          <div className="bg-[#ECFDF5] border-2 border-[#A7F3D0] rounded-xl p-4 h-full">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#34D399] border-2 border-[#1E293B] flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M8 12l2 2 4-4" /></svg>
              </div>
              <span className="text-[12px] font-bold text-[#059669]">Distribute</span>
            </div>
            <p className="text-[10px] text-[#64748B] leading-relaxed">
              RoyaltyDistributor splits slashed bond: 60% swapper, 30% agent owner, 10% protocol treasury.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Static: 60/30/10 Split Explanation ────────────────────────── */

function SplitExplainerCard() {
  return (
    <div className="card card-pink p-6 mb-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-circle" style={{ background: "#F472B6", width: 40, height: 40, borderRadius: 12 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <div>
          <h2 className="text-[16px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            Slash Distribution: 60 / 30 / 10
          </h2>
          <p className="text-[12px] text-[#64748B]">How slashed bonds are redistributed</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Swapper */}
        <div className="bg-[#ECFDF5] border-2 border-[#A7F3D0] rounded-xl p-5 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#34D399] border-2 border-[#1E293B] flex items-center justify-center">
            <span className="text-[20px] font-extrabold text-white" style={{ fontFamily: "var(--font-heading)" }}>60%</span>
          </div>
          <p className="text-[14px] font-bold text-[#059669] mb-1" style={{ fontFamily: "var(--font-heading)" }}>Swapper</p>
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            The original user who got a bad fill. Receives majority restitution for the shortfall.
          </p>
        </div>

        {/* Agent Owner */}
        <div className="bg-[#F5F3FF] border-2 border-[#DDD6FE] rounded-xl p-5 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#8B5CF6] border-2 border-[#1E293B] flex items-center justify-center">
            <span className="text-[20px] font-extrabold text-white" style={{ fontFamily: "var(--font-heading)" }}>30%</span>
          </div>
          <p className="text-[14px] font-bold text-[#7C3AED] mb-1" style={{ fontFamily: "var(--font-heading)" }}>iNFT Owner</p>
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            The challenger agent&apos;s owner (ChallengerNFT holder). Rewarded for detecting the violation.
          </p>
        </div>

        {/* Protocol */}
        <div className="bg-[#FFFBEB] border-2 border-[#FDE68A] rounded-xl p-5 text-center">
          <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#FBBF24] border-2 border-[#1E293B] flex items-center justify-center">
            <span className="text-[20px] font-extrabold text-white" style={{ fontFamily: "var(--font-heading)" }}>10%</span>
          </div>
          <p className="text-[14px] font-bold text-[#D97706] mb-1" style={{ fontFamily: "var(--font-heading)" }}>Protocol</p>
          <p className="text-[11px] text-[#64748B] leading-relaxed">
            Protocol treasury. Funds ongoing development and infrastructure maintenance.
          </p>
        </div>
      </div>

      {/* Visual bar */}
      <div className="mt-5">
        <div className="flex gap-1 h-5 rounded-full overflow-hidden border-2 border-[#1E293B]">
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

/* ── Challenge Outcome Cards ──────────────────────────────────── */

function ChallengeOutcomeCard({ challenge, slash }: { challenge: ChallengeRecord; slash?: SlashDocRecord }) {
  const succeeded = challenge.succeeded;
  const slashAmt = fmtUsdc(challenge.slashAmount);

  return (
    <div
      className={`border-2 rounded-2xl p-5 transition-all duration-200 hover:translate-x-[-1px] hover:translate-y-[-1px] ${
        succeeded
          ? "bg-white border-[#1E293B] shadow-[6px_6px_0_#A7F3D0] hover:shadow-[8px_8px_0_#A7F3D0]"
          : "bg-white border-[#1E293B] shadow-[6px_6px_0_#FECACA] hover:shadow-[8px_8px_0_#FECACA]"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full border-2 flex items-center justify-center"
            style={{
              background: succeeded ? "#ECFDF5" : "#FEF2F2",
              borderColor: succeeded ? "#A7F3D0" : "#FECACA",
            }}
          >
            {succeeded ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            )}
          </div>
          <div>
            <span className="text-[13px] font-bold font-mono text-[#1E293B]">{truncHex(challenge.orderHash)}</span>
            {challenge.agentTokenId && <span className="badge badge-purple ml-2">iNFT #{challenge.agentTokenId}</span>}
            <span className="text-[10px] text-[#64748B] ml-2">{fmtRelTime(challenge.challengeTimestamp)}</span>
          </div>
        </div>
        <span className={`badge ${succeeded ? "badge-green" : "badge-red"}`}>
          {succeeded ? "Slashed" : "Rejected"}
        </span>
      </div>

      {/* EBBO comparison */}
      <div className="glass-inner p-4 mb-4">
        <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">EBBO Comparison (On-Chain Adjudication)</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] text-[#64748B]">Benchmark Output</p>
            <p className="text-[14px] font-mono font-bold text-[#1E293B]">{challenge.benchmarkOutput}</p>
          </div>
          <div>
            <p className="text-[10px] text-[#64748B]">Actual Output</p>
            <p className={`text-[14px] font-mono font-bold ${succeeded ? "text-[#DC2626]" : "text-[#059669]"}`}>
              {challenge.actualOutput}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-[#64748B]">Tolerance</p>
            <p className="text-[14px] font-mono font-bold text-[#1E293B]">{challenge.eboToleranceBps} bps</p>
          </div>
        </div>
        {succeeded && (
          <div className="mt-3 pt-3 border-t-2 border-[#E2E8F0]">
            <p className="text-[11px] text-[#64748B]">
              <span className="font-semibold text-[#DC2626]">Verdict:</span> Actual output was below the EBBO-adjusted expected output.
              Solver underpaid the swapper, triggering a slash of <span className="font-mono font-bold text-[#1E293B]">${slashAmt} USDC</span>.
            </p>
          </div>
        )}
        {!succeeded && (
          <div className="mt-3 pt-3 border-t-2 border-[#E2E8F0]">
            <p className="text-[11px] text-[#64748B]">
              <span className="font-semibold text-[#059669]">Verdict:</span> Actual output was within the EBBO tolerance band.
              No slash applied. Challenger bond forfeited to protocol treasury.
            </p>
          </div>
        )}
      </div>

      {/* Bond flow visualization for successful slashes */}
      {succeeded && slash && (
        <div className="glass-inner p-4">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Bond Redistribution</p>

          {/* Flow: Solver Bond → Slash → 3 recipients */}
          <div className="flex items-center gap-2 mb-4">
            <div className="bg-[#FEF2F2] border-2 border-[#FECACA] rounded-xl px-3 py-2 text-center">
              <p className="text-[9px] text-[#DC2626] font-semibold">Solver Bond</p>
              <p className="text-[13px] font-mono font-bold text-[#DC2626]">${slashAmt}</p>
            </div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            <div className="bg-[#FEF2F2] border-2 border-[#FECACA] rounded-xl px-3 py-2 text-center">
              <p className="text-[9px] text-[#DC2626] font-semibold uppercase">Slashed</p>
              <p className="text-[9px] text-[#64748B]">via RoyaltyDistributor</p>
            </div>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            <div className="flex-1 grid grid-cols-3 gap-2">
              <div className="bg-[#ECFDF5] border-2 border-[#A7F3D0] rounded-xl px-2 py-2 text-center">
                <p className="text-[9px] text-[#059669] font-semibold">Swapper (60%)</p>
                <p className="text-[12px] font-mono font-bold text-[#059669]">${fmtUsdc(slash.swapperRestitution)}</p>
              </div>
              <div className="bg-[#F5F3FF] border-2 border-[#DDD6FE] rounded-xl px-2 py-2 text-center">
                <p className="text-[9px] text-[#7C3AED] font-semibold">iNFT Owner (30%)</p>
                <p className="text-[12px] font-mono font-bold text-[#7C3AED]">${fmtUsdc(slash.ownerBounty)}</p>
              </div>
              <div className="bg-[#FFFBEB] border-2 border-[#FDE68A] rounded-xl px-2 py-2 text-center">
                <p className="text-[9px] text-[#D97706] font-semibold">Protocol (10%)</p>
                <p className="text-[12px] font-mono font-bold text-[#D97706]">${fmtUsdc(slash.protocolCut)}</p>
              </div>
            </div>
          </div>

          {/* Distribution bar */}
          <div className="flex gap-1 h-4 rounded-full overflow-hidden border-2 border-[#E2E8F0]">
            <div className="h-full rounded-l-full" style={{ width: "60%", background: "#34D399" }} />
            <div className="h-full" style={{ width: "30%", background: "#8B5CF6" }} />
            <div className="h-full rounded-r-full" style={{ width: "10%", background: "#FBBF24" }} />
          </div>

          {/* Challenger bond return */}
          <div className="mt-3 pt-3 border-t-2 border-[#E2E8F0]">
            <div className="flex items-center gap-2 mb-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>
              <p className="text-[11px] text-[#64748B]">
                <span className="font-semibold text-[#059669]">Challenger bond returned</span> — challenge succeeded, no penalty applied.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 ml-6">
              <div>
                <p className="text-[9px] text-[#94A3B8] uppercase font-semibold">Agent iNFT</p>
                <p className="text-[12px] font-mono font-bold text-[#8B5CF6]">#{challenge.agentTokenId || "N/A"}</p>
              </div>
              <div>
                <p className="text-[9px] text-[#94A3B8] uppercase font-semibold">Challenger</p>
                <p className="text-[12px] font-mono text-[#1E293B]">{truncHex(challenge.challengerNamehash || "")}</p>
              </div>
              <div>
                <p className="text-[9px] text-[#94A3B8] uppercase font-semibold">Submitted By</p>
                <p className="text-[12px] font-mono text-[#1E293B]">{truncHex(challenge.challengerAddress || "")}</p>
              </div>
            </div>
          </div>

          {/* NL Explanation */}
          {slash.nlExplanation && (
            <div className="mt-3 pt-3 border-t-2 border-[#E2E8F0]">
              <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-1">AI Explanation</p>
              <p className="text-[11px] text-[#64748B] italic leading-relaxed">{slash.nlExplanation}</p>
            </div>
          )}
        </div>
      )}

      {/* Failed challenge — bond forfeited */}
      {!succeeded && (
        <div className="glass-inner p-4">
          <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Bond Outcome</p>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            <p className="text-[11px] text-[#64748B]">
              <span className="font-semibold text-[#DC2626]">Challenger bond forfeited</span> to protocol treasury.
              Solver bond remains intact (no slash).
            </p>
          </div>
        </div>
      )}

      {/* Transaction Hashes — full trail */}
      <div className="glass-inner p-4 mt-4">
        <p className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-3">Transaction Trail</p>
        <div className="space-y-2">
          {/* Challenge tx */}
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 rounded-full bg-[#F472B6] border-2 border-[#1E293B] flex items-center justify-center flex-shrink-0">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#64748B] font-semibold">Challenge Submission</p>
              <a
                href={`https://sepolia.basescan.org/tx/${challenge.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-mono text-[#8B5CF6] hover:underline break-all"
              >
                {challenge.txHash}
              </a>
            </div>
            <span className="text-[10px] font-mono text-[#94A3B8] flex-shrink-0">Block #{challenge.challengeBlock.toLocaleString()}</span>
          </div>

          {/* Slash tx (if succeeded and slash doc exists) */}
          {succeeded && slash && (
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 rounded-full bg-[#EF4444] border-2 border-[#1E293B] flex items-center justify-center flex-shrink-0">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-[#64748B] font-semibold">Slash &amp; Distribution (same tx)</p>
                <a
                  href={`https://sepolia.basescan.org/tx/${slash.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-mono text-[#8B5CF6] hover:underline break-all"
                >
                  {slash.txHash}
                </a>
              </div>
              <span className="text-[10px] font-mono text-[#94A3B8] flex-shrink-0">
                Solver: {truncHex(slash.solverNamehash)}
              </span>
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="mt-3 pt-2 border-t border-[#E2E8F0] grid grid-cols-3 gap-3 text-[10px]">
          <div>
            <p className="text-[#94A3B8] uppercase font-semibold">Agent iNFT</p>
            <p className="font-mono font-bold text-[#8B5CF6] text-[12px]">#{challenge.agentTokenId || "N/A"}</p>
          </div>
          <div>
            <p className="text-[#94A3B8] uppercase font-semibold">Challenger ENS</p>
            <p className="font-mono text-[#1E293B] text-[11px]">{truncHex(challenge.challengerNamehash)}</p>
          </div>
          <div>
            <p className="text-[#94A3B8] uppercase font-semibold">Submitted By</p>
            <a
              href={`https://sepolia.basescan.org/address/${challenge.challengerAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[#8B5CF6] text-[11px] hover:underline"
            >
              {truncHex(challenge.challengerAddress)}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ───────────────────────────────────────────── */

export function AdjudicationFlow() {
  const [challenges, setChallenges] = useState<ChallengeRecord[]>([]);
  const [slashDocs, setSlashDocs] = useState<SlashDocRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [chRes, slRes] = await Promise.all([
        fetch("/api/challenges?limit=20"),
        fetch("/api/slashes?limit=20"),
      ]);
      if (chRes.ok) setChallenges(await chRes.json());
      if (slRes.ok) setSlashDocs(await slRes.json());
    } catch {
      /* silently retry on next interval */
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

  return (
    <div>
      {/* Explainers */}
      <ProtocolDecisionCard />
      <BondLifecycleCard />
      <SplitExplainerCard />

      {/* Live challenge outcomes */}
      <div className="card card-amber p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="icon-circle" style={{ background: "#EF4444", width: 40, height: 40, borderRadius: 12 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-[16px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
              Challenge Outcomes
            </h2>
            <p className="text-[12px] text-[#64748B]">Live results from on-chain adjudication</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="live-dot" />
            <span className="text-[10px] text-[#64748B] font-medium">Auto-refresh 15s</span>
          </div>
        </div>

        {loading && <p className="text-[13px] text-[#94A3B8] text-center py-8">Loading challenges...</p>}

        {!loading && challenges.length === 0 && (
          <div className="text-center py-8">
            <p className="text-[14px] text-[#94A3B8] font-medium">No challenges recorded yet</p>
            <p className="text-[12px] text-[#CBD5E1] mt-1">Submit a bad swap to trigger the agent pipeline</p>
          </div>
        )}

        <div className="space-y-4">
          {challenges.map((ch) => (
            <ChallengeOutcomeCard
              key={ch.txHash}
              challenge={ch}
              slash={slashByOrder.get(ch.orderHash)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
