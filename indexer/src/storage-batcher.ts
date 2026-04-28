import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { FillRecord, FillBatch } from "@reckon-protocol/types";
import {
  FILL_BATCH_SIZE,
  FILL_BATCH_INTERVAL_MS,
} from "@reckon-protocol/types";
import { getBatchesCollection } from "./db.js";

export interface BatcherConfig {
  /** 0G Galileo RPC URL */
  zgRpcUrl: string;
  /** 0G Storage indexer URL */
  zgIndexerUrl: string;
  /** Private key for 0G Storage upload */
  zgPrivateKey: string;
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
    const tag = `batch[${firstOrderHash.slice(0, 8)}..${lastOrderHash.slice(0, 8)}]`;

    console.log(`[storage-batcher] ${tag} flushing ${batch.length} records to 0G Storage...`);

    // Write to temp file in JSON Lines format
    const tempDir = mkdtempSync(join(tmpdir(), "reckon-batch-"));
    const tempPath = join(tempDir, "fills.jsonl");

    try {
      const lines = batch.map((fill) => JSON.stringify(fill)).join("\n");
      writeFileSync(tempPath, lines, "utf-8");

      // Upload to 0G Storage
      const rootHash = await upload0GStorage(tempPath, config);
      console.log(`[storage-batcher] ${tag} uploaded, rootHash: ${rootHash.slice(0, 16)}...`);

      // Record batch in MongoDB
      const batchRecord: FillBatch = {
        rootHash,
        firstOrderHash,
        lastOrderHash,
        recordCount: batch.length,
        anchoredAt: Math.floor(Date.now() / 1000),
        txHash: "0x0000000000000000000000000000000000000000000000000000000000000000", // TODO: emit FillBatchAnchored on-chain
      };

      const collection = await getBatchesCollection();
      await collection.updateOne(
        { rootHash },
        { $setOnInsert: batchRecord },
        { upsert: true },
      );
      console.log(`[storage-batcher] ${tag} recorded in MongoDB`);

      // TODO Phase 3: Call FillRegistry.anchorBatch(rootHash, firstOrderHash, lastOrderHash)
      // to emit FillBatchAnchored event on Base
    } catch (err) {
      console.error(`[storage-batcher] ${tag} upload failed:`, err);
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
        console.error("[storage-batcher] Timer flush error:", err),
      );
    }, FILL_BATCH_INTERVAL_MS);
  }

  return {
    /**
     * Adds a fill to the batch buffer. Triggers flush if buffer reaches FILL_BATCH_SIZE.
     */
    async add(fill: FillRecord): Promise<void> {
      buffer.push(fill);

      if (buffer.length >= FILL_BATCH_SIZE) {
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
