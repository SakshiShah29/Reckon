"use client";

import { useState } from "react";
import { PartnerLogos } from "@/components/partner-logos";

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
        const isUpcoming = stepNum > currentStep;

        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            {/* Number circle + label */}
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

            {/* Connecting line */}
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
  const solverSteps = ["Connect", "ENS Name", "Bond", "Confirm"];
  const currentStep = 2; // Mock: step 2 active

  const [ensName, setEnsName] = useState("alice");
  const [bondAmount, setBondAmount] = useState("1000");
  const nameAvailable = ensName.length >= 3;

  return (
    <div className="card p-6">
      {/* Header */}
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

      {/* Step 1: Connect (completed) */}
      <div className="mb-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[#00D4AA] flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="text-[13px] text-[#888]">Wallet Connected</span>
          </div>
          <span className="text-[12px] font-mono text-[#00D4AA] bg-[#00D4AA]/10 px-2 py-0.5 rounded">
            0x7a3F...8b2C
          </span>
        </div>
      </div>

      {/* Step 2: ENS Name (active) */}
      <div className="mb-4 p-4 rounded-lg bg-[#0a0a0a] border border-[#00D4AA]/30">
        <p className="text-[12px] text-[#888] mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-[#00D4AA] text-[#00D4AA] flex items-center justify-center text-[10px] font-bold">
            2
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
            .solvers.reckonprotocol.eth
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
                  {ensName}.solvers.reckonprotocol.eth is available
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

      {/* Step 3: Bond (upcoming) */}
      <div className="mb-4 p-4 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] opacity-50">
        <p className="text-[12px] text-[#555] mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-[#333] text-[#444] flex items-center justify-center text-[10px] font-bold">
            3
          </span>
          Deposit bond collateral
        </p>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0 bg-[#141414] rounded-lg border border-[#222] overflow-hidden flex-1">
            <input
              type="text"
              value={bondAmount}
              onChange={(e) => setBondAmount(e.target.value)}
              className="bg-transparent text-white text-[15px] font-mono px-3 py-2.5 outline-none w-full"
              placeholder="1000"
              disabled
            />
            <span className="text-[13px] text-[#444] font-medium pr-3 shrink-0">USDC</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="text-[10px] text-[#444]">Minimum: 100 USDC</span>
          <span className="text-[10px] text-[#444]">Tier: <span className="text-[#666]">Base (1,000 USDC)</span></span>
        </div>
      </div>

      {/* Step 4: Confirm (upcoming) */}
      <div className="mb-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] opacity-50">
        <p className="text-[12px] text-[#555] flex items-center gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-[#333] text-[#444] flex items-center justify-center text-[10px] font-bold">
            4
          </span>
          Review and confirm registration
        </p>
      </div>

      {/* Action button */}
      <button
        disabled
        className="w-full mt-2 py-3 rounded-lg text-[14px] font-semibold bg-[#1a1a1a] text-[#555] border border-[#222] cursor-not-allowed"
      >
        Continue to Bond Deposit
      </button>
    </div>
  );
}

/* ─── Challenger Registration Card ─── */
function ChallengerRegistration() {
  const challengerSteps = ["Connect", "Mint iNFT", "Upload Brain", "Confirm"];
  const currentStep = 3; // Mock: step 3 active

  const [dragOver, setDragOver] = useState(false);
  const uploadProgress = 67; // Mock progress

  return (
    <div className="card p-6">
      {/* Header */}
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

      {/* Step 1: Connect (completed) */}
      <div className="mb-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[#00D4AA] flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="text-[13px] text-[#888]">Wallet Connected</span>
          </div>
          <span className="text-[12px] font-mono text-[#00D4AA] bg-[#00D4AA]/10 px-2 py-0.5 rounded">
            0x7a3F...8b2C
          </span>
        </div>
      </div>

      {/* Step 2: Mint iNFT (completed) */}
      <div className="mb-4 p-3 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[#00D4AA] flex items-center justify-center">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="text-[13px] text-[#888]">ChallengerNFT Minted</span>
          </div>
          <span className="text-[12px] font-mono text-[#888] bg-[#1a1a1a] px-2 py-0.5 rounded">
            Token #42
          </span>
        </div>
        <div className="mt-2 ml-7 flex items-center gap-3">
          <span className="text-[10px] text-[#444]">Contract:</span>
          <span className="text-[10px] font-mono text-[#555]">0x98b6D7...on 0G Galileo</span>
        </div>
      </div>

      {/* Step 3: Upload Brain (active) */}
      <div className="mb-4 p-4 rounded-lg bg-[#0a0a0a] border border-[#a78bfa]/30">
        <p className="text-[12px] text-[#888] mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-[#a78bfa] text-[#a78bfa] flex items-center justify-center text-[10px] font-bold">
            3
          </span>
          Upload Brain Blob
        </p>

        {/* Drag and drop area */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            dragOver
              ? "border-[#a78bfa] bg-[#a78bfa]/5"
              : "border-[#222] hover:border-[#333]"
          }`}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5" className="mx-auto mb-2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-[13px] text-[#666]">Drag and drop your brain blob file</p>
          <p className="text-[11px] text-[#444] mt-1">or click to browse (.bin, .blob, .pt)</p>
        </div>

        {/* Upload status - mock an active upload */}
        <div className="mt-4 p-3 rounded-lg bg-[#141414] border border-[#1e1e1e]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2">
                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                <polyline points="13 2 13 9 20 9" />
              </svg>
              <span className="text-[12px] text-[#ccc] font-mono">ebbo_challenger_v3.blob</span>
            </div>
            <span className="text-[11px] text-[#555]">14.2 MB</span>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-[#1a1a1a] overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#a78bfa] to-[#00D4AA] transition-all duration-500"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#555]">Uploading to 0G Storage...</span>
            <span className="text-[10px] text-[#a78bfa] font-medium">{uploadProgress}%</span>
          </div>
        </div>

        {/* Encryption info */}
        <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-[#00D4AA]/5 border border-[#00D4AA]/10">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-[10px] text-[#00D4AA]">
            Encrypted with AES-256-GCM + PBKDF2 (100k iterations)
          </span>
        </div>
      </div>

      {/* Step 4: Confirm (upcoming) */}
      <div className="mb-4 p-4 rounded-lg bg-[#0a0a0a] border border-[#1e1e1e] opacity-50">
        <p className="text-[12px] text-[#555] mb-3 flex items-center gap-2">
          <span className="w-5 h-5 rounded-full border-2 border-[#333] text-[#444] flex items-center justify-center text-[10px] font-bold">
            4
          </span>
          Review and activate
        </p>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#444]">Token ID</span>
            <span className="text-[10px] font-mono text-[#555]">#42</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#444]">Brain Root Hash</span>
            <span className="text-[10px] font-mono text-[#555]">0xabc1...def9</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#444]">Model</span>
            <span className="text-[10px] font-mono text-[#555]">EBBO Challenger v3</span>
          </div>
        </div>
      </div>

      {/* Action button */}
      <button
        disabled
        className="w-full mt-2 py-3 rounded-lg text-[14px] font-semibold bg-[#1a1a1a] text-[#555] border border-[#222] cursor-not-allowed"
      >
        Waiting for Brain Upload...
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
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-white">Register</h1>
        <p className="text-[13px] text-[#666] mt-1">
          Register as a solver or challenger to participate in the Reckon protocol
        </p>
      </div>

      {/* Registration cards - side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SolverRegistration />
        <ChallengerRegistration />
      </div>

      {/* Lookup section */}
      <div className="mt-6">
        <LookupSection />
      </div>

      {/* Partner logos footer */}
      <div className="mt-6">
        <PartnerLogos />
      </div>
    </div>
  );
}
