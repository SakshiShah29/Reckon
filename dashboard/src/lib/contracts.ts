import { type Address } from "viem";

// ── Contract addresses (Base Sepolia) ────────────────────────────
export const SOLVER_REGISTRY_ADDRESS =
  (process.env.NEXT_PUBLIC_SOLVER_REGISTRY_ADDRESS as Address) ??
  ("0x08ed027C8E3a8f7A877333F1A940bd91f6bB3DBD" as Address);

export const SOLVER_BOND_VAULT_ADDRESS =
  (process.env.NEXT_PUBLIC_SOLVER_BOND_VAULT_ADDRESS as Address) ??
  ("0x8195ba15E335A4205c2bA2d928dC8BCd563CC783" as Address);

export const USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS as Address) ??
  ("0x868D2ea6D9885e3909Ab82a9B5AC1EE02D50CF93" as Address);

// ── ABIs ─────────────────────────────────────────────────────────

export const solverRegistryAbi = [
  {
    name: "isRegistered",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "subnameOwner", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "namehashOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "subnameOwner", type: "address" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    name: "ownerOfNamehash",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "getText",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

export const solverBondVaultAbi = [
  {
    name: "bondedAmount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "requiredBond",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "withdrawable",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "lockedAmount",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export const erc20Abi = [
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
