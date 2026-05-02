/**
 * GET /api/zero-g
 *
 * Returns real 0G infrastructure data:
 * - Brain blob root hashes + storage file info from 0G Storage nodes
 * - Fill batches anchored to 0G Storage (from MongoDB)
 * - iNFT token data from ChallengerNFT on 0G Galileo
 * - 0G Compute model configuration
 * - 0G KV stream info
 */

import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { MONGO_COLLECTIONS } from "@reckon-protocol/types";
import type { FillBatch, SlashDocRecord, ChallengeRecord } from "@reckon-protocol/types";
import { createPublicClient, http, type Address } from "viem";

export const dynamic = "force-dynamic";

// ── 0G Constants ──────────────────────────────────────────────────

const ZG_RPC_URL = "https://evmrpc-testnet.0g.ai";
const ZG_INDEXER_URL = "https://indexer-storage-testnet-turbo.0g.ai";
const CHALLENGER_NFT = "0x98b6D75380FC3Cb3483D88f6178A128e848582a0" as Address;
const ZG_FLOW_CONTRACT = "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296" as Address;
const ZG_COMPUTE_LEDGER = "0xE70830508dAc0A97e6c087c75f402f9Be669E406" as Address;
const ZG_ROUTER_URL = "https://router-api-testnet.integratenetwork.work/v1";
const CLAIM_STATE_STREAM_ID = "0x7265636b6f6e2f636c61696d5f73746174652f76310000000000000000000000";

// Agent brain blob root hashes (from provisioned agents)
const AGENT_CONFIGS = [
  {
    tokenId: 0,
    name: "Sentinel",
    brainRootHash: "0xf9b98c78606c7ca007e8c8cefd6c7d7906b9a400af0223659e814c89442312e4",
    model: "qwen/qwen-2.5-7b-instruct",
  },
  {
    tokenId: 2,
    name: "Warden",
    brainRootHash: "0x3f4662c8558908ba12d5a4abbef2397bd351d7132c51fb9d3d5166576ff8dbd8",
    model: "GLM-5-FP8",
  },
];

// ── ChallengerNFT ABI (minimal) ──────────────────────────────────

const ChallengerNFTABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Galileo chain definition ─────────────────────────────────────

const galileo = {
  id: 16602,
  name: "0G Galileo",
  nativeCurrency: { name: "A0GI", symbol: "A0GI", decimals: 18 },
  rpcUrls: { default: { http: [ZG_RPC_URL] } },
} as const;

// ── Helpers ───────────────────────────────────────────────────────

