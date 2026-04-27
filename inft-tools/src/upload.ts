import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SealedBrainBlob } from "@reckon-protocol/types";

/**
 * Writes a SealedBrainBlob to a temp file and uploads to 0G Galileo Storage.
 * Returns the Merkle root hash which becomes the iNFT's tokenURI.
 *
 * Uses @0gfoundation/0g-ts-sdk for upload. The SDK is imported dynamically
 * since it may not be available in all environments.
 *
 * @param sealed - The sealed brain blob to upload
 * @param rpcUrl - 0G Galileo RPC URL
 * @param indexerUrl - 0G Storage indexer URL
 * @param privateKey - Signer private key for the upload transaction
 * @returns Merkle root hash of the uploaded file
 */
export async function uploadBrainBlob(
  sealed: SealedBrainBlob,
  rpcUrl: string,
  indexerUrl: string,
  privateKey: string,
): Promise<string> {
  // Dynamic import so this module can be loaded even if SDK isn't installed yet
  const { ZgFile, Indexer } = await import("@0gfoundation/0g-ts-sdk");
  const { ethers } = await import("ethers");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const indexer = new Indexer(indexerUrl);

  // Write sealed blob to a temp file
  const tempDir = mkdtempSync(join(tmpdir(), "reckon-brain-"));
  const tempPath = join(tempDir, "brain.json");
  writeFileSync(tempPath, JSON.stringify(sealed), "utf-8");

  try {
    const file = await ZgFile.fromFilePath(tempPath);
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr || !tree) {
      throw new Error(`Failed to compute Merkle tree: ${treeErr}`);
    }
    const rootHash = tree.rootHash();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 0G SDK types expect CJS ethers Signer
    const [_tx, uploadErr] = await indexer.upload(file, rpcUrl, signer as any);
    if (uploadErr) {
      throw new Error(`Failed to upload brain blob: ${uploadErr}`);
    }

    await file.close();
    return rootHash as string;
  } finally {
    // Cleanup temp files
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Downloads a brain blob from 0G Storage and returns the parsed SealedBrainBlob.
 *
 * @param rootHash - Merkle root hash (from iNFT tokenURI)
 * @param indexerUrl - 0G Storage indexer URL
 * @returns Parsed SealedBrainBlob
 */
export async function downloadBrainBlob(
  rootHash: string,
  indexerUrl: string,
): Promise<SealedBrainBlob> {
  const { Indexer } = await import("@0gfoundation/0g-ts-sdk");
  const { readFileSync, mkdtempSync: mkdtemp, rmSync: rm } = await import("node:fs");
  const { join: pathJoin } = await import("node:path");
  const { tmpdir: getTmpdir } = await import("node:os");

  const indexer = new Indexer(indexerUrl);
  const tempDir = mkdtemp(pathJoin(getTmpdir(), "reckon-dl-"));
  const outPath = pathJoin(tempDir, "brain.json");

  try {
    // withProof=true to verify Merkle root matches on-chain tokenURI
    const err = await indexer.download(rootHash, outPath, true);
    if (err) {
      throw new Error(`Failed to download brain blob: ${err}`);
    }

    const raw = readFileSync(outPath, "utf-8");
    return JSON.parse(raw) as SealedBrainBlob;
  } finally {
    rm(tempDir, { recursive: true, force: true });
  }
}
