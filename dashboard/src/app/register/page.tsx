"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { namehash } from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  SOLVER_REGISTRY_ADDRESS,
  SOLVER_BOND_VAULT_ADDRESS,
  USDC_ADDRESS,
  solverRegistryAbi,
  solverBondVaultAbi,
  erc20Abi,
} from "@/lib/contracts";
import { PartnerLogos } from "@/components/partner-logos";

const SOLVERS_PARENT = "solvers.reckonprotocol.eth";
const LABEL_REGEX = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

/* ─── Helpers ─── */
function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const frac = amount % 1_000_000n;
  if (frac === 0n) return whole.toLocaleString();
  return `${whole.toLocaleString()}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ─── Step Indicator ─── */
const STEP_COLORS = ["#8B5CF6", "#F472B6", "#FBBF24", "#34D399"];
const STEP_SHADOWS = ["#DDD6FE", "#FBCFE8", "#FDE68A", "#A7F3D0"];

function StepIndicator({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const done = stepNum < currentStep;
        const active = stepNum === currentStep;
        const color = STEP_COLORS[i];

        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 transition-all duration-300 border-2"
                style={{
                  background: done ? color : "transparent",
                  borderColor: done || active ? color : "#E2E8F0",
                  color: done ? "white" : active ? color : "#94A3B8",
                  boxShadow: active ? `0 0 0 4px ${color}22` : "none",
                }}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <p
                className="text-[10px] mt-1.5 text-center whitespace-nowrap font-semibold"
                style={{ color: done ? color : active ? "#1E293B" : "#94A3B8" }}
              >
                {label}
              </p>
            </div>
            {i < steps.length - 1 && (
              <div
                className="h-[3px] flex-1 mx-2 mt-[-16px] rounded-full transition-colors duration-300"
                style={{ background: done ? color : "#E2E8F0" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Connect / Wrong Chain Prompt ─── */
function WalletPrompt({ isWrongChain }: { isWrongChain: boolean }) {
  const { switchChain } = useSwitchChain();

  return (
    <div className="card card-violet p-8 text-center">
      <div className="icon-circle mx-auto mb-4" style={{ background: "#F5F3FF", borderColor: "#DDD6FE" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      </div>

      {isWrongChain ? (
        <>
          <h2 className="text-[18px] font-bold text-[#1E293B] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
            Wrong Network
          </h2>
          <p className="text-[13px] text-[#64748B] mb-5">
            Please switch to Base Sepolia to register as a solver.
          </p>
          <button
            onClick={() => switchChain({ chainId: baseSepolia.id })}
            className="btn-primary mx-auto"
          >
            Switch to Base Sepolia
          </button>
        </>
      ) : (
        <>
          <h2 className="text-[18px] font-bold text-[#1E293B] mb-2" style={{ fontFamily: "var(--font-heading)" }}>
            Connect Your Wallet
          </h2>
          <p className="text-[13px] text-[#64748B] mb-5">
            Connect your wallet to register as a solver on Reckon Protocol.
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Step 1: Choose ENS Name ─── */
function StepEnsName({
  label,
  setLabel,
  onNext,
  nameNode,
}: {
  label: string;
  setLabel: (v: string) => void;
  onNext: () => void;
  nameNode: `0x${string}` | null;
}) {
  const { data: existingOwner } = useReadContract({
    address: SOLVER_REGISTRY_ADDRESS,
    abi: solverRegistryAbi,
    functionName: "ownerOfNamehash",
    args: nameNode ? [nameNode] : undefined,
    query: { enabled: !!nameNode },
  });

  const isValid = LABEL_REGEX.test(label);
  const isTaken = existingOwner && existingOwner !== "0x0000000000000000000000000000000000000000";

  return (
    <div className="card card-violet p-6 pop-in pop-in-1">
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-circle" style={{ background: "#F5F3FF", borderColor: "#DDD6FE" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" />
            <line x1="15" y1="9" x2="15.01" y2="9" />
          </svg>
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            Choose Your ENS Subname
          </h3>
          <p className="text-[11px] text-[#64748B]">Pick a unique identity for your solver</p>
        </div>
      </div>

      <div className="flex items-center gap-0 rounded-xl border-2 border-[#1E293B] overflow-hidden bg-white shadow-[3px_3px_0_#DDD6FE]">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          className="bg-transparent text-[#1E293B] text-[15px] font-mono px-4 py-3 outline-none w-36 min-w-0 font-medium"
          placeholder="yourname"
        />
        <span className="text-[12px] text-[#94A3B8] font-mono pr-4 shrink-0">.{SOLVERS_PARENT}</span>
      </div>

      {label.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          {!isValid ? (
            <span className="badge badge-amber text-[10px]">
              2-32 chars, lowercase alphanumeric & hyphens
            </span>
          ) : isTaken ? (
            <span className="badge badge-red text-[10px]">
              {label}.{SOLVERS_PARENT} is taken
            </span>
          ) : (
            <span className="badge badge-green text-[10px]">
              {label}.{SOLVERS_PARENT} is available
            </span>
          )}
        </div>
      )}

      <button
        disabled={!isValid || !!isTaken}
        onClick={onNext}
        className="btn-primary w-full mt-4 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-y-0"
      >
        Continue
      </button>
    </div>
  );
}

/* ─── Step 2: Register via Relayer ─── */
function StepRegister({
  label,
  address,
  onRegistered,
}: {
  label: string;
  address: `0x${string}`;
  onRegistered: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "polling" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  const { data: isRegistered, refetch } = useReadContract({
    address: SOLVER_REGISTRY_ADDRESS,
    abi: solverRegistryAbi,
    functionName: "isRegistered",
    args: [address],
  });

  useEffect(() => {
    if (isRegistered && status === "polling") {
      setStatus("done");
      onRegistered();
    }
  }, [isRegistered, status, onRegistered]);

  const register = async () => {
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, address, role: "solver" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      setTxHash(data.txHash || "");
      setStatus("polling");

      // Poll for on-chain confirmation
      const interval = setInterval(async () => {
        const result = await refetch();
        if (result.data) {
          clearInterval(interval);
          setStatus("done");
          onRegistered();
        }
      }, 3000);

      // Timeout after 60s
      setTimeout(() => {
        clearInterval(interval);
        if (status === "polling") {
          setStatus("done");
          onRegistered();
        }
      }, 60000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  };

  return (
    <div className="card card-pink p-6 pop-in pop-in-2">
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-circle" style={{ background: "#FDF2F8", borderColor: "#FBCFE8" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F472B6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            Register On-Chain
          </h3>
          <p className="text-[11px] text-[#64748B]">
            The relayer will register <span className="font-mono font-semibold text-[#F472B6]">{label}.{SOLVERS_PARENT}</span> to your address
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#FDF2F8] border-2 border-[#FBCFE8] mb-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#64748B] font-medium">ENS Name</span>
            <span className="text-[12px] font-mono font-semibold text-[#1E293B]">{label}.{SOLVERS_PARENT}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#64748B] font-medium">Owner</span>
            <span className="text-[12px] font-mono font-semibold text-[#1E293B]">{truncateAddress(address)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#64748B] font-medium">Registry</span>
            <span className="text-[12px] font-mono text-[#94A3B8]">{truncateAddress(SOLVER_REGISTRY_ADDRESS)}</span>
          </div>
        </div>
      </div>

      {txHash && (
        <div className="mb-4 flex items-center gap-2">
          <span className="badge badge-purple text-[10px]">
            Tx: {truncateAddress(txHash)}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-[#FEF2F2] border-2 border-[#FECACA]">
          <p className="text-[12px] text-[#DC2626] font-medium">{error}</p>
        </div>
      )}

      <button
        disabled={status === "loading" || status === "polling"}
        onClick={register}
        className="btn-primary w-full disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
      >
        {status === "loading"
          ? "Registering..."
          : status === "polling"
          ? "Confirming on-chain..."
          : status === "error"
          ? "Retry Registration"
          : "Register"}
      </button>
    </div>
  );
}

/* ─── Step 3: Approve + Deposit Bond ─── */
function StepBond({
  address,
  nameNode,
  onDeposited,
}: {
  address: `0x${string}`;
  nameNode: `0x${string}`;
  onDeposited: () => void;
}) {
  const [phase, setPhase] = useState<"read" | "approving" | "depositing" | "done">("read");

  const { data: requiredBond } = useReadContract({
    address: SOLVER_BOND_VAULT_ADDRESS,
    abi: solverBondVaultAbi,
    functionName: "requiredBond",
    args: [nameNode],
  });

  const { data: currentBond } = useReadContract({
    address: SOLVER_BOND_VAULT_ADDRESS,
    abi: solverBondVaultAbi,
    functionName: "bondedAmount",
    args: [nameNode],
  });

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });

  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address, SOLVER_BOND_VAULT_ADDRESS],
  });

  const needed = requiredBond && currentBond ? (requiredBond > currentBond ? requiredBond - currentBond : 0n) : null;
  const needsApproval = needed !== null && allowance !== undefined && allowance < needed;
  const insufficientBalance = needed !== null && usdcBalance !== undefined && usdcBalance < needed;

  // Approve
  const { writeContract: approveWrite, data: approveTxHash } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });

  // Deposit
  const { writeContract: depositWrite, data: depositTxHash } = useWriteContract();
  const { isSuccess: depositConfirmed } = useWaitForTransactionReceipt({ hash: depositTxHash });

  useEffect(() => {
    if (approveConfirmed && phase === "approving") {
      setPhase("read"); // Re-render will show deposit button since allowance refreshes
    }
  }, [approveConfirmed, phase]);

  useEffect(() => {
    if (depositConfirmed && phase === "depositing") {
      setPhase("done");
      onDeposited();
    }
  }, [depositConfirmed, phase, onDeposited]);

  const handleApprove = () => {
    if (!needed) return;
    setPhase("approving");
    approveWrite({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [SOLVER_BOND_VAULT_ADDRESS, needed],
    });
  };

  const handleDeposit = () => {
    if (!needed) return;
    setPhase("depositing");
    depositWrite({
      address: SOLVER_BOND_VAULT_ADDRESS,
      abi: solverBondVaultAbi,
      functionName: "deposit",
      args: [needed],
    });
  };

  const alreadyBonded = needed !== null && needed === 0n;

  return (
    <div className="card card-amber p-6 pop-in pop-in-3">
      <div className="flex items-center gap-3 mb-4">
        <div className="icon-circle" style={{ background: "#FFFBEB", borderColor: "#FDE68A" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            Deposit Bond Collateral
          </h3>
          <p className="text-[11px] text-[#64748B]">Stake USDC to start filling orders</p>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="p-4 rounded-xl bg-[#FFFBEB] border-2 border-[#FDE68A]">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Required Bond</span>
              <span className="text-[14px] font-mono font-bold text-[#1E293B]">
                {requiredBond !== undefined ? formatUsdc(requiredBond) : "..."} USDC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Current Bond</span>
              <span className="text-[12px] font-mono font-semibold text-[#64748B]">
                {currentBond !== undefined ? formatUsdc(currentBond) : "..."} USDC
              </span>
            </div>
            <div className="h-[2px] bg-[#FDE68A]" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#D97706] font-bold">To Deposit</span>
              <span className="text-[14px] font-mono font-bold text-[#D97706]">
                {needed !== null ? formatUsdc(needed) : "..."} USDC
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-[#64748B]">Your USDC balance</span>
          <span className="text-[12px] font-mono font-semibold text-[#1E293B]">
            {usdcBalance !== undefined ? formatUsdc(usdcBalance) : "..."} USDC
          </span>
        </div>
      </div>

      {insufficientBalance && (
        <div className="mb-4 p-3 rounded-xl bg-[#FEF2F2] border-2 border-[#FECACA]">
          <p className="text-[12px] text-[#DC2626] font-medium">
            Insufficient USDC balance. You need {needed !== null ? formatUsdc(needed) : "..."} USDC.
          </p>
        </div>
      )}

      {alreadyBonded ? (
        <button onClick={onDeposited} className="btn-primary w-full">
          Bond Sufficient — Continue
        </button>
      ) : needsApproval ? (
        <button
          disabled={phase === "approving" || insufficientBalance}
          onClick={handleApprove}
          className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {phase === "approving" ? "Approving USDC..." : "Approve USDC"}
        </button>
      ) : (
        <button
          disabled={phase === "depositing" || insufficientBalance}
          onClick={handleDeposit}
          className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {phase === "depositing" ? "Depositing..." : `Deposit ${needed !== null ? formatUsdc(needed) : "..."} USDC`}
        </button>
      )}
    </div>
  );
}

/* ─── Step 4: Active ─── */
function StepActive({
  label,
  address,
  nameNode,
}: {
  label: string;
  address: `0x${string}`;
  nameNode: `0x${string}`;
}) {
  const { data: bondedAmount } = useReadContract({
    address: SOLVER_BOND_VAULT_ADDRESS,
    abi: solverBondVaultAbi,
    functionName: "bondedAmount",
    args: [nameNode],
  });

  return (
    <div className="card card-green p-6 pop-in pop-in-4">
      <div className="flex items-center gap-3 mb-5">
        <div className="icon-circle" style={{ background: "#ECFDF5", borderColor: "#A7F3D0" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            Solver Active
          </h3>
          <p className="text-[11px] text-[#64748B]">You&apos;re registered and bonded — ready to fill orders</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="p-4 rounded-xl bg-[#ECFDF5] border-2 border-[#A7F3D0]">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">ENS Name</span>
              <span className="text-[13px] font-mono font-bold text-[#059669]">
                {label}.{SOLVERS_PARENT}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Address</span>
              <span className="text-[12px] font-mono font-semibold text-[#1E293B]">{truncateAddress(address)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Bond</span>
              <span className="text-[12px] font-mono font-semibold text-[#1E293B]">
                {bondedAmount !== undefined ? formatUsdc(bondedAmount) : "..."} USDC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Status</span>
              <span className="badge badge-green">Active</span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#F8FAFC] border-2 border-[#E2E8F0]">
          <p className="text-[11px] text-[#64748B]">
            <span className="font-semibold text-[#1E293B]">Next steps:</span> Start your solver node with{" "}
            <code className="text-[10px] bg-[#F1F5F9] px-1.5 py-0.5 rounded font-mono border border-[#E2E8F0]">
              SOLVER_LABEL={label} npm start
            </code>{" "}
            in the <code className="text-[10px] bg-[#F1F5F9] px-1.5 py-0.5 rounded font-mono border border-[#E2E8F0]">solver/</code> directory.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Blockscout helpers ─── */
const BLOCKSCOUT_BASE_SEPOLIA = "https://base-sepolia.blockscout.com";

function blockscoutAddressUrl(addr: string): string {
  return `${BLOCKSCOUT_BASE_SEPOLIA}/address/${addr}`;
}

function BlockscoutIcon() {
  return (
    <img src="/v_Color_Bs_logo.png" alt="Blockscout" width={14} height={14} className="shrink-0" />
  );
}

/* ─── Protocol Info Sidebar ─── */
function ProtocolInfo() {
  const contracts: { label: string; address: string; color: string }[] = [
    { label: "SolverRegistry", address: SOLVER_REGISTRY_ADDRESS, color: "#8B5CF6" },
    { label: "SolverBondVault", address: SOLVER_BOND_VAULT_ADDRESS, color: "#F472B6" },
    { label: "USDC (Base Sepolia)", address: USDC_ADDRESS, color: "#FBBF24" },
  ];

  return (
    <div className="space-y-5">
      {/* Contracts */}
      <div className="card p-5">
        <h3 className="text-[14px] font-bold text-[#1E293B] mb-4" style={{ fontFamily: "var(--font-heading)" }}>
          Protocol Contracts
        </h3>
        <div className="space-y-2.5">
          {contracts.map((c) => (
            <div key={c.label} className="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                <span className="text-[11px] text-[#64748B] font-medium">{c.label}</span>
              </div>
              <a
                href={blockscoutAddressUrl(c.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-[#5C6BC0] hover:text-[#3949AB] transition-colors pl-4"
              >
                <BlockscoutIcon />
                {truncateAddress(c.address)}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#34D399]" />
              <span className="text-[11px] text-[#64748B] font-medium">Chain</span>
            </div>
            <span className="text-[11px] font-mono text-[#1E293B] font-medium">Base Sepolia (84532)</span>
          </div>
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#3B82F6]" />
              <span className="text-[11px] text-[#64748B] font-medium">ENS Parent</span>
            </div>
            <span className="text-[11px] font-mono text-[#1E293B] font-medium">{SOLVERS_PARENT}</span>
          </div>
        </div>
      </div>

      {/* Bond Mechanics */}
      <div className="card card-violet p-5">
        <h3 className="text-[14px] font-bold text-[#1E293B] mb-3" style={{ fontFamily: "var(--font-heading)" }}>
          Bond Mechanics
        </h3>

        <div className="space-y-2.5 mb-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#F5F3FF] border-2 border-[#DDD6FE]">
            <div>
              <p className="text-[12px] font-bold text-[#1E293B]">Base Bond</p>
              <p className="text-[10px] text-[#64748B]">New solvers, no reputation</p>
            </div>
            <span className="text-[16px] font-mono font-extrabold text-[#8B5CF6]">1,000 USDC</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-[#ECFDF5] border-2 border-[#A7F3D0]">
            <div>
              <p className="text-[12px] font-bold text-[#1E293B]">Floor Bond</p>
              <p className="text-[10px] text-[#64748B]">Max reputation solvers</p>
            </div>
            <span className="text-[16px] font-mono font-extrabold text-[#059669]">100 USDC</span>
          </div>
        </div>

        <div className="p-3 rounded-xl bg-[#FDF2F8] border-2 border-[#FBCFE8] mb-3">
          <p className="text-[11px] font-bold text-[#DB2777] mb-1">Slash Distribution</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
              <span className="text-[10px] text-[#64748B]">60% Swapper</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#F472B6]" />
              <span className="text-[10px] text-[#64748B]">30% Challenger</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#FBBF24]" />
              <span className="text-[10px] text-[#64748B]">10% Protocol</span>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-[#64748B] leading-relaxed">
          Required bond decays linearly from 1,000 to 100 USDC as reputation grows through successful fills.
          Bond is locked during active challenge windows (~30 min) and slashable if an EBBO violation is proven.
        </p>
      </div>
    </div>
  );
}

/* ─── Already Registered View ─── */
function AlreadyRegistered({ address }: { address: `0x${string}` }) {
  const [depositPhase, setDepositPhase] = useState<"idle" | "approving" | "depositing">("idle");

  const { data: nameNode } = useReadContract({
    address: SOLVER_REGISTRY_ADDRESS,
    abi: solverRegistryAbi,
    functionName: "namehashOf",
    args: [address],
    query: { retry: 1 },
  });

  const { data: bondedAmount, refetch: refetchBond } = useReadContract({
    address: SOLVER_BOND_VAULT_ADDRESS,
    abi: solverBondVaultAbi,
    functionName: "bondedAmount",
    args: nameNode ? [nameNode] : undefined,
    query: { enabled: !!nameNode },
  });

  const { data: requiredBond } = useReadContract({
    address: SOLVER_BOND_VAULT_ADDRESS,
    abi: solverBondVaultAbi,
    functionName: "requiredBond",
    args: nameNode ? [nameNode] : undefined,
    query: { enabled: !!nameNode },
  });

  const { data: withdrawableAmount } = useReadContract({
    address: SOLVER_BOND_VAULT_ADDRESS,
    abi: solverBondVaultAbi,
    functionName: "withdrawable",
    args: nameNode ? [nameNode] : undefined,
    query: { enabled: !!nameNode },
  });

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [address, SOLVER_BOND_VAULT_ADDRESS],
  });

  const bondSufficient = bondedAmount !== undefined && requiredBond !== undefined && bondedAmount >= requiredBond;
  const needed = requiredBond !== undefined && bondedAmount !== undefined && requiredBond > bondedAmount
    ? requiredBond - bondedAmount
    : 0n;
  const needsApproval = needed > 0n && allowance !== undefined && allowance < needed;
  const insufficientBalance = needed > 0n && usdcBalance !== undefined && usdcBalance < needed;

  const { writeContract: approveWrite, data: approveTxHash } = useWriteContract();
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveTxHash });

  const { writeContract: depositWrite, data: depositTxHash } = useWriteContract();
  const { isSuccess: depositConfirmed } = useWaitForTransactionReceipt({ hash: depositTxHash });

  useEffect(() => {
    if (approveConfirmed && depositPhase === "approving") {
      setDepositPhase("idle");
      refetchAllowance();
    }
  }, [approveConfirmed, depositPhase, refetchAllowance]);

  useEffect(() => {
    if (depositConfirmed && depositPhase === "depositing") {
      setDepositPhase("idle");
      refetchBond();
    }
  }, [depositConfirmed, depositPhase, refetchBond]);

  const handleApprove = () => {
    setDepositPhase("approving");
    approveWrite({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [SOLVER_BOND_VAULT_ADDRESS, needed],
    });
  };

  const handleDeposit = () => {
    setDepositPhase("depositing");
    depositWrite({
      address: SOLVER_BOND_VAULT_ADDRESS,
      abi: solverBondVaultAbi,
      functionName: "deposit",
      args: [needed],
    });
  };

  return (
    <div className={`card ${bondSufficient ? "card-green" : "card-amber"} p-6`}>
      <div className="flex items-center gap-3 mb-5">
        <div
          className="icon-circle"
          style={{
            background: bondSufficient ? "#ECFDF5" : "#FFFBEB",
            borderColor: bondSufficient ? "#A7F3D0" : "#FDE68A",
          }}
        >
          {bondSufficient ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          )}
        </div>
        <div>
          <h3 className="text-[15px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            {bondSufficient ? "Solver Active" : "Solver Registered — Bond Required"}
          </h3>
          <p className="text-[11px] text-[#64748B]">
            {bondSufficient
              ? "Your solver is registered and fully bonded"
              : "You're registered but need to deposit bond collateral to start filling"}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div
          className="p-4 rounded-xl border-2"
          style={{
            background: bondSufficient ? "#ECFDF5" : "#FFFBEB",
            borderColor: bondSufficient ? "#A7F3D0" : "#FDE68A",
          }}
        >
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Address</span>
              <span className="text-[12px] font-mono font-semibold text-[#1E293B]">{truncateAddress(address)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Bonded</span>
              <span className="text-[13px] font-mono font-bold text-[#1E293B]">
                {bondedAmount !== undefined ? formatUsdc(bondedAmount) : "..."} USDC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Required</span>
              <span className="text-[12px] font-mono font-semibold text-[#64748B]">
                {requiredBond !== undefined ? formatUsdc(requiredBond) : "..."} USDC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Withdrawable</span>
              <span className="text-[12px] font-mono font-semibold text-[#64748B]">
                {withdrawableAmount !== undefined ? formatUsdc(withdrawableAmount) : "..."} USDC
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-medium">Status</span>
              {bondSufficient ? (
                <span className="badge badge-green">Active</span>
              ) : (
                <span className="badge badge-amber">Under-bonded</span>
              )}
            </div>
          </div>
        </div>

        {!bondSufficient && needed > 0n && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-[#FFFBEB] border-2 border-[#FDE68A]">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[#D97706] font-bold">Deposit needed</span>
                <span className="text-[13px] font-mono font-bold text-[#D97706]">{formatUsdc(needed)} USDC</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#64748B]">Your balance</span>
                <span className="text-[11px] font-mono text-[#64748B]">
                  {usdcBalance !== undefined ? formatUsdc(usdcBalance) : "..."} USDC
                </span>
              </div>
            </div>

            {insufficientBalance ? (
              <div className="p-3 rounded-xl bg-[#FEF2F2] border-2 border-[#FECACA]">
                <p className="text-[12px] text-[#DC2626] font-medium">Insufficient USDC balance.</p>
              </div>
            ) : needsApproval ? (
              <button
                disabled={depositPhase === "approving"}
                onClick={handleApprove}
                className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {depositPhase === "approving" ? "Approving USDC..." : "Approve USDC"}
              </button>
            ) : (
              <button
                disabled={depositPhase === "depositing"}
                onClick={handleDeposit}
                className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {depositPhase === "depositing" ? "Depositing..." : `Deposit ${formatUsdc(needed)} USDC`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Registration Flow ─── */
function SolverRegistrationFlow({ address }: { address: `0x${string}` }) {
  const steps = ["ENS Name", "Register", "Bond", "Active"];
  const [step, setStep] = useState(1);
  const [ensLabel, setEnsLabel] = useState("");

  const fullName = ensLabel ? `${ensLabel}.${SOLVERS_PARENT}` : "";
  const nameNode = fullName ? namehash(fullName) : null;

  const advanceToRegister = useCallback(() => setStep(2), []);
  const advanceToBond = useCallback(() => setStep(3), []);
  const advanceToActive = useCallback(() => setStep(4), []);

  return (
    <div>
      <StepIndicator steps={steps} currentStep={step} />

      <div className="space-y-5">
        {step === 1 && (
          <StepEnsName
            label={ensLabel}
            setLabel={setEnsLabel}
            onNext={advanceToRegister}
            nameNode={nameNode as `0x${string}` | null}
          />
        )}

        {step === 2 && (
          <StepRegister label={ensLabel} address={address} onRegistered={advanceToBond} />
        )}

        {step === 3 && nameNode && (
          <StepBond address={address} nameNode={nameNode as `0x${string}`} onDeposited={advanceToActive} />
        )}

        {step === 4 && nameNode && (
          <StepActive label={ensLabel} address={address} nameNode={nameNode as `0x${string}`} />
        )}
      </div>
    </div>
  );
}

/* ─── Page ─── */
export default function RegisterPage() {
  const { address, isConnected, chain } = useAccount();
  const isWrongChain = isConnected && chain?.id !== baseSepolia.id;

  const { data: isRegistered, isLoading, isError } = useReadContract({
    address: SOLVER_REGISTRY_ADDRESS,
    abi: solverRegistryAbi,
    functionName: "isRegistered",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !isWrongChain, retry: 1 },
  });

  return (
    <div className="p-5">
      <div className="mb-6">
        <h1 className="text-[32px] font-extrabold text-[#1E293B] tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>
          Solver Registration
        </h1>
        <p className="text-[14px] text-[#64748B] mt-1.5">
          Register as a solver to fill UniswapX orders on Base and earn through the Reckon protocol
        </p>
      </div>

      {!isConnected || isWrongChain ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <WalletPrompt isWrongChain={!!isWrongChain} />
          </div>
          <ProtocolInfo />
        </div>
      ) : isLoading && !isError ? (
        <div className="card p-12 text-center">
          <div className="animate-spin w-8 h-8 border-3 border-[#8B5CF6] border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-[13px] text-[#64748B]">Checking registration status...</p>
        </div>
      ) : isRegistered && !isError ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <AlreadyRegistered address={address!} />
          </div>
          <ProtocolInfo />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SolverRegistrationFlow address={address!} />
          </div>
          <ProtocolInfo />
        </div>
      )}

      <div className="mt-8">
        <PartnerLogos />
      </div>
    </div>
  );
}
