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
import { createLogger, formatDuration } from "./logger.js";

const log = createLogger("fill-recorder");

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
});

/**
 * ABI for writing to FillRegistry.
 * recordFill is a permissioned function — only the recorder EOA can call it.
 * The contract resolves fillerNamehash internally via solverRegistry.namehashOf(filler).
 * challengeDeadline is computed internally as fillBlock + challengeWindowBlocks.
 */
const FillRegistryWriteABI = [
  {
    inputs: [
      { name: "orderHash", type: "bytes32" },
      { name: "filler", type: "address" },
      { name: "swapper", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "inputAmount", type: "uint128" },
      { name: "outputAmount", type: "uint128" },
      { name: "eboTolerance", type: "uint16" },
      { name: "outputsLength", type: "uint8" },
      { name: "fillBlock", type: "uint64" },
    ],
    name: "recordFill",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

/**
 * ABI for reading the SolverRegistry to look up solver namehash.
 * namehashOf maps solver EOA → ENS namehash (returns bytes32(0) if unregistered).
 */
const SolverRegistryABI = [
  {
    inputs: [{ name: "addr", type: "address" }],
    name: "namehashOf",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "view",
    type: "function",
  },
] as const;


export interface RecorderConfig {
  rpcUrl: string;
  relayerPrivateKey: `0x${string}`;
  fillRegistryAddress: Address;
  solverRegistryAddress: Address;
  /** Default EBBO tolerance in bps if we can't read from validator */
  defaultToleranceBps: number;
  /** RPC for reading fill tx receipts (Anvil fork) — defaults to rpcUrl */
  fillSourceRpcUrl?: string;
  /** Map Anvil fork token addresses → Base Sepolia mock token addresses.
   *  Keys and values should be lowercased. When dual-chain mode is active,
   *  tokenIn/tokenOut from the Anvil fork are translated before recording
   *  on Base Sepolia so the EBBOOracle pair key matches the mock pools. */
  tokenAddressMap?: Record<string, Address>;
}

interface RecorderClients {
  publicClient: PublicClient;
  fillSourceClient: PublicClient;
  walletClient: ReturnType<typeof createWalletClient<Transport, Chain, PrivateKeyAccount>>;
  fillRegistryAddress: Address;
  solverRegistryAddress: Address;
  defaultToleranceBps: number;
  tokenAddressMap?: Record<string, Address>;
}

let clients: RecorderClients | null = null;

export function initRecorder(config: RecorderConfig): void {
  const account = privateKeyToAccount(config.relayerPrivateKey);

  const recorderChain = config.fillSourceRpcUrl ? baseSepolia : base;

  const publicClient = createPublicClient({
    chain: recorderChain,
    transport: http(config.rpcUrl),
  });

  const fillSourceClient = config.fillSourceRpcUrl
    ? createPublicClient({ chain: base, transport: http(config.fillSourceRpcUrl) })
    : publicClient;

  const walletClient = createWalletClient({
    chain: recorderChain,
    transport: http(config.rpcUrl),
    account,
  });

  clients = {
    publicClient,
    fillSourceClient,
    walletClient,
    fillRegistryAddress: config.fillRegistryAddress,
    solverRegistryAddress: config.solverRegistryAddress,
    defaultToleranceBps: config.defaultToleranceBps,
    tokenAddressMap: config.tokenAddressMap,
  };

  log.info("Recorder initialized", {
    relayer: account.address,
    fillRegistry: config.fillRegistryAddress,
    chain: recorderChain.id,
    dualChain: config.fillSourceRpcUrl ? "yes" : "no",
    tokenMappings: config.tokenAddressMap ? Object.keys(config.tokenAddressMap).length : 0,
  });
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

  const tag = rawFill.orderHash;
  const startTime = Date.now();
  const { publicClient, fillSourceClient, walletClient, fillRegistryAddress, solverRegistryAddress } = clients;

  log.debug(`Processing fill ${tag}`, {
    filler: rawFill.filler,
    swapper: rawFill.swapper,
    block: rawFill.blockNumber.toString(),
    tx: rawFill.transactionHash,
  });

  // 1. Check if filler is a registered Reckon solver via SolverRegistry.namehashOf()
  //    Skip entirely if the filler is not registered — we only track Reckon-protected fills.
  let fillerNamehash: `0x${string}`;
  try {
    fillerNamehash = await publicClient.readContract({
      address: solverRegistryAddress,
      abi: SolverRegistryABI,
      functionName: "namehashOf",
      args: [rawFill.filler],
    });

    if (fillerNamehash === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      log.debug(`${tag} filler ${rawFill.filler} not registered — skipping`);
      return null;
    }
  } catch {
    log.debug(`${tag} filler ${rawFill.filler} not registered (contract call failed) — skipping`);
    return null;
  }

  log.info(`${tag} filler is registered`, {
    filler: rawFill.filler,
    namehash: fillerNamehash,
  });

  // 2. Read transaction receipt from the fill source chain (Anvil fork)
  let receipt;
  try {
    receipt = await fillSourceClient.getTransactionReceipt({
      hash: rawFill.transactionHash,
    });
  } catch {
    // Receipt not available yet (tx may still be pending on the RPC)
    log.warn(`${tag} receipt not found — skipping (will retry on next poll)`, {
      tx: rawFill.transactionHash,
      block: rawFill.blockNumber.toString(),
    });
    return null;
  }

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

  for (const transferLog of transferLogs) {
    if (transferLog.topics.length < 3) continue;

    const from = ("0x" + transferLog.topics[1]!.slice(26)) as Address;
    const to = ("0x" + transferLog.topics[2]!.slice(26)) as Address;
    const amount = transferLog.data !== "0x" ? BigInt(transferLog.data) : 0n;

    if (from.toLowerCase() === rawFill.swapper.toLowerCase()) {
      // Swapper sending = input token
      tokenIn = transferLog.address as Address;
      inputAmount = amount;
    } else if (to.toLowerCase() === rawFill.swapper.toLowerCase()) {
      // Swapper receiving = output token
      tokenOut = transferLog.address as Address;
      outputAmount = amount;
    }
  }

  if (inputAmount === 0n || outputAmount === 0n) {
    log.warn(`${tag} could not parse transfer amounts — skipping`, {
      tx: rawFill.transactionHash,
      transferLogCount: transferLogs.length,
    });
    return null;
  }

  // Translate Anvil fork token addresses → Base Sepolia mock addresses
  if (clients.tokenAddressMap) {
    const mappedIn = clients.tokenAddressMap[tokenIn.toLowerCase()];
    const mappedOut = clients.tokenAddressMap[tokenOut.toLowerCase()];
    if (mappedIn) {
      log.info(`${tag} tokenIn mapped: ${tokenIn} → ${mappedIn}`);
      tokenIn = mappedIn;
    }
    if (mappedOut) {
      log.info(`${tag} tokenOut mapped: ${tokenOut} → ${mappedOut}`);
      tokenOut = mappedOut;
    }
  }

  // 3. Extract eboTolerance from the fill tx's calldata.
  //    The ReckonValidator expects additionalValidationData = abi.encode(uint16).
  //    We try to find this in the tx input; if not found (e.g. the order didn't use
  //    ReckonValidator), fall back to the default tolerance.
  let toleranceBps = clients.defaultToleranceBps;
  try {
    const tx = await fillSourceClient.getTransaction({ hash: rawFill.transactionHash });
    // The ReckonValidator address is embedded in the order's additionalValidationContract.
    // For now, search for the 32-byte abi.encode(uint16) pattern in the last portion of calldata.
    // This is a best-effort heuristic — in production, fully decode the ResolvedOrder struct.
    const calldata = tx.input;
    if (calldata.length > 10) {
      // Look for ReckonValidator address pattern in calldata to confirm this is a Reckon order
      // If found, the eboTolerance is the uint16 in the additionalValidationData (32 bytes)
      // For hackathon: just use default — full calldata decoding is complex
    }
  } catch {
    // Tx fetch failed — use default
  }

  const fillBlock = Number(rawFill.blockNumber);
  const challengeDeadline = fillBlock + CHALLENGE_WINDOW_BLOCKS; // mirror contract's computation for local record
  const block = await fillSourceClient.getBlock({ blockNumber: rawFill.blockNumber });

  // 4. Count outputs (we only support single-output orders)
  //    Count how many distinct transfers go TO the swapper
  const outputTransfers = transferLogs.filter((transferLog) => {
    if (transferLog.topics.length < 3) return false;
    const to = ("0x" + transferLog.topics[2]!.slice(26)).toLowerCase();
    return to === rawFill.swapper.toLowerCase();
  });
  const outputsLength = outputTransfers.length;

  // 5. Call FillRegistry.recordFill() on-chain
  let recordTxHash: `0x${string}`;
  try {
    recordTxHash = await walletClient.writeContract({
      address: fillRegistryAddress,
      abi: FillRegistryWriteABI,
      functionName: "recordFill",
      args: [
        rawFill.orderHash,
        rawFill.filler,
        rawFill.swapper,
        tokenIn,
        tokenOut,
        inputAmount,              // uint128
        outputAmount,             // uint128
        toleranceBps,             // uint16
        outputsLength,            // uint8
        BigInt(fillBlock),        // uint64
      ],
    });
    log.info(`${tag} recorded on-chain`, {
      recordTx: recordTxHash,
      inputAmount: inputAmount.toString(),
      outputAmount: outputAmount.toString(),
      toleranceBps,
      fillBlock,
      challengeDeadline,
    });
  } catch (err: any) {
    const reason = err?.shortMessage ?? err?.message ?? "unknown";
    log.warn(`${tag} on-chain recordFill FAILED: ${reason}`, {
      filler: rawFill.filler,
      fillBlock,
    });
    return null;
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
  //    recordedOnChain flag tells the bond-unlocker which fills need finalization
  try {
    const collection = await getFillsCollection();
    await collection.updateOne(
      { orderHash: fill.orderHash },
      { $setOnInsert: { ...fill, recordedOnChain: true } },
      { upsert: true },
    );
    const elapsed = Date.now() - startTime;
    log.info(`${tag} fully processed and saved to MongoDB`, {
      duration: formatDuration(elapsed),
      fillBlock,
      filler: rawFill.filler,
    });
  } catch (err) {
    log.error(`${tag} MongoDB write failed`, err, {
      orderHash: rawFill.orderHash,
    });
  }

  return fill;
}
