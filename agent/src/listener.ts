import {
  createPublicClient,
  http,
  defineChain,
  type Address,
  parseAbiItem,
} from "viem";
import type { FillRecord } from "@reckon-protocol/types";
import { CHALLENGE_WINDOW_BLOCKS } from "@reckon-protocol/types";

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

const FILL_RECORDED_EVENT = parseAbiItem(
  "event FillRecorded(bytes32 indexed orderHash, bytes32 indexed fillerNamehash, address indexed swapper, uint64 fillBlock)",
);

export type FillHandler = (fill: FillRecord) => Promise<void>;

/**
 * Subscribes to FillRecorded events from the FillRegistry contract.
 * For each event, fetches full fill details from the contract and invokes the handler.
 *
 * Works on both Anvil fork (dev) and real Base mainnet (production).
 */
export async function startFillListener(
  rpcUrl: string,
  fillRegistryAddress: Address,
  handler: FillHandler,
): Promise<() => void> {
  const client = createPublicClient({
    chain: base,
    transport: http(rpcUrl),
  });

  console.log(`[listener] Subscribing to FillRecorded events on ${fillRegistryAddress}`);
  console.log(`[listener] RPC: ${rpcUrl}`);

  // For WebSocket-capable RPCs, use watchEvent for real-time subscription
  // For HTTP RPCs (including Anvil), poll every 2 seconds
  let isRunning = true;
  let lastProcessedBlock = await client.getBlockNumber();

  const poll = async () => {
    while (isRunning) {
      try {
        const currentBlock = await client.getBlockNumber();
        if (currentBlock <= lastProcessedBlock) {
          await sleep(2000);
          continue;
        }

        const logs = await client.getLogs({
          address: fillRegistryAddress,
          event: FILL_RECORDED_EVENT,
          fromBlock: lastProcessedBlock + 1n,
          toBlock: currentBlock,
        });

        for (const log of logs) {
          const orderHash = log.args.orderHash!;
          const fillerNamehash = log.args.fillerNamehash!;
          const swapper = log.args.swapper!;
          const fillBlock = Number(log.args.fillBlock!);

          // Read full fill details from the contract
          const fillData = await client.readContract({
            address: fillRegistryAddress,
            abi: [
              {
                inputs: [{ name: "orderHash", type: "bytes32" }],
                name: "fills",
                outputs: [
                  { name: "fillerNamehash", type: "bytes32" },
                  { name: "swapper", type: "address" },
                  { name: "tokenIn", type: "address" },
                  { name: "tokenOut", type: "address" },
                  { name: "inputAmount", type: "uint128" },
                  { name: "outputAmount", type: "uint128" },
                  { name: "eboTolerance", type: "uint16" },
                  { name: "fillBlock", type: "uint64" },
                  { name: "challengeDeadline", type: "uint64" },
                  { name: "slashed", type: "bool" },
                ],
                stateMutability: "view",
                type: "function",
              },
            ] as const,
            functionName: "fills",
            args: [orderHash],
          });

          const fill: FillRecord = {
            orderHash,
            filler: "0x0000000000000000000000000000000000000000",
            fillerNamehash: fillData[0],
            swapper: fillData[1],
            tokenIn: fillData[2],
            tokenOut: fillData[3],
            inputAmount: fillData[4].toString(),
            outputAmount: fillData[5].toString(),
            eboToleranceBps: fillData[6],
            fillBlock: Number(fillData[7]),
            fillTimestamp: Math.floor(Date.now() / 1000),
            challengeDeadline: Number(fillData[8]),
            txHash: log.transactionHash!,
          };

          // Check if still within challenge window
          if (currentBlock > BigInt(fill.challengeDeadline)) {
            console.log(
              `[listener] Fill ${orderHash.slice(0, 10)}... past challenge deadline, skipping`,
            );
            continue;
          }

          console.log(
            `[listener] New fill detected: ${orderHash.slice(0, 10)}... block=${fillBlock} deadline=${fill.challengeDeadline}`,
          );

          try {
            await handler(fill);
          } catch (err) {
            console.error(
              `[listener] Handler error for ${orderHash.slice(0, 10)}...:`,
              err,
            );
          }
        }

        lastProcessedBlock = currentBlock;
      } catch (err) {
        console.error("[listener] Poll error:", err);
      }

      await sleep(2000);
    }
  };

  // Start polling in background
  poll().catch((err) =>
    console.error("[listener] Fatal poll error:", err),
  );

  // Return cleanup function
  return () => {
    isRunning = false;
    console.log("[listener] Stopped");
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
