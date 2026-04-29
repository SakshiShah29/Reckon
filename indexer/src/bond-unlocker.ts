import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getFillsCollection } from "./db.js";

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

/**
 * ABI for FillRegistry.finalizeFill() — unlocks the solver's bond after
 * the challenge window expires without a challenge.
 */
const FinalizeFillABI = [
  {
    inputs: [{ name: "orderHash", type: "bytes32" }],
    name: "finalizeFill",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface BondUnlockerConfig {
  /** RPC URL for reading current block + sending finalize txs */
  rpcUrl: string;
  /** Relayer private key (recorder EOA) */
  relayerPrivateKey: `0x${string}`;
  /** FillRegistry address on Base */
  fillRegistryAddress: Address;
}

/**
 * Starts a periodic sweep that checks MongoDB for fills whose challenge
 * window has expired. For each expired fill, calls FillRegistry.finalizeFill()
 * to decrement the solver's open-fill counter in SolverBondVault.
 *
 * How it works:
 * 1. Every 30 seconds, query MongoDB for fills where:
 *    - challengeDeadline < currentBlock
 *    - finalized != true (not yet unlocked)
 * 2. For each, call finalizeFill(orderHash) on-chain
 * 3. Mark as finalized in MongoDB
 *
 * @returns Cleanup function to stop the sweep
 */
export async function startBondUnlocker(
  config: BondUnlockerConfig,
): Promise<() => void> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(config.rpcUrl),
  });

  const account = privateKeyToAccount(config.relayerPrivateKey);
  const walletClient = createWalletClient({
    chain: base,
    transport: http(config.rpcUrl),
    account,
  });

  console.log(`[bond-unlocker] Started — sweeping every 30s`);
  console.log(`[bond-unlocker] FillRegistry: ${config.fillRegistryAddress}`);

  let isRunning = true;

  const sweep = async () => {
    while (isRunning) {
      try {
        const currentBlock = Number(await publicClient.getBlockNumber());
        const collection = await getFillsCollection();

        // Find fills that were recorded on-chain, past their challenge window, and not yet finalized
        const expiredFills = await collection
          .find({
            recordedOnChain: true,
            challengeDeadline: { $lt: currentBlock },
            finalized: { $ne: true },
          })
          .limit(20) // batch 20 at a time to avoid tx spam
          .toArray();

        if (expiredFills.length > 0) {
          console.log(`[bond-unlocker] Found ${expiredFills.length} expired fill(s) to finalize`);
        }

        for (const fill of expiredFills) {
          const tag = fill.orderHash.slice(0, 10);
          try {
            const txHash = await walletClient.writeContract({
              chain: base,
              address: config.fillRegistryAddress,
              abi: FinalizeFillABI,
              functionName: "finalizeFill",
              args: [fill.orderHash as `0x${string}`],
            });
            console.log(`[bond-unlocker] ${tag} finalized: ${txHash.slice(0, 10)}...`);

            // Mark as finalized in MongoDB so we don't retry
            await collection.updateOne(
              { orderHash: fill.orderHash },
              { $set: { finalized: true, finalizeTxHash: txHash } },
            );
          } catch (err: any) {
            const reason = err?.shortMessage ?? err?.message ?? "unknown";
            // If it fails with CounterUnderflow or AlreadySlashed, mark as finalized anyway
            if (reason.includes("0x") || reason.includes("revert")) {
              console.warn(`[bond-unlocker] ${tag} already finalized or slashed, marking done`);
              await collection.updateOne(
                { orderHash: fill.orderHash },
                { $set: { finalized: true } },
              );
            } else {
              console.warn(`[bond-unlocker] ${tag} finalize failed: ${reason}`);
            }
          }
        }
      } catch (err) {
        console.error("[bond-unlocker] Sweep error:", err);
      }

      await sleep(30_000);
    }
  };

  sweep().catch((err) =>
    console.error("[bond-unlocker] Fatal sweep error:", err),
  );

  return () => {
    isRunning = false;
    console.log("[bond-unlocker] Stopped");
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
