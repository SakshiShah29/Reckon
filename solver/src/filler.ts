import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  erc20Abi,
  maxUint256,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { base } from "viem/chains";
import { PRIORITY_ORDER_REACTOR, WETH_BASE } from "@reckon-protocol/types";
import { type DecodedOrder } from "./validate.js";

const ReactorExecuteABI = [
  {
    inputs: [
      {
        name: "order",
        type: "tuple",
        components: [
          { name: "order", type: "bytes" },
          { name: "sig", type: "bytes" },
        ],
      },
    ],
    name: "execute",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export interface FillerConfig {
  rpcUrl: string;
  solverPrivateKey: `0x${string}`;
}

export interface FillerState {
  publicClient: any;
  walletClient: any;
  account: PrivateKeyAccount;
}

let state: FillerState | null = null;

export function initFiller(config: FillerConfig): Address {
  const account = privateKeyToAccount(config.solverPrivateKey);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: base,
    transport: http(config.rpcUrl),
    account,
  });

  state = { publicClient, walletClient, account };

  console.log(`[filler] Initialized solver: ${account.address}`);
  return account.address;
}

export async function getHealth(): Promise<{
  solver: Address;
  wethBalance: string;
  wethAllowance: string;
  status: "ready" | "low_balance" | "not_approved";
}> {
  if (!state) throw new Error("Filler not initialized");

  const [balance, allowance] = await Promise.all([
    state.publicClient.readContract({
      address: WETH_BASE,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [state.account.address],
    }),
    state.publicClient.readContract({
      address: WETH_BASE,
      abi: erc20Abi,
      functionName: "allowance",
      args: [state.account.address, PRIORITY_ORDER_REACTOR],
    }),
  ]);

  let status: "ready" | "low_balance" | "not_approved" = "ready";
  if (balance === 0n) status = "low_balance";
  else if (allowance === 0n) status = "not_approved";

  return {
    solver: state.account.address,
    wethBalance: balance.toString(),
    wethAllowance: allowance.toString(),
    status,
  };
}

export async function ensureApproval(token: Address, requiredAmount: bigint): Promise<void> {
  if (!state) throw new Error("Filler not initialized");

  const allowance = await state.publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [state.account.address, PRIORITY_ORDER_REACTOR],
  });

  if (allowance >= requiredAmount) return;

  console.log(`[filler] Approving ${token} on reactor...`);
  const hash = await state.walletClient.writeContract({
    chain: base,
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [PRIORITY_ORDER_REACTOR, maxUint256],
  });
  await state.publicClient.waitForTransactionReceipt({ hash });
  console.log(`[filler] Approved: ${hash}`);
}

export interface FillResult {
  txHash: Hex;
  orderHash: Hex;
  fillBlock: number;
  solver: Address;
}

export async function fillOrder(
  encodedOrder: Hex,
  signature: Hex,
  decoded: DecodedOrder,
): Promise<FillResult> {
  if (!state) throw new Error("Filler not initialized");

  const outputToken = decoded.outputToken;
  const balance = await state.publicClient.readContract({
    address: outputToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [state.account.address],
  });

  if (balance < decoded.outputAmount) {
    throw new Error(
      `Insufficient ${outputToken}: have ${balance}, need ${decoded.outputAmount}`,
    );
  }

  await ensureApproval(outputToken, decoded.outputAmount);

  console.log(`[filler] Executing fill: ${decoded.inputAmount} ${decoded.inputToken} → ${decoded.outputAmount} ${outputToken}`);

  const block = await state.publicClient.getBlock();
  const baseFee = block.baseFeePerGas ?? 0n;
  const priorityFee = 100000n; // 0.1 gwei tip

  const { request } = await state.publicClient.simulateContract({
    account: state.account,
    address: PRIORITY_ORDER_REACTOR,
    abi: ReactorExecuteABI,
    functionName: "execute",
    args: [{ order: encodedOrder, sig: signature }],
    maxFeePerGas: baseFee + priorityFee,
    maxPriorityFeePerGas: priorityFee,
  });

  const txHash = await state.walletClient.writeContract(request);

  const receipt = await state.publicClient.waitForTransactionReceipt({ hash: txHash });

  console.log(`[filler] Fill tx confirmed: ${txHash} (block ${receipt.blockNumber})`);

  // Extract orderHash from the Fill event
  const FILL_TOPIC = "0x78ad7ec0e9f89e74012afa58738b6b661c024cb0fd185ee2f616c0a28924bd66";
  const fillLog = receipt.logs.find((l: any) => l.topics[0] === FILL_TOPIC);
  const orderHash = fillLog?.topics[1] ?? "0x";

  return {
    txHash,
    orderHash: orderHash as Hex,
    fillBlock: Number(receipt.blockNumber),
    solver: state.account.address,
  };
}
