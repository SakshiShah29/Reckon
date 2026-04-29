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

  console.log(`[fill-listener] Watching Fill events on PriorityOrderReactor`);
  console.log(`[fill-listener] Reactor: ${reactorAddress}`);
  console.log(`[fill-listener] RPC: ${rpcUrl}`);

  // Detect RPC block range limit (free public RPCs like mainnet.base.org cap at 10 blocks)
  // Alchemy/Infura support 2000+, Anvil has no limit
  let maxChunkSize = 500n;
  try {
    const testFrom = await client.getBlockNumber();
    await client.getLogs({
      address: reactorAddress,
      event: PriorityOrderReactorABI[0],
      fromBlock: testFrom - 500n,
      toBlock: testFrom,
    });
  } catch {
    // If 500-block query fails, fall back to small chunks for free RPCs
    maxChunkSize = 9n;
    console.log(`[fill-listener] RPC limits detected — using ${maxChunkSize}-block chunks`);
  }

  let isRunning = true;
  const currentBlock = await client.getBlockNumber();

  // Resume from persisted cursor, or start from current block on first boot
  const db = await getDb();
  const cursorDoc = await db.collection(CURSOR_COLLECTION).findOne({ key: CURSOR_KEY });
  let lastProcessedBlock = cursorDoc
    ? BigInt(cursorDoc.blockNumber)
    : currentBlock;
  console.log(`[fill-listener] Starting from block ${lastProcessedBlock} (current: ${currentBlock})`);

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

        if (logs.length > 0) {
          console.log(`[fill-listener] Found ${logs.length} Fill event(s) in blocks ${from}..${to}`);
        }

        for (const log of logs) {
          const rawFill: RawFillEvent = {
            orderHash: log.args.orderHash!,
            filler: log.args.filler!,
            swapper: log.args.swapper!,
            nonce: log.args.nonce!,
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          };

          try {
            await handler(rawFill);
          } catch (err) {
            console.error(
              `[fill-listener] Handler error for ${rawFill.orderHash.slice(0, 10)}:`,
              err,
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
        console.error("[fill-listener] Poll error:", err);
      }

      await sleep(2000);
    }
  };

  poll().catch((err) =>
    console.error("[fill-listener] Fatal poll error:", err),
  );

  return () => {
    isRunning = false;
    console.log("[fill-listener] Stopped");
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
