import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getFillsCollection } from "./db.js";
import { createLogger } from "./logger.js";

const log = createLogger("bond-unlocker");

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
  /** FillRegistry address */
  fillRegistryAddress: Address;
  /** Use Base Sepolia chain for protocol contracts */
  useBaseSepolia?: boolean;
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
  const chain = config.useBaseSepolia ? baseSepolia : base;

  const publicClient = createPublicClient({
    chain,
    transport: http(config.rpcUrl),
  });

  const account = privateKeyToAccount(config.relayerPrivateKey);
  const walletClient = createWalletClient({
    chain,
    transport: http(config.rpcUrl),
    account,
  });

  log.info("Starting bond unlocker sweep", {
    fillRegistry: config.fillRegistryAddress,
    chain: chain.name,
    interval: "30s",
  });

  let isRunning = true;
  let totalFinalized = 0;
  let sweepCount = 0;

  const sweep = async () => {
    while (isRunning) {
      try {
        sweepCount++;
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
          log.info(`Found ${expiredFills.length} expired fill(s) to finalize`, {
            currentBlock,
            sweepCount,
          });
        }

        for (const fill of expiredFills) {
          const tag = fill.orderHash;
          try {
            const txHash = await walletClient.writeContract({
              address: config.fillRegistryAddress,
              abi: FinalizeFillABI,
              functionName: "finalizeFill",
              args: [fill.orderHash as `0x${string}`],
            });

            totalFinalized++;
            log.info(`${tag} bond finalized`, {
              finalizeTx: txHash,
              fillBlock: fill.fillBlock,
              challengeDeadline: fill.challengeDeadline,
              currentBlock,
              totalFinalized,
            });

            // Mark as finalized in MongoDB so we don't retry
            await collection.updateOne(
              { orderHash: fill.orderHash },
              { $set: { finalized: true, finalizeTxHash: txHash } },
            );
          } catch (err: any) {
            const reason = err?.shortMessage ?? err?.message ?? "unknown";
            // If it fails with CounterUnderflow or AlreadySlashed, mark as finalized anyway
            if (reason.includes("0x") || reason.includes("revert")) {
              log.warn(`${tag} already finalized or slashed on-chain — marking done`, {
                reason,
              });
              await collection.updateOne(
                { orderHash: fill.orderHash },
                { $set: { finalized: true } },
              );
            } else {
              log.warn(`${tag} finalize tx FAILED: ${reason}`, {
                fillBlock: fill.fillBlock,
                currentBlock,
              });
            }
          }
        }
      } catch (err) {
        log.error("Sweep cycle error (will retry in 30s)", err);
      }

      await sleep(30_000);
    }
  };

  sweep().catch((err) =>
    log.error("Fatal sweep error — bond unlocker stopped", err),
  );

  return () => {
    isRunning = false;
    log.info("Bond unlocker stopped", { totalFinalized, sweepCount });
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
