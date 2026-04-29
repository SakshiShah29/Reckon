import { unsealBrainBlob } from "@reckon-protocol/inft-tools";
import { downloadBrainBlob } from "@reckon-protocol/inft-tools";
import type { BrainBlob } from "@reckon-protocol/types";
import { createPublicClient, http, defineChain } from "viem";

const galileo = defineChain({
  id: 16602,
  name: "0G Galileo",
  nativeCurrency: { name: "0G", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
});

const ChallengerNFTReadABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "tokenURI",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface AgentConfig {
  /** iNFT token ID on 0G Galileo */
  tokenId: string;
  /** Owner's signature used for brain blob decryption */
  ownerSignature: string;
  /** 0G Storage indexer URL */
  zgIndexerUrl: string;
  /** Base RPC URL (Anvil fork or mainnet) */
  baseRpcUrl: string;
  /** 0G RPC URL */
  zgRpcUrl: string;
  /** 0G Compute provider address */
  zgComputeProviderAddress: string;
  /** Brain blob root hash (from iNFT tokenURI) — if known, skips on-chain read */
  brainRootHash?: string;
  /** ChallengerNFT contract address on 0G Galileo */
  challengerNftAddress?: `0x${string}`;
  /** Fill Registry contract address on Base */
  fillRegistryAddress: `0x${string}`;
}

export interface BootedAgent {
  config: AgentConfig;
  brain: BrainBlob;
}

/**
 * Boots a challenger agent by reading and decrypting its iNFT brain blob.
 *
 * Boot sequence (per spec FR-10):
 * 1. Read iNFT tokenURI from 0G Galileo to get brain root hash
 * 2. Download brain blob from 0G Storage via indexer
 * 3. Verify Merkle root matches tokenURI (withProof=true)
 * 4. Decrypt brain blob using owner's signature
 * 5. Initialize agent with decrypted config
 *
 * If brainRootHash is provided directly (e.g. from env), skip the on-chain read.
 */
export async function bootAgent(config: AgentConfig): Promise<BootedAgent> {
  console.log(`[boot] Starting agent for iNFT #${config.tokenId}`);

  let rootHash = config.brainRootHash;

  if (!rootHash) {
    if (!config.challengerNftAddress) {
      throw new Error(
        "Either brainRootHash or challengerNftAddress is required to read tokenURI from 0G Galileo.",
      );
    }

    console.log(`[boot] Reading tokenURI from ChallengerNFT on Galileo...`);
    const galileoClient = createPublicClient({
      chain: galileo,
      transport: http(config.zgRpcUrl),
    });

    rootHash = await galileoClient.readContract({
      address: config.challengerNftAddress,
      abi: ChallengerNFTReadABI,
      functionName: "tokenURI",
      args: [BigInt(config.tokenId)],
    });

    if (!rootHash || rootHash.length === 0) {
      throw new Error(`tokenURI is empty for iNFT #${config.tokenId}`);
    }
    console.log(`[boot] tokenURI resolved: ${rootHash.slice(0, 16)}...`);
  }

  console.log(`[boot] Downloading brain blob from 0G Storage (root: ${rootHash.slice(0, 16)}...)`);
  const sealedBlob = await downloadBrainBlob(rootHash, config.zgIndexerUrl);

  console.log("[boot] Decrypting brain blob...");
  const brain = unsealBrainBlob(sealedBlob, config.ownerSignature);

  // Validate brain blob fields
  if (!brain.axl_ed25519_secret || brain.axl_ed25519_secret.length !== 64) {
    throw new Error("Invalid brain blob: axl_ed25519_secret must be 64 hex chars");
  }
  if (!brain.kh_api_key || !brain.kh_api_key.startsWith("kh_")) {
    throw new Error("Invalid brain blob: kh_api_key must start with 'kh_'");
  }
  if (!brain.model_config?.model) {
    throw new Error("Invalid brain blob: model_config.model is required");
  }

  console.log(`[boot] Agent #${config.tokenId} booted successfully`);
  console.log(`[boot]   Model: ${brain.model_config.model}`);
  console.log(`[boot]   Min slash threshold: ${brain.ebbo_threshold_prefs.minSlash} USDC`);
  console.log(`[boot]   Historical slashes: ${brain.performance_history.length}`);

  return { config, brain };
}

/**
 * Creates an AgentConfig from environment variables.
 */
export function configFromEnv(): AgentConfig {
  const required = (key: string): string => {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
  };

  return {
    tokenId: required("AGENT_TOKEN_ID"),
    ownerSignature: required("OWNER_SIGNATURE"),
    zgIndexerUrl: required("ZG_INDEXER_URL"),
    baseRpcUrl: required("BASE_RPC_URL"),
    zgRpcUrl: required("ZG_RPC_URL"),
    zgComputeProviderAddress: required("ZG_COMPUTE_PROVIDER_ADDRESS"),
    brainRootHash: process.env["BRAIN_ROOT_HASH"],
    challengerNftAddress: process.env["CHALLENGER_NFT_ADDRESS"] as `0x${string}` | undefined,
    fillRegistryAddress: required("FILL_REGISTRY_ADDRESS") as `0x${string}`,
  };
}
