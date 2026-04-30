#!/usr/bin/env node

import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { createPublicClient, http, defineChain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

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

interface SetupConfig {
  ownerPrivateKey: Hex;
  tokenId: string;
  challengerNftAddress: `0x${string}`;
  zgRpcUrl: string;
  axlPemPath: string;
  challengeString: string;
  model?: string;
}

function configFromEnv(): SetupConfig {
  const required = (key: string): string => {
    const val = process.env[key];
    if (!val) throw new Error(`Missing required env var: ${key}`);
    return val;
  };

  return {
    ownerPrivateKey: required("PRIVATE_KEY") as Hex,
    tokenId: required("AGENT_TOKEN_ID"),
    challengerNftAddress: required("CHALLENGER_NFT_ADDRESS") as `0x${string}`,
    zgRpcUrl: required("ZG_RPC_URL"),
    axlPemPath: required("AXL_PEM_PATH"),
    challengeString: process.env["AGENT_CHALLENGE_STRING"] ?? "reckon-agent-auth-v1",
    model: process.env["ZG_MODEL"] ?? "GLM-5-FP8",
  };
}

async function setupEnv(config: SetupConfig) {
  const ownerAccount = privateKeyToAccount(config.ownerPrivateKey);

  // 1. Derive AXL public key from PEM
  console.log(`[setup-env] Reading AXL key from ${config.axlPemPath}...`);
  const pemContents = readFileSync(config.axlPemPath, "utf-8");
  const keyObject = createPrivateKey(pemContents);
  const rawKey = keyObject.export({ type: "pkcs8", format: "der" });
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

  // 2. Read tokenURI (brain root hash) from on-chain
  console.log(`[setup-env] Reading tokenURI for iNFT #${config.tokenId}...`);
  const publicClient = createPublicClient({
    chain: galileo,
    transport: http(config.zgRpcUrl),
  });

  const rootHash = await publicClient.readContract({
    address: config.challengerNftAddress,
    abi: ChallengerNFTReadABI,
    functionName: "tokenURI",
    args: [BigInt(config.tokenId)],
  });

  if (!rootHash || rootHash.length === 0) {
    throw new Error(`tokenURI is empty for iNFT #${config.tokenId}`);
  }

  // 3. Sign challenge string
  console.log(`[setup-env] Signing challenge string...`);
  const ownerSignature = await ownerAccount.signMessage({
    message: config.challengeString,
  });

  // 4. Discover compute provider
  console.log(`[setup-env] Discovering 0G Compute provider for ${config.model}...`);
  let computeProviderAddress = "";
  try {
    const inferenceAddress = "0xa79F4c8311FF93C06b8CfB403690cc987c93F91E" as const;
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

    const [allServices] = await publicClient.readContract({
      address: inferenceAddress,
      abi: GetAllServicesABI,
      functionName: "getAllServices",
      args: [0n, 1000n],
    });

    const matchingProviders = allServices.filter(
      (s) => s.model === config.model,
    );

    if (matchingProviders.length > 0) {
      computeProviderAddress = matchingProviders[0].provider;
      console.log(`[setup-env]   Found ${matchingProviders.length} provider(s), using: ${computeProviderAddress}`);
    } else {
      console.warn(`[setup-env]   No providers found for ${config.model}`);
    }
  } catch {
    console.warn(`[setup-env]   On-chain provider discovery failed — find one at https://compute-marketplace.0g.ai/inference`);
  }

  // Output
  console.log(`\n--- Add these to your agent .env ---`);
  console.log(`AGENT_TOKEN_ID=${config.tokenId}`);
  console.log(`OWNER_SIGNATURE=${ownerSignature}`);
  console.log(`BRAIN_ROOT_HASH=${rootHash}`);
  if (computeProviderAddress) {
    console.log(`ZG_COMPUTE_PROVIDER_ADDRESS=${computeProviderAddress}`);
  }
  console.log(`\n--- AXL node config ---`);
  console.log(`AXL_PEM_PATH=${config.axlPemPath}`);
  console.log(`AXL_ED25519_PUBLIC_KEY=${axlPublicKey}`);
}

async function main() {
  try {
    const config = configFromEnv();
    await setupEnv(config);
  } catch (err) {
    console.error(
      `\n[setup-env] Failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

main();
