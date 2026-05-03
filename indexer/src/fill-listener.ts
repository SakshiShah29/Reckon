import {
  createPublicClient,
  http,
  defineChain,
  type Address,
} from "viem";
import {
  PriorityOrderReactorABI,
  PRIORITY_ORDER_REACTOR,
} from "@reckon-protocol/types";
import { getDb } from "./db.js";
import { createLogger } from "./logger.js";

const log = createLogger("fill-listener");

const CURSOR_COLLECTION = "listener_cursors";
const CURSOR_KEY = "fill-listener";

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

/**
 * Parsed Fill event from UniswapX PriorityOrderReactor.
 * This is the RAW reactor event — not yet enriched with order details.
 */
export interface RawFillEvent {
  orderHash: `0x${string}`;
  filler: `0x${string}`;
  swapper: `0x${string}`;
  nonce: bigint;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
}

export type RawFillHandler = (fill: RawFillEvent) => Promise<void>;

/**
 * Subscribes to Fill events from the UniswapX PriorityOrderReactor on Base.
 * Polls every 2 seconds (works with both Anvil fork and Base mainnet HTTP RPCs).
 *
 * For each Fill event, invokes the handler with parsed event data.
 * The handler (fill-recorder) is responsible for enriching the data
 * and recording it on-chain + MongoDB.
 *
 * @returns Cleanup function to stop polling
 */
export async function startFillListener(
  rpcUrl: string,
  handler: RawFillHandler,
): Promise<() => void> {
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  const reactorAddress = PRIORITY_ORDER_REACTOR as Address;

  log.info("Starting Fill event listener", {
    reactor: reactorAddress,
    rpc: rpcUrl,
  });

  // Detect RPC block range limit (free public RPCs like mainnet.base.org cap at 10 blocks)
  // Alchemy/Infura support 2000+, Anvil has no limit
  let maxChunkSize = 500n;
  try {
    const testFrom = await client.getBlockNumber();
    const testRange = testFrom > 500n ? 500n : testFrom;
    await client.getLogs({
      address: reactorAddress,
      event: PriorityOrderReactorABI[0],
      fromBlock: testFrom - testRange,
      toBlock: testFrom,
    });
    log.info("RPC supports 500-block range queries");
  } catch {
    // If range query fails, fall back to small chunks for free RPCs
    maxChunkSize = 9n;
    log.warn("RPC limits detected — falling back to 9-block chunks (free RPC detected)");
  }

  let isRunning = true;
  const currentBlock = await client.getBlockNumber();

  // Resume from persisted cursor, or start from current block on first boot
  const db = await getDb();
  const cursorDoc = await db.collection(CURSOR_COLLECTION).findOne({ key: CURSOR_KEY });
  let lastProcessedBlock = cursorDoc
    ? BigInt(cursorDoc.blockNumber)
    : currentBlock;

  const blockGap = currentBlock - lastProcessedBlock;
  log.info("Poll loop starting", {
    startBlock: lastProcessedBlock.toString(),
    currentBlock: currentBlock.toString(),
    blockGap: blockGap.toString(),
    chunkSize: maxChunkSize.toString(),
    resumed: cursorDoc ? "yes" : "no (first boot)",
  });

  let totalEventsFound = 0;
  let pollCount = 0;

  const poll = async () => {
    while (isRunning) {
      try {
        const currentBlock = await client.getBlockNumber();
        if (currentBlock <= lastProcessedBlock) {
          await sleep(2000);
          continue;
        }

        // Query in chunks sized to the RPC's limit
        const from = lastProcessedBlock + 1n;
        const to = currentBlock - from > maxChunkSize ? from + maxChunkSize : currentBlock;

        const logs = await client.getLogs({
          address: reactorAddress,
          event: PriorityOrderReactorABI[0], // Fill event
          fromBlock: from,
          toBlock: to,
        });

        pollCount++;

        if (logs.length > 0) {
          totalEventsFound += logs.length;
          log.info(`Found ${logs.length} Fill event(s)`, {
            blocks: `${from}..${to}`,
            totalFound: totalEventsFound,
          });
        }

        // Log progress every 100 polls when catching up
        if (pollCount % 100 === 0 && to < currentBlock) {
          const remaining = currentBlock - to;
          log.info("Catch-up progress", {
            processedUpTo: to.toString(),
            blocksRemaining: remaining.toString(),
            pollCount,
          });
        }

        for (const logEntry of logs) {
          const rawFill: RawFillEvent = {
            orderHash: logEntry.args.orderHash!,
            filler: logEntry.args.filler!,
            swapper: logEntry.args.swapper!,
            nonce: logEntry.args.nonce!,
            blockNumber: logEntry.blockNumber,
            transactionHash: logEntry.transactionHash,
          };

          try {
            await handler(rawFill);
          } catch (err) {
            log.error(
              `Handler error for fill`,
              err,
              {
                orderHash: rawFill.orderHash,
                filler: rawFill.filler,
                block: rawFill.blockNumber.toString(),
              },
            );
          }
        }

        lastProcessedBlock = to;

        // Persist cursor so restarts resume from here
        await db.collection(CURSOR_COLLECTION).updateOne(
          { key: CURSOR_KEY },
          { $set: { key: CURSOR_KEY, blockNumber: to.toString(), updatedAt: Date.now() } },
          { upsert: true },
        );
      } catch (err) {
        log.error("Poll cycle error (will retry in 2s)", err);
      }

      await sleep(2000);
    }
  };

  poll().catch((err) =>
    log.error("Fatal poll error — fill listener stopped", err),
  );

  return () => {
    isRunning = false;
    log.info("Fill listener stopped", { totalEventsFound, pollCount });
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
