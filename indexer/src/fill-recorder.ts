import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
  type PublicClient,
  type Chain,
  type Transport,
  type Account,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import type { FillRecord } from "@reckon-protocol/types";
import {
  CHALLENGE_WINDOW_BLOCKS,
} from "@reckon-protocol/types";
import type { RawFillEvent } from "./fill-listener.js";
import { getFillsCollection } from "./db.js";

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

/**
 * ABI for writing to FillRegistry.
 * recordFill is a permissioned function — only the relayer EOA can call it.
 */
const FillRegistryWriteABI = [
  {
    inputs: [
      { name: "orderHash", type: "bytes32" },
      { name: "filler", type: "address" },
      { name: "fillerNamehash", type: "bytes32" },
      { name: "swapper", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "inputAmount", type: "uint256" },
      { name: "outputAmount", type: "uint256" },
      { name: "eboToleranceBps", type: "uint16" },
      { name: "fillBlock", type: "uint256" },
      { name: "challengeDeadline", type: "uint256" },
    ],
    name: "recordFill",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * ABI for reading the ENS L2 subname registrar to look up solver namehash.
 * subnameByAddress maps solver EOA → ENS namehash.
 */
const SubnameRegistrarABI = [
  {
    inputs: [{ name: "addr", type: "address" }],
    name: "subnameByAddress",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;


export interface RecorderConfig {
  rpcUrl: string;
  relayerPrivateKey: `0x${string}`;
  fillRegistryAddress: Address;
  subnameRegistrarAddress: Address;
  /** Default EBBO tolerance in bps if we can't read from validator */
  defaultToleranceBps: number;
}

interface RecorderClients {
  publicClient: PublicClient;
  walletClient: ReturnType<typeof createWalletClient<Transport, Chain, PrivateKeyAccount>>;
  fillRegistryAddress: Address;
  subnameRegistrarAddress: Address;
  defaultToleranceBps: number;
}

let clients: RecorderClients | null = null;

export function initRecorder(config: RecorderConfig): void {
  const account = privateKeyToAccount(config.relayerPrivateKey);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: base,
    transport: http(config.rpcUrl),
    account,
  });

  clients = {
    publicClient,
    walletClient,
    fillRegistryAddress: config.fillRegistryAddress,
    subnameRegistrarAddress: config.subnameRegistrarAddress,
    defaultToleranceBps: config.defaultToleranceBps,
  };

  console.log(`[fill-recorder] Initialized with relayer ${account.address}`);
  console.log(`[fill-recorder] FillRegistry: ${config.fillRegistryAddress}`);
}

/**
 * Handles a raw Fill event from the reactor:
 * 1. Resolves solver ENS namehash from subnameRegistrar
 * 2. Reads order details (amounts, tokens, tolerance) from tx receipt
 * 3. Calls FillRegistry.recordFill() on-chain
 * 4. Writes fill document to MongoDB
 *
 * Returns the enriched FillRecord (also used by the storage batcher).
 */
export async function recordFill(
  rawFill: RawFillEvent,
): Promise<FillRecord | null> {
  if (!clients) throw new Error("Recorder not initialized — call initRecorder first");

  const tag = rawFill.orderHash.slice(0, 10);
  const { publicClient, walletClient, fillRegistryAddress, subnameRegistrarAddress } = clients;

  // 1. Look up solver's ENS namehash
  let fillerNamehash: `0x${string}`;
  try {
    fillerNamehash = await publicClient.readContract({
      address: subnameRegistrarAddress,
      abi: SubnameRegistrarABI,
      functionName: "subnameByAddress",
      args: [rawFill.filler],
    });

    // Zero namehash means solver isn't registered
    if (fillerNamehash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      console.log(`[fill-recorder] ${tag} filler ${rawFill.filler} has no ENS subname, skipping`);
      return null;
    }
  } catch (err) {
    console.warn(`[fill-recorder] ${tag} failed to resolve namehash, using filler address hash:`, err);
    // Fallback: hash the filler address (for dev/testing without ENS)
    const { keccak256, encodePacked } = await import("viem");
    fillerNamehash = keccak256(encodePacked(["address"], [rawFill.filler]));
  }

  // 2. Read transaction receipt to extract order details
  //    The resolved order's input/output amounts and tokens are decoded from the Fill tx
  const receipt = await publicClient.getTransactionReceipt({
    hash: rawFill.transactionHash,
  });

  // Parse transfer events from the tx to determine tokens and amounts
  // ERC20 Transfer(from, to, amount) topic
  const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
  const transferLogs = receipt.logs.filter(
    (log) => log.topics[0] === TRANSFER_TOPIC,
  );

  // The fill tx will have Transfer events:
  // - swapper → reactor (input token)
  // - reactor/filler → swapper (output token)
  // We identify them by direction relative to the swapper
  let tokenIn: Address = "0x0000000000000000000000000000000000000000";
  let tokenOut: Address = "0x0000000000000000000000000000000000000000";
  let inputAmount = 0n;
  let outputAmount = 0n;

  for (const log of transferLogs) {
    if (log.topics.length < 3) continue;

    const from = ("0x" + log.topics[1]!.slice(26)) as Address;
    const to = ("0x" + log.topics[2]!.slice(26)) as Address;
    const amount = log.data !== "0x" ? BigInt(log.data) : 0n;

    if (from.toLowerCase() === rawFill.swapper.toLowerCase()) {
      // Swapper sending = input token
      tokenIn = log.address as Address;
      inputAmount = amount;
    } else if (to.toLowerCase() === rawFill.swapper.toLowerCase()) {
      // Swapper receiving = output token
      tokenOut = log.address as Address;
      outputAmount = amount;
    }
  }

  if (inputAmount === 0n || outputAmount === 0n) {
    console.warn(`[fill-recorder] ${tag} could not parse transfer amounts from tx, skipping`);
    return null;
  }

  // 3. Extract tolerance — try reading from validator, fall back to default
  let toleranceBps = clients.defaultToleranceBps;
  // TODO: In production, decode additionalValidationData from the resolvedOrder
  // For now, use the default tolerance

  const fillBlock = Number(rawFill.blockNumber);
  const challengeDeadline = fillBlock + CHALLENGE_WINDOW_BLOCKS;
  const block = await publicClient.getBlock({ blockNumber: rawFill.blockNumber });

  // 4. Call FillRegistry.recordFill() on-chain
  let recordTxHash: `0x${string}`;
  try {
    recordTxHash = await walletClient.writeContract({
      chain: base,
      address: fillRegistryAddress,
      abi: FillRegistryWriteABI,
      functionName: "recordFill",
      args: [
        rawFill.orderHash,
        rawFill.filler,
        fillerNamehash,
        rawFill.swapper,
        tokenIn,
        tokenOut,
        inputAmount,
        outputAmount,
        toleranceBps,
        BigInt(fillBlock),
        BigInt(challengeDeadline),
      ],
    });
    console.log(`[fill-recorder] ${tag} recorded on-chain tx: ${recordTxHash.slice(0, 10)}...`);
  } catch (err) {
    console.error(`[fill-recorder] ${tag} on-chain recordFill failed:`, err);
    // Continue to write MongoDB even if on-chain write fails
    // (the on-chain record can be retried; MongoDB is the primary read store)
    recordTxHash = rawFill.transactionHash; // fallback to the original fill tx
  }

  // 5. Build the enriched FillRecord
  const fill: FillRecord = {
    orderHash: rawFill.orderHash,
    filler: rawFill.filler,
    fillerNamehash,
    swapper: rawFill.swapper,
    tokenIn,
    tokenOut,
    inputAmount: inputAmount.toString(),
    outputAmount: outputAmount.toString(),
    eboToleranceBps: toleranceBps,
    fillBlock,
    fillTimestamp: Number(block.timestamp),
    challengeDeadline,
    txHash: recordTxHash,
  };

  // 6. Write to MongoDB (idempotent via unique orderHash index)
  try {
    const collection = await getFillsCollection();
    await collection.updateOne(
      { orderHash: fill.orderHash },
      { $setOnInsert: fill },
      { upsert: true },
    );
    console.log(`[fill-recorder] ${tag} written to MongoDB`);
  } catch (err) {
    console.error(`[fill-recorder] ${tag} MongoDB write failed:`, err);
  }

  return fill;
}
