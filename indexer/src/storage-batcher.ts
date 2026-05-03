import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FillRecord, FillBatch } from "@reckon-protocol/types";
import {
  FILL_BATCH_SIZE,
  FILL_BATCH_INTERVAL_MS,
} from "@reckon-protocol/types";
import { getBatchesCollection } from "./db.js";
import { defineChain, type Address, type WalletClient } from "viem";
import { createLogger, formatDuration } from "./logger.js";

const log = createLogger("storage-batcher");

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

/**
 * ABI for FillRegistry.anchorBatch() — emits FillBatchAnchored on Base.
 * Called by the recorder EOA after uploading a batch to 0G Storage.
 */
const AnchorBatchABI = [
  {
    inputs: [
      { name: "rootHash", type: "bytes32" },
      { name: "firstOrderHash", type: "bytes32" },
      { name: "lastOrderHash", type: "bytes32" },
    ],
    name: "anchorBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface BatcherConfig {
  /** 0G Galileo RPC URL */
  zgRpcUrl: string;
  /** 0G Storage indexer URL */
  zgIndexerUrl: string;
  /** Private key for 0G Storage upload */
  zgPrivateKey: string;
  /** Wallet client for on-chain anchorBatch call (optional — omit to skip anchoring) */
  walletClient?: WalletClient;
  /** FillRegistry address on Base */
  fillRegistryAddress?: Address;
}

/**
 * Storage batcher that accumulates fill records and flushes them
 * to 0G Galileo Storage Log in batches.
 *
 * Triggers: N >= 50 records OR 60 seconds elapsed (whichever first).
 * Writes JSON Lines format (deterministic ordering by fillBlock).
 *
 * Each batch upload returns a Merkle root hash which is:
 * 1. Recorded in MongoDB fill_batches collection
 * 2. (Future) Emitted on-chain via FillBatchAnchored event
 */
export function createStorageBatcher(config: BatcherConfig) {
  const buffer: FillRecord[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let isFlushing = false;
  let totalBatches = 0;
  let totalRecordsFlushed = 0;

  log.info("Storage batcher created", {
    batchSize: FILL_BATCH_SIZE,
    flushIntervalMs: FILL_BATCH_INTERVAL_MS,
    anchoringEnabled: !!(config.walletClient && config.fillRegistryAddress),
  });

  /**
   * Flushes the current buffer to 0G Storage.
   */
  async function flush(): Promise<void> {
    if (buffer.length === 0 || isFlushing) return;
    isFlushing = true;

    // Drain buffer
    const batch = buffer.splice(0, buffer.length);

    // Sort deterministically by fillBlock, then orderHash
    batch.sort((a, b) =>
      a.fillBlock !== b.fillBlock
        ? a.fillBlock - b.fillBlock
        : a.orderHash.localeCompare(b.orderHash),
    );

    const firstOrderHash = batch[0].orderHash;
    const lastOrderHash = batch[batch.length - 1].orderHash;
    const tag = `batch#${totalBatches + 1}`;
    const flushStart = Date.now();

    log.info(`${tag} flushing ${batch.length} records to 0G Storage...`, {
      firstOrder: firstOrderHash,
      lastOrder: lastOrderHash,
      fillBlockRange: `${batch[0].fillBlock}..${batch[batch.length - 1].fillBlock}`,
    });

    // Write to temp file in JSON Lines format
    const tempDir = mkdtempSync(join(tmpdir(), "reckon-batch-"));
    const tempPath = join(tempDir, "fills.jsonl");

    try {
      const lines = batch.map((fill) => JSON.stringify(fill)).join("\n");
      writeFileSync(tempPath, lines, "utf-8");

      // Upload to 0G Storage
      const uploadStart = Date.now();
      const rootHash = await upload0GStorage(tempPath, config);
      const uploadDuration = Date.now() - uploadStart;

      totalBatches++;
      totalRecordsFlushed += batch.length;

      log.info(`${tag} uploaded to 0G Storage`, {
        rootHash: rootHash,
        uploadDuration: formatDuration(uploadDuration),
        records: batch.length,
        totalBatches,
        totalRecordsFlushed,
      });

      // Record batch in MongoDB
      const batchRecord: FillBatch = {
        rootHash,
        firstOrderHash,
        lastOrderHash,
        recordCount: batch.length,
        anchoredAt: Math.floor(Date.now() / 1000),
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      };

      const collection = await getBatchesCollection();
      await collection.updateOne(
        { rootHash },
        { $setOnInsert: batchRecord },
        { upsert: true },
      );
      log.info(`${tag} batch metadata saved to MongoDB`, {
        rootHash: rootHash,
      });

      // Anchor the Merkle root on-chain so anyone can verify the 0G data
      if (config.walletClient && config.fillRegistryAddress) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wallet client generic type mismatch
          const anchorTx = await (config.walletClient as any).writeContract({
            chain: base,
            address: config.fillRegistryAddress,
            abi: AnchorBatchABI,
            functionName: "anchorBatch",
            args: [
              rootHash as `0x${string}`,
              firstOrderHash as `0x${string}`,
              lastOrderHash as `0x${string}`,
            ],
          });
          batchRecord.txHash = anchorTx;

          log.info(`${tag} anchored on-chain`, {
            anchorTx: anchorTx,
            rootHash: rootHash,
          });

          // Update MongoDB with the anchor tx hash
          await collection.updateOne({ rootHash }, { $set: { txHash: anchorTx } });
        } catch (err: any) {
          const reason = err?.shortMessage ?? err?.message ?? "unknown";
          log.warn(`${tag} anchorBatch on-chain FAILED: ${reason}`, {
            rootHash: rootHash,
          });
        }
      }

      log.info(`${tag} flush complete`, {
        totalDuration: formatDuration(Date.now() - flushStart),
      });
    } catch (err) {
      log.error(`${tag} upload FAILED — ${batch.length} records returned to buffer`, err);
      // Put records back in buffer for retry on next flush
      buffer.unshift(...batch);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      isFlushing = false;
    }
  }

  /**
   * Resets the flush timer. Called after each add.
   */
  function resetTimer(): void {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flush().catch((err) =>
        log.error("Timer-triggered flush failed", err),
      );
    }, FILL_BATCH_INTERVAL_MS);
  }

  return {
    /**
     * Adds a fill to the batch buffer. Triggers flush if buffer reaches FILL_BATCH_SIZE.
     */
    async add(fill: FillRecord): Promise<void> {
      buffer.push(fill);
      log.debug(`Record added to buffer`, {
        orderHash: fill.orderHash,
        bufferSize: buffer.length,
        threshold: FILL_BATCH_SIZE,
      });

      if (buffer.length >= FILL_BATCH_SIZE) {
        log.info(`Buffer reached threshold (${FILL_BATCH_SIZE}) — triggering flush`);
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = null;
        await flush();
      } else {
        resetTimer();
      }
    },

    /**
     * Forces a flush of any remaining records. Call during shutdown.
     */
    async forceFlush(): Promise<void> {
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = null;
      if (buffer.length > 0) {
        log.info(`Force-flushing ${buffer.length} remaining records`);
      }
      await flush();
    },

    /** Returns the current buffer size. */
    get pending(): number {
      return buffer.length;
    },
  };
}

/**
 * Uploads a file to 0G Galileo Storage and returns the Merkle root hash.
 */
async function upload0GStorage(
  filePath: string,
  config: BatcherConfig,
): Promise<string> {
  const { ZgFile, Indexer } = await import("@0gfoundation/0g-ts-sdk");
  const { ethers } = await import("ethers");

  const provider = new ethers.JsonRpcProvider(config.zgRpcUrl);
  const signer = new ethers.Wallet(config.zgPrivateKey, provider);
  const indexer = new Indexer(config.zgIndexerUrl);

  const file = await ZgFile.fromFilePath(filePath);
  const [tree, treeErr] = await file.merkleTree();
  if (treeErr || !tree) {
    throw new Error(`Failed to compute Merkle tree: ${treeErr}`);
  }
  const rootHash = tree.rootHash();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM ethers type mismatch
  const [_tx, uploadErr] = await indexer.upload(file, config.zgRpcUrl, signer as any);
  if (uploadErr) {
    throw new Error(`Failed to upload to 0G Storage: ${uploadErr}`);
  }

  await file.close();
  return rootHash as string;
}
