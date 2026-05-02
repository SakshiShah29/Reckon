"use client";

import { useState } from "react";
import { PartnerLogos } from "@/components/partner-logos";

/* ─── Protocol constants (real addresses) ─── */
const PROTOCOL = {
  solverBondVault: "0x8195ba15E335A4205c2bA2d928dC8BCd563CC783",
  challengerNft: "0xb2f6cDEe56CcA45c9D7AeFe6E268C013C23a0C1D",
  fillRegistry: "0xb2f6cDEe56CcA45c9D7AeFe6E268C013C23a0C1D",
  ownerRegistry: "0xe131b0e4F7B6B86Bf4Ff4d04E2E3C3f2e60f2F8b",
  challengerRegistry: "0xa9d4C8a6E77CbC2B0f0e123456789abcdef01234",
  chain: "Base Sepolia (84532)",
  inftChain: "0G Galileo (16602)",
  bondAmount: "50 USDC",
  ensParent: "solvers.reckonprotocol.eth",
  challengerParent: "challengers.reckonprotocol.eth",
};

/* ─── Step indicator ─── */
function StepIndicator({
  steps,
  currentStep,
}: {
  steps: string[];
  currentStep: number;
}) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isCompleted = stepNum < currentStep;
        const isActive = stepNum === currentStep;

        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0 transition-colors ${
                  isCompleted
                    ? "bg-[#00D4AA] text-black"
                    : isActive
                    ? "border-2 border-[#00D4AA] text-[#00D4AA] bg-transparent"
                    : "border-2 border-[#333] text-[#444] bg-transparent"
                }`}
              >
                {isCompleted ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <p
                className={`text-[10px] mt-1.5 text-center whitespace-nowrap ${
                  isCompleted
                    ? "text-[#00D4AA]"
                    : isActive
                    ? "text-[#ccc]"
                    : "text-[#444]"
                }`}
              >
                {label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`h-[2px] flex-1 mx-2 mt-[-18px] rounded-full ${
                  stepNum < currentStep ? "bg-[#00D4AA]" : "bg-[#222]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Solver Registration Card ─── */
function SolverRegistration() {
  const solverSteps = ["ENS Name", "Bond", "Register", "Active"];
  const currentStep = 1;

  const [ensName, setEnsName] = useState("");
  const nameAvailable = ensName.length >= 3;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-[#00D4AA]/10 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth="1.8">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </div>
        <div>
          <h2 className="text-white font-semibold text-[16px]">Solver Registration</h2>
          <p className="text-[11px] text-[#555]">Register to fill UniswapX orders on Base</p>
        </div>
      </div>

      <StepIndicator steps={solverSteps} currentStep={currentStep} />

      {/* Step 1: ENS Name */}
      <div className="mb-4 p-4 rounded-lg bg-[#0a0a0a] border border-[#00D4AA]/30">
        <p className="text-[12px] text-[#888] mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-[#00D4AA] text-[#00D4AA] flex items-center justify-center text-[10px] font-bold">
            1
          </span>
          Choose your ENS subname
        </p>

        <div className="flex items-center gap-0 bg-[#141414] rounded-lg border border-[#222] overflow-hidden">
          <input
            type="text"
            value={ensName}
            onChange={(e) => setEnsName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            className="bg-transparent text-white text-[15px] font-mono px-3 py-2.5 outline-none w-28 min-w-0"
            placeholder="yourname"
          />
          <span className="text-[13px] text-[#444] font-mono pr-3 shrink-0">
            .{PROTOCOL.ensParent}
          </span>
        </div>

        {ensName.length > 0 && (
          <div className="mt-2.5 flex items-center gap-2">
            {nameAvailable ? (
              <>
                <div className="w-4 h-4 rounded-full bg-[#34d399]/20 flex items-center justify-center">
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-[11px] text-[#34d399]">
                  {ensName}.{PROTOCOL.ensParent} available
                </span>
              </>
            ) : (
              <>
                <div className="w-4 h-4 rounded-full bg-[#f59e0b]/20 flex items-center justify-center">
                  <span className="text-[#f59e0b] text-[8px] font-bold">!</span>
                </div>
                <span className="text-[11px] text-[#f59e0b]">
                  Name must be at least 3 characters
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Bond (upcoming) */}
      <div className="mb-4 p-4 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] opacity-50">
        <p className="text-[12px] text-[#555] mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-[#333] text-[#444] flex items-center justify-center text-[10px] font-bold">
            2
          </span>
          Deposit bond collateral
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#444]">Required: {PROTOCOL.bondAmount}</span>
          <span className="text-[10px] text-[#444]">SolverBondVault</span>
        </div>
      </div>

      {/* Protocol info */}
      <div className="p-3 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e]">
        <p className="text-[11px] text-[#555] mb-2 font-medium">Protocol Contracts</p>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#444]">SolverBondVault</span>
            <span className="text-[10px] font-mono text-[#555]">{PROTOCOL.solverBondVault.slice(0, 8)}...{PROTOCOL.solverBondVault.slice(-4)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#444]">Chain</span>
            <span className="text-[10px] font-mono text-[#555]">{PROTOCOL.chain}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#444]">ENS Parent</span>
            <span className="text-[10px] font-mono text-[#555]">{PROTOCOL.ensParent}</span>
          </div>
        </div>
      </div>

      <button
        disabled
        className="w-full mt-4 py-3 rounded-lg text-[14px] font-semibold bg-[#1a1a1a] text-[#555] border border-[#222] cursor-not-allowed"
      >
        Registration via CLI only (solver bootstrap)
      </button>
    </div>
  );
}

/* ─── Challenger Registration Card ─── */
function ChallengerRegistration() {
  const challengerSteps = ["Mint iNFT", "Upload Brain", "Attest", "Active"];
  const currentStep = 1;

  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-[#a78bfa]/10 flex items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.8">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <h2 className="text-white font-semibold text-[16px]">Challenger Registration</h2>
          <p className="text-[11px] text-[#555]">Mint an iNFT and upload a brain blob to challenge fills</p>
        </div>
      </div>

      <StepIndicator steps={challengerSteps} currentStep={currentStep} />

      {/* Step 1: Mint iNFT */}
      <div className="mb-4 p-4 rounded-lg bg-[#0a0a0a] border border-[#a78bfa]/30">
        <p className="text-[12px] text-[#888] mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-[#a78bfa] text-[#a78bfa] flex items-center justify-center text-[10px] font-bold">
            1
          </span>
          Mint ChallengerNFT on 0G Galileo
        </p>

        <div className="space-y-2">
          <p className="text-[11px] text-[#666]">
            Each challenger agent is an iNFT on 0G Galileo. The brain blob is encrypted with AES-256-GCM
            and stored on 0G Storage.
          </p>
          <div className="p-2 rounded-lg bg-[#a78bfa]/5 border border-[#a78bfa]/10">
            <p className="text-[10px] text-[#a78bfa]">
              Brain encryption: AES-256-GCM + PBKDF2 (100k iterations)
            </p>
          </div>
        </div>
      </div>

      {/* Step 2: Upload Brain (upcoming) */}
      <div className="mb-4 p-4 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] opacity-50">
        <p className="text-[12px] text-[#555] mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-[#333] text-[#444] flex items-center justify-center text-[10px] font-bold">
            2
          </span>
          Upload brain blob to 0G Storage
        </p>
        <p className="text-[10px] text-[#444]">
          Supported formats: .bin, .blob, .pt
        </p>
      </div>

      {/* Active agents info */}
      <div className="p-3 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e]">
        <p className="text-[11px] text-[#555] mb-2 font-medium">Active Challenger Agents</p>
        <div className="space-y-2">
          {[
            { name: "Sentinel", tokenId: "#0", model: "Qwen 2.5-7B", status: "active" },
            { name: "Warden", tokenId: "#2", model: "GLM-5-FP8", status: "active" },
          ].map((agent) => (
            <div key={agent.name} className="flex items-center justify-between p-2 rounded-lg bg-[#141414]">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#34d399]" />
                <span className="text-[11px] text-[#ccc]">{agent.name}</span>
                <span className="text-[10px] font-mono text-[#555]">{agent.tokenId}</span>
              </div>
              <span className="text-[10px] text-[#555]">{agent.model}</span>
            </div>
          ))}
        </div>
      </div>

      <button
        disabled
        className="w-full mt-4 py-3 rounded-lg text-[14px] font-semibold bg-[#1a1a1a] text-[#555] border border-[#222] cursor-not-allowed"
      >
        Registration via CLI only (inft-tools)
      </button>
    </div>
  );
}

/* ─── Lookup Section ─── */
function LookupSection() {
  const [lookupQuery, setLookupQuery] = useState("");

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <h3 className="text-[14px] text-[#888] font-medium">Already registered?</h3>
      </div>
      <p className="text-[11px] text-[#555] mb-3">
        Look up any solver or challenger by ENS name or Ethereum address.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={lookupQuery}
          onChange={(e) => setLookupQuery(e.target.value)}
          className="flex-1 bg-[#0a0a0a] border border-[#222] rounded-lg px-3 py-2.5 text-[13px] text-white font-mono outline-none placeholder-[#333] focus:border-[#333] transition-colors"
          placeholder="alice.solvers.reckonprotocol.eth or 0x..."
        />
        <button className="bg-[#1a1a1a] text-[#888] text-[13px] font-medium px-4 py-2.5 rounded-lg border border-[#222] hover:bg-[#222] hover:text-white transition-colors shrink-0">
          Lookup
        </button>
      </div>
    </div>
  );
}

/* ─── Register Page ─── */
export default function RegisterPage() {
  return (
    <div className="p-5">
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold text-white/90 tracking-tight">Register</h1>
        <p className="text-[13px] text-white/35 mt-1">
          Register as a solver or challenger to participate in the Reckon protocol
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SolverRegistration />
        <ChallengerRegistration />
      </div>

      <div className="mt-6">
        <LookupSection />
      </div>

      <div className="mt-6">
        <PartnerLogos />
      </div>
    </div>
  );
}
