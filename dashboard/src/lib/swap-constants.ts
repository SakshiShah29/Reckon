import { type Address } from "viem";

// ── Token addresses ──────────────────────────────────────────────
// Anvil fork (Base mainnet tokens)
export const WETH_BASE = "0x4200000000000000000000000000000000000006" as Address;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;

// Base Sepolia (for EBBO benchmark reads)
export const WETH_BASE_SEP = "0xb8d5d470fFc5d08Cf3B0Be5F6bce8dFf54cC84d8" as Address;
export const USDC_BASE_SEP = "0x868D2ea6D9885e3909Ab82a9B5AC1EE02D50CF93" as Address;

// ── Protocol addresses ───────────────────────────────────────────
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as Address;
export const PRIORITY_ORDER_REACTOR = "0x000000001Ec5656dcdB24D90DFa42742738De729" as Address;

export const EBBO_ORACLE_ADDRESS =
  (process.env.NEXT_PUBLIC_EBBO_ORACLE_ADDRESS as Address) ??
  ("0xd6DC5aBc7c4f4078d161959A0b030CEf6B1c1AA6" as Address);

export const RECKON_VALIDATOR_ADDRESS =
  (process.env.NEXT_PUBLIC_RECKON_VALIDATOR_ADDRESS as Address) ??
  ("0x781603DEc40e6Ce34a21F33A96f672e577983038" as Address);

// ── ABIs ─────────────────────────────────────────────────────────

export const ebboOracleAbi = [
  {
    name: "computeBenchmark",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
    ],
    outputs: [{ name: "price1e18", type: "uint256" }],
  },
] as const;

export const wethAbi = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
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
] as const;

// ── EIP-712 types for Permit2 + PriorityOrder ────────────────────

export const permit2Domain = {
  name: "Permit2" as const,
  verifyingContract: PERMIT2,
};

export const permit2Types = {
  PermitWitnessTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "witness", type: "PriorityOrder" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
  OrderInfo: [
    { name: "reactor", type: "address" },
    { name: "swapper", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
    { name: "additionalValidationContract", type: "address" },
    { name: "additionalValidationData", type: "bytes" },
  ],
  PriorityInput: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "mpsPerPriorityFeeWei", type: "uint256" },
  ],
  PriorityOutput: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "mpsPerPriorityFeeWei", type: "uint256" },
    { name: "recipient", type: "address" },
  ],
  PriorityOrder: [
    { name: "info", type: "OrderInfo" },
    { name: "cosigner", type: "address" },
    { name: "auctionStartBlock", type: "uint256" },
    { name: "baselinePriorityFeeWei", type: "uint256" },
    { name: "input", type: "PriorityInput" },
    { name: "outputs", type: "PriorityOutput[]" },
  ],
} as const;

// ── Order encoding ABI ───────────────────────────────────────────

export const priorityOrderAbi = [
  {
    type: "tuple",
    components: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "reactor", type: "address" },
          { name: "swapper", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "additionalValidationContract", type: "address" },
          { name: "additionalValidationData", type: "bytes" },
        ],
      },
      { name: "cosigner", type: "address" },
      { name: "auctionStartBlock", type: "uint256" },
      { name: "baselinePriorityFeeWei", type: "uint256" },
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "mpsPerPriorityFeeWei", type: "uint256" },
        ],
      },
      {
        name: "outputs",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "mpsPerPriorityFeeWei", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
      {
        name: "cosignerData",
        type: "tuple",
        components: [{ name: "auctionTargetBlock", type: "uint256" }],
      },
      { name: "cosignature", type: "bytes" },
    ],
  },
] as const;