async function fetchStorageFileInfo(rootHash: string): Promise<{ finalized: boolean; uploadedTo: string; tx: string } | null> {
  try {
    const res = await fetch(ZG_INDEXER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "zgs_getFileInfo",
        params: [rootHash],
        id: 1,
      }),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data.result) {
      return {
        finalized: data.result.finalized ?? data.result.isCached ?? false,
        uploadedTo: data.result.uploadedTo ?? "unknown",
        tx: data.result.tx?.hash ?? data.result.tx ?? "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchINFTData(client: any, tokenId: number) {
  try {
    const [owner, tokenURI] = await Promise.all([
      client.readContract({
        address: CHALLENGER_NFT,
        abi: ChallengerNFTABI,
        functionName: "ownerOf",
        args: [BigInt(tokenId)],
      }),
      client.readContract({
        address: CHALLENGER_NFT,
        abi: ChallengerNFTABI,
        functionName: "tokenURI",
        args: [BigInt(tokenId)],
      }).catch(() => ""),
    ]);
    return { tokenId, owner: owner as string, tokenURI: tokenURI as string };
  } catch {
    return null;
  }
}

// ── GET handler ───────────────────────────────────────────────────

export async function GET() {
  try {
    const galileoClient = createPublicClient({
      chain: galileo as any,
      transport: http(ZG_RPC_URL),
    });

    // Fetch data in parallel
    const [
      db,
      totalSupply,
      storageInfoResults,
      inftResults,
    ] = await Promise.all([
      getDb(),
      galileoClient.readContract({
        address: CHALLENGER_NFT,
        abi: ChallengerNFTABI,
        functionName: "totalSupply",
      }).catch(() => BigInt(0)),
      // Storage file info for each brain blob
      Promise.all(AGENT_CONFIGS.map((a) => fetchStorageFileInfo(a.brainRootHash))),
      // iNFT on-chain data
      Promise.all(AGENT_CONFIGS.map((a) => fetchINFTData(galileoClient, a.tokenId))),
    ]);

    // MongoDB data
    const [fillBatches, recentChallenges, recentSlashes] = await Promise.all([
      db
        .collection<FillBatch>(MONGO_COLLECTIONS.fillBatches)
        .find({})
        .sort({ anchoredAt: -1 })
        .limit(20)
        .toArray(),
      db
        .collection<ChallengeRecord>(MONGO_COLLECTIONS.challenges)
        .find({})
        .sort({ challengeBlock: -1 })
        .limit(10)
        .toArray(),
      db
        .collection<SlashDocRecord>(MONGO_COLLECTIONS.slashes)
        .find({})
        .sort({ timestamp: -1 })
        .limit(10)
        .toArray(),
    ]);

    // Build brain blob storage info
    const brainBlobs = AGENT_CONFIGS.map((agent, i) => ({
      ...agent,
      storageInfo: storageInfoResults[i],
      onChain: inftResults[i],
    }));

    // Build compute info
    const compute = {
      routerUrl: ZG_ROUTER_URL,
      models: [
        { id: "qwen/qwen-2.5-7b-instruct", name: "Qwen 2.5 7B Instruct", usedBy: "Sentinel (#0)" },
        { id: "GLM-5-FP8", name: "GLM-5 FP8", usedBy: "Warden (#2)" },
      ],
      computeLedger: ZG_COMPUTE_LEDGER,
    };

    // Build KV info
    const kv = {
      streamId: CLAIM_STATE_STREAM_ID,
      flowContract: ZG_FLOW_CONTRACT,
      purpose: "Claim coordination state for agent challenge deconfliction",
    };

    // iNFT registry
    const inftRegistry = {
      contract: CHALLENGER_NFT,
      chainId: 16602,
      chainName: "0G Galileo",
      totalSupply: Number(totalSupply),
      tokens: brainBlobs.map((b) => ({
        tokenId: b.tokenId,
        name: b.name,
        owner: b.onChain?.owner ?? "unknown",
        tokenURI: b.onChain?.tokenURI ?? b.brainRootHash,
        brainRootHash: b.brainRootHash,
        model: b.model,
        storageFinalized: b.storageInfo?.finalized ?? false,
      })),
    };

    // Explorer URLs
    const explorers = {
      storageScan: "https://storagescan-galileo.0g.ai",
      chainScan: "https://chainscan-galileo.0g.ai",
      nftUrl: (tokenId: number) =>
        `https://chainscan-galileo.0g.ai/nft/${CHALLENGER_NFT}/${tokenId}`,
      contractUrl: `https://chainscan-galileo.0g.ai/address/${CHALLENGER_NFT}`,
      flowContractUrl: `https://chainscan-galileo.0g.ai/address/${ZG_FLOW_CONTRACT}`,
    };

    return NextResponse.json({
      brainBlobs,
      fillBatches: fillBatches.map((b) => ({
        ...b,
        _id: undefined,
      })),
      compute,
      kv,
      inftRegistry,
      explorers,
      recentChallenges: recentChallenges.map((c) => ({
        ...c,
        _id: undefined,
      })),
      recentSlashes: recentSlashes.map((s) => ({
        ...s,
        _id: undefined,
      })),
    });
  } catch (err: any) {
    console.error("[api/zero-g] Error:", err.message);
    return NextResponse.json(
      { error: err.message ?? "Failed to fetch 0G data" },
      { status: 500 },
    );
  }
}
