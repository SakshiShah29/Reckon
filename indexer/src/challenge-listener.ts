import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseAbiItem,
  decodeEventLog,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getFillsCollection } from "./db.js";
import { getDb } from "./db.js";
import { MONGO_COLLECTIONS } from "@reckon-protocol/types";
import { createLogger, formatDuration } from "./logger.js";

const log = createLogger("challenge-listener");

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

const ChallengeSubmittedEvent = parseAbiItem(
  "event ChallengeSubmitted(bytes32 indexed orderHash, bytes32 indexed challengerNode, uint256 agentTokenId, uint256 challengerBond)",
);

const RoyaltyPaidEvent = parseAbiItem(
  "event RoyaltyPaid(uint256 indexed tokenId, address indexed swapper, uint256 swapperAmt, uint256 ownerAmt, uint256 protocolAmt)",
);

const BondSlashedEvent = parseAbiItem(
  "event BondSlashed(bytes32 indexed node, uint256 amount, address to)",
);

const ERC20TransferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
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

  log.info("Starting challenge listener", {
    challenger: config.challengerAddress,
    chain: chain.name,
    solverRegistry: config.solverRegistryAddress,
  });

  let isRunning = true;
  let lastProcessedBlock = await publicClient.getBlockNumber();
  let totalSucceeded = 0;
  let totalFailed = 0;

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

        if (successLogs.length > 0 || failLogs.length > 0) {
          log.info(`Found challenge events in blocks ${from}..${to}`, {
            succeeded: successLogs.length,
            failed: failLogs.length,
          });
        }

        // ── Handle successful challenges (solver was bad) ─────────
        for (const logEntry of successLogs) {
          const startTime = Date.now();
          const orderHash = logEntry.args.orderHash!;
          const fillerNamehash = logEntry.args.fillerNamehash!;
          const challengerNode = logEntry.args.challengerNode!;
          const slashAmount = logEntry.args.slashAmount!;
          const tag = orderHash;

          totalSucceeded++;
          log.info(`${tag} CHALLENGE SUCCEEDED — solver slashed`, {
            slashAmount: slashAmount.toString(),
            fillerNamehash,
            challengerNode,
            block: logEntry.blockNumber.toString(),
            tx: logEntry.transactionHash,
          });

          // Parse the tx receipt to get ChallengeSubmitted, RoyaltyPaid, BondSlashed, and ERC20 Transfers
          let agentTokenId = "";
          let challengerBond = 0n;
          let royaltySwapper = 0n;
          let royaltyOwner = 0n;
          let royaltyProtocol = 0n;
          let royaltySwapperAddr = "";
          let challengerAddress = "";
          // Per-recipient ERC20 Transfer tx evidence (logIndex within the same tx)
          const transferLogs: Array<{ from: string; to: string; value: string; logIndex: number }> = [];
          try {
            const receipt = await publicClient.getTransactionReceipt({ hash: logEntry.transactionHash });
            challengerAddress = receipt.from;
            for (const rxLog of receipt.logs) {
              // Parse ChallengeSubmitted
              try {
                const decoded = decodeEventLog({
                  abi: [ChallengeSubmittedEvent],
                  data: rxLog.data,
                  topics: rxLog.topics,
                });
                if (decoded.eventName === "ChallengeSubmitted") {
                  agentTokenId = decoded.args.agentTokenId.toString();
                  challengerBond = decoded.args.challengerBond;
                }
              } catch { /* not this event */ }
              // Parse RoyaltyPaid
              try {
                const decoded = decodeEventLog({
                  abi: [RoyaltyPaidEvent],
                  data: rxLog.data,
                  topics: rxLog.topics,
                });
                if (decoded.eventName === "RoyaltyPaid") {
                  royaltySwapper = decoded.args.swapperAmt;
                  royaltyOwner = decoded.args.ownerAmt;
                  royaltyProtocol = decoded.args.protocolAmt;
                  royaltySwapperAddr = decoded.args.swapper;
                }
              } catch { /* not this event */ }
              // Parse ERC20 Transfer events (USDC movements)
              try {
                const decoded = decodeEventLog({
                  abi: [ERC20TransferEvent],
                  data: rxLog.data,
                  topics: rxLog.topics,
                });
                if (decoded.eventName === "Transfer") {
                  transferLogs.push({
                    from: decoded.args.from,
                    to: decoded.args.to,
                    value: decoded.args.value.toString(),
                    logIndex: Number(rxLog.logIndex),
                  });
                }
              } catch { /* not this event */ }
            }
          } catch (err) {
            log.warn(`${tag} Failed to parse tx receipt for extra data: ${err}`);
          }

          const db = await getDb();
          const fills = await getFillsCollection();

          // Mark fill as slashed + finalized
          await fills.updateOne(
            { orderHash },
            { $set: { slashed: true, finalized: true, slashAmount: slashAmount.toString() } },
          );

          // Look up original fill for context
          const fill = await fills.findOne({ orderHash });

          // Compute benchmarkOutput from fill data:
          // The EBBO benchmark expected output ≈ actualOutput + shortfall
          // shortfall = slashAmount (capped at solverBond, but best approximation)
          const actualOutput = fill?.outputAmount ?? "0";
          const computedBenchmark = (BigInt(actualOutput) + slashAmount).toString();

          // Write to challenges collection
          await db.collection(MONGO_COLLECTIONS.challenges).updateOne(
            { orderHash, challengerNamehash: challengerNode },
            {
              $set: {
                orderHash,
                challengerAddress: challengerAddress || challengerNode,
                challengerNamehash: challengerNode,
                agentTokenId,
                benchmarkOutput: computedBenchmark,
                actualOutput,
                eboToleranceBps: fill?.eboToleranceBps ?? 0,
                succeeded: true,
                slashAmount: slashAmount.toString(),
                challengerBond: challengerBond.toString(),
                challengeBlock: Number(logEntry.blockNumber),
                challengeTimestamp: Math.floor(Date.now() / 1000),
                txHash: logEntry.transactionHash,
              },
            },
            { upsert: true },
          );

          // Write to slashes collection — prefer on-chain RoyaltyPaid if available, else compute 60/30/10
          const swapperRestitution = royaltySwapper > 0n ? royaltySwapper : (slashAmount * 6000n) / 10000n;
          const ownerBounty = royaltyOwner > 0n ? royaltyOwner : (slashAmount * 3000n) / 10000n;
          const protocolCut = royaltyProtocol > 0n ? royaltyProtocol : slashAmount - swapperRestitution - ownerBounty;

          // Match ERC20 Transfer events to split recipients by amount
          const findTransferTo = (amount: bigint) =>
            transferLogs.find((t) => t.value === amount.toString());
          const swapperTransfer = findTransferTo(swapperRestitution);
          const ownerTransfer = findTransferTo(ownerBounty);
          const protocolTransfer = findTransferTo(protocolCut);

          // Resolve solver ENS label + linked address from subnames collection
          let solverEnsName = "";
          let solverAddress = "";
          try {
            const subname = await db.collection("subnames").findOne({ namehash: fillerNamehash });
            if (subname?.label && subname?.namespace) {
              solverEnsName = `${subname.label}.${subname.namespace}.reckonprotocol.eth`;
            }
            if (subname?.owner) {
              solverAddress = subname.owner;
            }
          } catch { /* subname lookup failed, use namehash */ }

          await db.collection(MONGO_COLLECTIONS.slashes).updateOne(
            { orderHash },
            {
              $set: {
                orderHash,
                solverNamehash: fillerNamehash,
                solverEnsName,
                solverAddress,
                reputationPenalty: REP_PENALTY.toString(),
                challengerNamehash: challengerNode,
                agentTokenId,
                slashAmount: slashAmount.toString(),
                swapperRestitution: swapperRestitution.toString(),
                ownerBounty: ownerBounty.toString(),
                protocolCut: protocolCut.toString(),
                challengerBond: challengerBond.toString(),
                // Per-recipient addresses from on-chain Transfer events
                swapperAddress: swapperTransfer?.to ?? royaltySwapperAddr ?? "",
                ownerAddress: ownerTransfer?.to ?? "",
                protocolAddress: protocolTransfer?.to ?? "",
                nlExplanation: "",
                timestamp: Math.floor(Date.now() / 1000),
                txHash: logEntry.transactionHash,
              },
            },
            { upsert: true },
          );

          log.info(`${tag} Slash split recorded`, {
            swapperRestitution: swapperRestitution.toString(),
            ownerBounty: ownerBounty.toString(),
            protocolCut: protocolCut.toString(),
          });

          // Write reputation delta
          await writeReputationDelta(fillerNamehash, -REP_PENALTY, orderHash, "challenge_succeeded");

          // Flush reputation to chain immediately
          await flushReputation(walletClient, config.solverRegistryAddress, fillerNamehash);

          log.info(`${tag} ChallengeSucceeded fully processed`, {
            duration: formatDuration(Date.now() - startTime),
            totalSucceeded,
          });
        }

        // ── Handle failed challenges (solver was fine) ────────────
        for (const logEntry of failLogs) {
          const startTime = Date.now();
          const orderHash = logEntry.args.orderHash!;
          const fillerNamehash = logEntry.args.fillerNamehash!;
          const tag = orderHash;

          totalFailed++;
          log.info(`${tag} CHALLENGE FAILED — solver defended successfully`, {
            fillerNamehash,
            challenger: logEntry.args.challenger ?? "unknown",
            block: logEntry.blockNumber.toString(),
            tx: logEntry.transactionHash,
          });

          // Parse tx receipt for ChallengeSubmitted (agentTokenId)
          let failedAgentTokenId = "";
          try {
            const receipt = await publicClient.getTransactionReceipt({ hash: logEntry.transactionHash });
                        for (const rxLog of receipt.logs) {
              try {
                const decoded = decodeEventLog({
                  abi: [ChallengeSubmittedEvent],
                  data: rxLog.data,
                  topics: rxLog.topics,
                });
                if (decoded.eventName === "ChallengeSubmitted") {
                  failedAgentTokenId = decoded.args.agentTokenId.toString();
                }
              } catch { /* not this event */ }
            }
          } catch { /* receipt fetch failed */ }

          const db = await getDb();
          const fills = await getFillsCollection();
          const fill = await fills.findOne({ orderHash });

          // Mark fill as defended
          await fills.updateOne(
            { orderHash },
            { $set: { challengeFailed: true } },
          );

          // Write to challenges collection (failed)
          await db.collection(MONGO_COLLECTIONS.challenges).updateOne(
            { orderHash },
            {
              $set: {
                orderHash,
                challengerAddress: logEntry.args.challenger ?? "",
                challengerNamehash: "",
                agentTokenId: failedAgentTokenId,
                benchmarkOutput: (fill as Record<string, unknown>)?.benchmarkOutput as string ?? "",
                actualOutput: fill?.outputAmount ?? "",
                eboToleranceBps: fill?.eboToleranceBps ?? 0,
                succeeded: false,
                slashAmount: "0",
                challengeBlock: Number(logEntry.blockNumber),
                challengeTimestamp: Math.floor(Date.now() / 1000),
                txHash: logEntry.transactionHash,
              },
            },
            { upsert: true },
          );

          // Solver gets a small reputation bonus for being wrongly challenged
          await writeReputationDelta(fillerNamehash, REP_BONUS, orderHash, "challenge_failed");

          // Flush reputation to chain
          await flushReputation(walletClient, config.solverRegistryAddress, fillerNamehash);

          log.info(`${tag} ChallengeFailed fully processed`, {
            duration: formatDuration(Date.now() - startTime),
            totalFailed,
          });
        }

        lastProcessedBlock = to;
      } catch (err) {
        log.error("Poll cycle error (will retry in 5s)", err);
      }

      await sleep(5000);
    }
  };

  poll().catch((err) =>
    log.error("Fatal poll error — challenge listener stopped", err),
  );

  return () => {
    isRunning = false;
    log.info("Challenge listener stopped", { totalSucceeded, totalFailed });
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
  log.info(`Reputation delta written`, {
    solver: fillerNamehash,
    delta: delta.toString(),
    reason,
    orderHash,
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

    log.info(`Reputation flushed to chain`, {
      solver: fillerNamehash,
      newReputation: newRep.toString(),
      totalDelta: totalDelta.toString(),
    });
  } catch (err: any) {
    const reason = err?.shortMessage ?? err?.message ?? "unknown";
    log.warn(`Reputation flush to chain FAILED: ${reason}`, {
      solver: fillerNamehash,
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
