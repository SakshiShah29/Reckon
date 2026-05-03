import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseAbiItem,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getFillsCollection } from "./db.js";
import { getDb } from "./db.js";
import { MONGO_COLLECTIONS } from "@reckon-protocol/types";

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

// ── Event ABIs ──────────────────────────────────────────────────

const ChallengeSucceededEvent = parseAbiItem(
  "event ChallengeSucceeded(bytes32 indexed orderHash, bytes32 indexed fillerNamehash, bytes32 indexed challengerNode, uint256 slashAmount)",
);

const ChallengeFailedEvent = parseAbiItem(
  "event ChallengeFailed(bytes32 indexed orderHash, bytes32 indexed fillerNamehash, address challenger)",
);

// ── ABI for SolverRegistry.setText() ────────────────────────────

const SetTextABI = [
  {
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
      { name: "value", type: "string" },
    ],
    name: "setText",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// ── Reputation constants ────────────────────────────────────────

const REPUTATION_SCALE = 1_000_000_000_000_000_000n; // 1e18
const REP_PENALTY = 50_000_000_000_000_000n;  // 0.05 (5%) penalty per successful challenge
const REP_BONUS = 10_000_000_000_000_000n;    // 0.01 (1%) bonus per failed challenge (solver defended)

export interface ChallengeListenerConfig {
  /** RPC URL for reading challenge events */
  rpcUrl: string;
  /** RPC URL for writing reputation (may be Anvil) */
  recorderRpcUrl: string;
  /** Relayer private key */
  relayerPrivateKey: `0x${string}`;
  /** Challenger contract address */
  challengerAddress: Address;
  /** SolverRegistry address (for setText reputation calls) */
  solverRegistryAddress: Address;
  /** Use Base Sepolia chain for protocol contracts */
  useBaseSepolia?: boolean;
}

/**
 * Listens for ChallengeSucceeded and ChallengeFailed events from the
 * Challenger contract. For each outcome:
 *
 * 1. Marks the fill as slashed (succeeded) or defended (failed) in MongoDB
 * 2. Writes a reputation delta to MongoDB reputation_updates collection
 * 3. Updates the solver's on-chain reputation via SolverRegistry.setText()
 *
 * The spec says reputation flush is "daily via KeeperHub" but for the
 * hackathon we flush immediately on each challenge outcome.
 */
export async function startChallengeListener(
  config: ChallengeListenerConfig,
): Promise<() => void> {
  const chain = config.useBaseSepolia ? baseSepolia : base;

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });

  const account = privateKeyToAccount(config.relayerPrivateKey);
  const walletClient = createWalletClient({
    chain,
    transport: http(config.recorderRpcUrl),
    account,
  });

  console.log(`[challenge-listener] Watching Challenger at ${config.challengerAddress}`);

  let isRunning = true;
  let lastProcessedBlock = await publicClient.getBlockNumber();

  const poll = async () => {
    while (isRunning) {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        if (currentBlock <= lastProcessedBlock) {
          await sleep(5000);
          continue;
        }

        const from = lastProcessedBlock + 1n;
        const to = currentBlock - from > 9n ? from + 9n : currentBlock;

        // Fetch both event types in parallel
        const [successLogs, failLogs] = await Promise.all([
          publicClient.getLogs({
            address: config.challengerAddress,
            event: ChallengeSucceededEvent,
            fromBlock: from,
            toBlock: to,
          }),
          publicClient.getLogs({
            address: config.challengerAddress,
            event: ChallengeFailedEvent,
            fromBlock: from,
            toBlock: to,
          }),
        ]);

        // ── Handle successful challenges (solver was bad) ─────────
        for (const log of successLogs) {
          const orderHash = log.args.orderHash!;
          const fillerNamehash = log.args.fillerNamehash!;
          const slashAmount = log.args.slashAmount!;
          const tag = orderHash.slice(0, 10);

          console.log(`[challenge-listener] ${tag} ChallengeSucceeded — slashed ${slashAmount}`);

          // Mark fill as slashed + finalized in MongoDB
          const fills = await getFillsCollection();
          await fills.updateOne(
            { orderHash },
            { $set: { slashed: true, finalized: true, slashAmount: slashAmount.toString() } },
          );

          // Write reputation delta
          await writeReputationDelta(fillerNamehash, -REP_PENALTY, orderHash, "challenge_succeeded");

          // Flush reputation to chain immediately
          await flushReputation(walletClient, config.solverRegistryAddress, fillerNamehash);
        }

        // ── Handle failed challenges (solver was fine) ────────────
        for (const log of failLogs) {
          const orderHash = log.args.orderHash!;
          const fillerNamehash = log.args.fillerNamehash!;
          const tag = orderHash.slice(0, 10);

          console.log(`[challenge-listener] ${tag} ChallengeFailed — solver defended`);

          // Mark fill as defended in MongoDB
          const fills = await getFillsCollection();
          await fills.updateOne(
            { orderHash },
            { $set: { challengeFailed: true } },
          );

          // Solver gets a small reputation bonus for being wrongly challenged
          await writeReputationDelta(fillerNamehash, REP_BONUS, orderHash, "challenge_failed");

          // Flush reputation to chain
          await flushReputation(walletClient, config.solverRegistryAddress, fillerNamehash);
        }

        lastProcessedBlock = to;
      } catch (err) {
        console.error("[challenge-listener] Poll error:", err);
      }

      await sleep(5000);
    }
  };

  poll().catch((err) =>
    console.error("[challenge-listener] Fatal poll error:", err),
  );

  return () => {
    isRunning = false;
    console.log("[challenge-listener] Stopped");
  };
}

/**
 * Write a reputation delta to MongoDB. Each row is an immutable event.
 * The cumulative reputation for a node is the sum of all deltas.
 */
async function writeReputationDelta(
  fillerNamehash: string,
  delta: bigint,
  orderHash: string,
  reason: string,
): Promise<void> {
  const db = await getDb();
  const collection = db.collection(MONGO_COLLECTIONS.reputationUpdates);
  await collection.insertOne({
    fillerNamehash,
    delta: delta.toString(),
    orderHash,
    reason,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

/**
 * Compute cumulative reputation for a node and flush to SolverRegistry on-chain.
 * reputation = clamp(initialRep + sum(deltas), 0, 1e18)
 */
async function flushReputation(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletClient: any,
  solverRegistryAddress: Address,
  fillerNamehash: string,
): Promise<void> {
  try {
    const db = await getDb();
    const collection = db.collection(MONGO_COLLECTIONS.reputationUpdates);

    // Sum all deltas for this node
    const docs = await collection.find({ fillerNamehash }).toArray();
    let totalDelta = 0n;
    for (const doc of docs) {
      totalDelta += BigInt(doc.delta);
    }

    // Start from 500000000000000000 (0.5) as initial reputation
    const initial = 500_000_000_000_000_000n;
    let newRep = initial + totalDelta;

    // Clamp to [0, 1e18]
    if (newRep < 0n) newRep = 0n;
    if (newRep > REPUTATION_SCALE) newRep = REPUTATION_SCALE;

    // Write to chain
    await walletClient.writeContract({
      address: solverRegistryAddress,
      abi: SetTextABI,
      functionName: "setText",
      args: [fillerNamehash as `0x${string}`, "reckon.reputation", newRep.toString()],
    });

    console.log(`[challenge-listener] Reputation flushed for ${fillerNamehash.slice(0, 10)}: ${newRep}`);
  } catch (err: any) {
    const reason = err?.shortMessage ?? err?.message ?? "unknown";
    console.warn(`[challenge-listener] Reputation flush failed: ${reason}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
