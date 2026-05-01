#!/usr/bin/env node

import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { createPublicClient, createWalletClient, http, defineChain, type Hex } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { sealBrainBlob } from "./encrypt.js";
import { uploadBrainBlob } from "./upload.js";
import type { BrainBlob } from "@reckon-protocol/types";

const galileo = defineChain({
  id: 16602,
  name: "0G Galileo",
  nativeCurrency: { name: "0G", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
});

const DELEGATE_ADDRESS = "0xC204c6FEC66FbFa5467B8080638C939DF9850bf8" as const;

const ChallengerNFTABI = [
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "uri", type: "string" },
    ],
    name: "mint",
    outputs: [{ name: "tokenId", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "getMintFee",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const OwnerRegistryABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ChallengerABI = [
  {
    inputs: [
      { name: "agentTokenId", type: "uint256" },
      { name: "delegate", type: "address" },
    ],
    name: "setAgentDelegate",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

interface ProvisionConfig {
  ownerPrivateKey: Hex;
  agentAddress?: `0x${string}`;
  challengerNftAddress: `0x${string}`;
  zgRpcUrl: string;
  zgIndexerUrl: string;
  challengeString: string;
  axlPemPath: string;
  khApiKey: string;
  minSlashUsdc?: string;
  maxBondPct?: number;
  model?: string;
  agentPrivateKey?: Hex;
  challengerAddress?: `0x${string}`;
  ownerRegistryAddress?: `0x${string}`;
  baseSepoliaRpcUrl?: string;
}

function configFromEnv(): ProvisionConfig {
  const required = (key: string): string => {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
  };

  return {
    ownerPrivateKey: required("PRIVATE_KEY") as Hex,
    agentAddress: process.env["AGENT_ADDRESS"] as `0x${string}` | undefined,
    challengerNftAddress: required("CHALLENGER_NFT_ADDRESS") as `0x${string}`,
    zgRpcUrl: required("ZG_RPC_URL"),
    zgIndexerUrl: required("ZG_INDEXER_URL"),
    axlPemPath: required("AXL_PEM_PATH"),
    challengeString: process.env["AGENT_CHALLENGE_STRING"] ?? "reckon-agent-auth-v1",
    khApiKey: process.env["KH_API_KEY"] ?? "",
    minSlashUsdc: process.env["MIN_SLASH_USDC"] ?? "50000000",
    maxBondPct: Number(process.env["MAX_BOND_PCT"] ?? "25"),
    model: process.env["ZG_MODEL"] ?? "qwen/qwen-2.5-7b-instruct",
    agentPrivateKey: process.env["AGENT_PRIVATE_KEY"] as Hex | undefined,
    challengerAddress: process.env["CHALLENGER_ADDRESS"] as `0x${string}` | undefined,
    ownerRegistryAddress: process.env["OWNER_REGISTRY_ADDRESS"] as `0x${string}` | undefined,
    baseSepoliaRpcUrl: process.env["BASE_SEPOLIA_RPC"],
  };
}

export async function provision(config: ProvisionConfig): Promise<{
  tokenId: string;
  rootHash: string;
  ownerSignature: string;
  agentAddress: string;
  axlPublicKey: string;
  computeProviderAddress: string;
}> {
  const ownerAccount = privateKeyToAccount(config.ownerPrivateKey);
  const agentAddress = config.agentAddress ?? ownerAccount.address;

  console.log(`[provision] Owner:  ${ownerAccount.address}`);
  console.log(`[provision] Agent:  ${agentAddress}`);
  console.log(`[provision] NFT:    ${config.challengerNftAddress}`);

  // 1. Read Ed25519 private key from PEM file
  console.log(`\n[provision] Step 1/6: Reading AXL Ed25519 key from ${config.axlPemPath}...`);
  const pemContents = readFileSync(config.axlPemPath, "utf-8");
  const keyObject = createPrivateKey(pemContents);
  const rawKey = keyObject.export({ type: "pkcs8", format: "der" });
  // Ed25519 PKCS#8 DER: the 32-byte raw seed is the last 32 bytes
  const axlSecret = Buffer.from(rawKey.subarray(rawKey.length - 32)).toString("hex");

  const { etc: edEtc, getPublicKey } = await import("@noble/ed25519");
  const { sha512 } = await import("@noble/hashes/sha512");
  edEtc.sha512Sync = (...m: Uint8Array[]) => {
    const h = sha512.create();
    for (const msg of m) h.update(msg);
    return h.digest();
  };

  const axlPublicKey = Buffer.from(
    getPublicKey(Buffer.from(axlSecret, "hex")),
  ).toString("hex");
  console.log(`[provision]   Public key: ${axlPublicKey}`);

  // 2. Discover 0G Compute provider
  console.log(`[provision] Step 2/6: Discovering 0G Compute provider for ${config.model ?? "qwen/qwen-2.5-7b-instruct"}...`);
  let computeProviderAddress = "";
  try {
    const inferenceAddress = "0xa79F4c8311FF93C06b8CfB403690cc987c93F91E" as const;
    const discoveryClient = createPublicClient({
      chain: galileo,
      transport: http(config.zgRpcUrl),
    });
    const GetAllServicesABI = [{
      inputs: [
        { name: "offset", type: "uint256" },
        { name: "limit", type: "uint256" },
      ],
      name: "getAllServices",
      outputs: [
        {
          name: "services",
          type: "tuple[]",
          components: [
            { name: "provider", type: "address" },
            { name: "serviceType", type: "string" },
            { name: "url", type: "string" },
            { name: "inputPrice", type: "uint256" },
            { name: "outputPrice", type: "uint256" },
            { name: "updatedAt", type: "uint256" },
            { name: "model", type: "string" },
            { name: "verifiability", type: "string" },
            { name: "additionalInfo", type: "string" },
            { name: "teeSignerAddress", type: "address" },
            { name: "teeSignerAcknowledged", type: "bool" },
          ],
        },
        { name: "total", type: "uint256" },
      ],
      stateMutability: "view",
      type: "function",
    }] as const;

    const [allServices] = await discoveryClient.readContract({
      address: inferenceAddress,
      abi: GetAllServicesABI,
      functionName: "getAllServices",
      args: [0n, 1000n],
    });

    const targetModel = "qwen/qwen-2.5-7b-instruct";
    const matchingProviders = allServices.filter(
      (s) => s.model === targetModel,
    );

    if (matchingProviders.length > 0) {
      computeProviderAddress = matchingProviders[0].provider;
      console.log(`[provision]   Found ${matchingProviders.length} provider(s), using: ${computeProviderAddress}`);
    } else {
      console.warn(`[provision]   No providers found for "qwen/qwen-2.5-7b-instruct"}`);
    }
  } catch {
    console.warn(`[provision]   On-chain provider discovery failed — find one at https://compute-marketplace.0g.ai/inference`);
  }

  // 3. Sign the challenge string with owner's wallet
  console.log(`[provision] Step 3/6: Signing challenge string...`);
  const ownerSignature = await ownerAccount.signMessage({
    message: config.challengeString,
  });

  // 4. Build and seal the brain blob
  console.log(`[provision] Step 4/6: Encrypting brain blob (AES-256-GCM + PBKDF2)...`);
  const brain: BrainBlob = {
    axl_ed25519_secret: axlSecret,
    ebbo_threshold_prefs: {
      minSlash: config.minSlashUsdc ?? "50000000",
      maxBondPct: config.maxBondPct ?? 25,
    },
    kh_api_key: config.khApiKey,
    model_config: {
      model: config.model ?? "qwen/qwen-2.5-7b-instruct",
    },
    performance_history: [],
  };

  const sealed = sealBrainBlob(brain, ownerSignature);

  // 5. Upload sealed blob to 0G Storage
  console.log(`[provision] Step 5/6: Uploading brain blob to 0G Storage...`);
  const rootHash = await uploadBrainBlob(
    sealed,
    config.zgRpcUrl,
    config.zgIndexerUrl,
    config.ownerPrivateKey,
  );
  console.log(`[provision]   Root hash: ${rootHash}`);

  // 6. Mint ChallengerNFT on Galileo with rootHash as tokenURI
  console.log(`[provision] Step 6/6: Minting ChallengerNFT on 0G Galileo...`);

  const publicClient = createPublicClient({
    chain: galileo,
    transport: http(config.zgRpcUrl),
  });

  const walletClient = createWalletClient({
    account: ownerAccount,
    chain: galileo,
    transport: http(config.zgRpcUrl),
  });

  const mintFee = await publicClient.readContract({
    address: config.challengerNftAddress,
    abi: ChallengerNFTABI,
    functionName: "getMintFee",
  });

  const txHash = await walletClient.writeContract({
    address: config.challengerNftAddress,
    abi: ChallengerNFTABI,
    functionName: "mint",
    args: [agentAddress, rootHash],
    value: mintFee,
  });

  console.log(`[provision]   Tx: ${txHash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status === "reverted") {
    throw new Error(`Mint transaction reverted: ${txHash}`);
  }

  // Parse tokenId from Transfer event (topic[3] is tokenId)
  const transferLog = receipt.logs.find(
    (log) =>
      log.topics[0] ===
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  );
  const tokenId = transferLog
    ? BigInt(transferLog.topics[3]!).toString()
    : "unknown";

  console.log(`\n[provision] Done! ChallengerNFT #${tokenId} minted to ${agentAddress}`);

  // 7. Set delegate on Base Sepolia (polls OwnerRegistry until attestation lands)
  if (config.agentPrivateKey && config.challengerAddress && config.ownerRegistryAddress && config.baseSepoliaRpcUrl) {
    console.log(`\n[provision] Step 7: Setting delegate ${DELEGATE_ADDRESS} for token #${tokenId} on Base Sepolia...`);

    const basePublicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(config.baseSepoliaRpcUrl),
    });

    const agentAccount = privateKeyToAccount(config.agentPrivateKey);
    const baseWalletClient = createWalletClient({
      account: agentAccount,
      chain: baseSepolia,
      transport: http(config.baseSepoliaRpcUrl),
    });

    console.log(`[provision]   Waiting for OwnerRegistry attestation...`);
    const maxAttempts = 60;
    const pollIntervalMs = 5_000;
    let attested = false;
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        await basePublicClient.readContract({
          address: config.ownerRegistryAddress,
          abi: OwnerRegistryABI,
          functionName: "ownerOf",
          args: [BigInt(tokenId)],
        });
        attested = true;
        console.log(`[provision]   Attestation found after ${i * pollIntervalMs / 1000}s`);
        break;
      } catch {
        if (i % 6 === 0) console.log(`[provision]   Still waiting... (${i * pollIntervalMs / 1000}s elapsed)`);
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
    }

    if (!attested) {
      console.warn(`[provision]   Attestation not found after ${maxAttempts * pollIntervalMs / 1000}s — skipping delegation.`);
      console.warn(`[provision]   Run manually: CHALLENGER=${config.challengerAddress} AGENT_TOKEN_ID=${tokenId} DELEGATE=${DELEGATE_ADDRESS} forge script script/SetDelegate.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast --private-key $PRIVATE_KEY`);
    } else {
      const delegateTx = await baseWalletClient.writeContract({
        address: config.challengerAddress,
        abi: ChallengerABI,
        functionName: "setAgentDelegate",
        args: [BigInt(tokenId), DELEGATE_ADDRESS],
      });
      const delegateReceipt = await basePublicClient.waitForTransactionReceipt({ hash: delegateTx });
      if (delegateReceipt.status === "reverted") {
        console.error(`[provision]   setAgentDelegate reverted: ${delegateTx}`);
      } else {
        console.log(`[provision]   Delegate set! Tx: ${delegateTx}`);
      }
    }
  }

  console.log(`\n--- Add these to your agent .env ---`);
  console.log(`AGENT_TOKEN_ID=${tokenId}`);
  console.log(`OWNER_SIGNATURE=${ownerSignature}`);
  console.log(`BRAIN_ROOT_HASH=${rootHash}`);
  if (computeProviderAddress) {
    console.log(`ZG_COMPUTE_PROVIDER_ADDRESS=${computeProviderAddress}`);
  }
  console.log(`\n--- AXL node config (start AXL node before the agent) ---`);
  console.log(`AXL_PEM_PATH=${config.axlPemPath}`);
  console.log(`AXL_ED25519_PUBLIC_KEY=${axlPublicKey}`);

  return { tokenId, rootHash, ownerSignature, agentAddress, axlPublicKey, computeProviderAddress };
}

async function main() {
  try {
    const config = configFromEnv();
    await provision(config);
  } catch (err) {
    console.error(
      `\n[provision] Failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

main();
