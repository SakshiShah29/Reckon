import {
  type Address,
  type Hex,
  erc20Abi,
  maxUint256,
  namehash,
} from "viem";
import { USDC_BASE, SOLVERS_PARENT } from "@reckon-protocol/types";

const BondedAmountABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "bondedAmount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const DepositABI = [
  {
    inputs: [{ name: "amount", type: "uint256" }],
    name: "deposit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface BootstrapConfig {
  publicClient: any;
  walletClient: any;
  solverAddress: Address;
  solverBondVaultAddress: Address;
  relayerUrl: string;
  solverLabel: string;
}

const BOND_AMOUNT = 50n * 10n ** 6n; // 50 USDC

export async function bootstrapSolver(config: BootstrapConfig): Promise<void> {
  const {
    publicClient,
    walletClient,
    solverAddress,
    solverBondVaultAddress,
    relayerUrl,
    solverLabel,
  } = config;

  const fullName = `${solverLabel}.${SOLVERS_PARENT}`;
  const node = namehash(fullName) as Hex;

  // 1. Check if solver has an ENS name via viem's ENS resolution
  console.log(`[bootstrap] Resolving ${fullName}...`);

  let resolved: Address | null = null;
  try {
    resolved = await publicClient.getEnsAddress({ name: fullName });
  } catch {
    // ENS resolution not available or name doesn't exist
  }

  if (resolved?.toLowerCase() !== solverAddress.toLowerCase()) {
    console.log(`[bootstrap] ${fullName} does not resolve to ${solverAddress} — requesting registration from relayer...`);

    const res = await fetch(`${relayerUrl}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: solverLabel,
        address: solverAddress,
        role: "solver",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "unknown" }));
      throw new Error(`Registration failed: ${(err as any).error}`);
    }

    const result = await res.json() as { fullName: string; txHash: string };
    console.log(`[bootstrap] Registered as ${result.fullName}: ${result.txHash}`);
  } else {
    console.log(`[bootstrap] ${fullName} → ${resolved} ✓`);
  }

  // 2. Check bond deposit
  console.log(`[bootstrap] Checking bond deposit...`);

  const bonded: bigint = await publicClient.readContract({
    address: solverBondVaultAddress,
    abi: BondedAmountABI,
    functionName: "bondedAmount",
    args: [node],
  });

  if (bonded < BOND_AMOUNT) {
    const needed = BOND_AMOUNT - bonded;
    console.log(`[bootstrap] Bond insufficient (${bonded} / ${BOND_AMOUNT}) — depositing ${needed} USDC...`);

    const allowance: bigint = await publicClient.readContract({
      address: USDC_BASE,
      abi: erc20Abi,
      functionName: "allowance",
      args: [solverAddress, solverBondVaultAddress],
    });

    if (allowance < needed) {
      console.log(`[bootstrap] Approving USDC on SolverBondVault...`);
      const approveTx = await walletClient.writeContract({
        address: USDC_BASE,
        abi: erc20Abi,
        functionName: "approve",
        args: [solverBondVaultAddress, maxUint256],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      console.log(`[bootstrap] USDC approved: ${approveTx}`);
    }

    const depositTx = await walletClient.writeContract({
      address: solverBondVaultAddress,
      abi: DepositABI,
      functionName: "deposit",
      args: [needed],
    });
    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    console.log(`[bootstrap] Deposited ${needed} USDC: ${depositTx}`);
  } else {
    console.log(`[bootstrap] Bond sufficient (${bonded} USDC)`);
  }

  console.log(`[bootstrap] Solver ready`);
}
