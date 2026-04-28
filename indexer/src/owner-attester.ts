import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseAbiItem,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getAttestationsCollection } from "./db.js";
import type { OwnerAttestation } from "@reckon-protocol/types";

/**
 * 0G Galileo testnet chain definition.
 */
const galileo = defineChain({
  id: 16602,
  name: "0G Galileo",
  nativeCurrency: { name: "0G", symbol: "OG", decimals: 18 },
  rpcUrls: { default: { http: ["https://evmrpc-testnet.0g.ai"] } },
});

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

/**
 * ABI for OwnerRegistry.attestOwner() on Base.
 * Called by the permissioned relayer to attest cross-chain iNFT ownership.
 */
const OwnerRegistryWriteABI = [
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "owner", type: "address" },
    ],
    name: "attestOwner",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

export interface AttesterConfig {
  /** 0G Galileo RPC URL */
  galileoRpcUrl: string;
  /** Base mainnet RPC URL */
  baseRpcUrl: string;
  /** Relayer private key (same EOA used for fill recording) */
  relayerPrivateKey: `0x${string}`;
  /** ChallengerNFT contract address on 0G Galileo */
  challengerNftAddress: Address;
  /** OwnerRegistry contract address on Base */
  ownerRegistryAddress: Address;
}

/**
 * Starts watching ChallengerNFT Transfer events on 0G Galileo.
 * For each transfer, calls OwnerRegistry.attestOwner() on Base
 * and writes the attestation to MongoDB.
 *
 * @returns Cleanup function to stop polling
 */
export async function startOwnerAttester(
  config: AttesterConfig,
): Promise<() => void> {
  const galileoClient = createPublicClient({
    chain: galileo,
    transport: http(config.galileoRpcUrl),
  });

  const account = privateKeyToAccount(config.relayerPrivateKey);

  const baseWalletClient = createWalletClient({
    chain: base,
    transport: http(config.baseRpcUrl),
    account,
  });

  console.log(`[owner-attester] Watching ChallengerNFT transfers on Galileo`);
  console.log(`[owner-attester] NFT: ${config.challengerNftAddress}`);
  console.log(`[owner-attester] OwnerRegistry: ${config.ownerRegistryAddress}`);

  let isRunning = true;
  let lastProcessedBlock = await galileoClient.getBlockNumber();

  const poll = async () => {
    while (isRunning) {
      try {
        const currentBlock = await galileoClient.getBlockNumber();
        if (currentBlock <= lastProcessedBlock) {
          await sleep(5000); // Galileo has slower blocks, poll less aggressively
          continue;
        }

        const logs = await galileoClient.getLogs({
          address: config.challengerNftAddress,
          event: TRANSFER_EVENT,
          fromBlock: lastProcessedBlock + 1n,
          toBlock: currentBlock,
        });

        for (const log of logs) {
          const to = log.args.to!;
          const tokenId = log.args.tokenId!;
          const tag = `token#${tokenId}`;

          console.log(`[owner-attester] ${tag} transferred to ${to}`);

          // Call OwnerRegistry.attestOwner() on Base
          try {
            const txHash = await baseWalletClient.writeContract({
              address: config.ownerRegistryAddress,
              abi: OwnerRegistryWriteABI,
              functionName: "attestOwner",
              args: [tokenId, to],
            });
            console.log(`[owner-attester] ${tag} attested on Base: ${txHash.slice(0, 10)}...`);

            // Write to MongoDB
            const attestation: OwnerAttestation = {
              tokenId: tokenId.toString(),
              owner: to,
              attestedAt: Math.floor(Date.now() / 1000),
              txHash,
            };

            const collection = await getAttestationsCollection();
            await collection.updateOne(
              { tokenId: attestation.tokenId },
              { $set: attestation },
              { upsert: true },
            );
            console.log(`[owner-attester] ${tag} written to MongoDB`);
          } catch (err) {
            console.error(`[owner-attester] ${tag} attestation failed:`, err);
          }
        }

        lastProcessedBlock = currentBlock;
      } catch (err) {
        console.error("[owner-attester] Poll error:", err);
      }

      await sleep(5000);
    }
  };

  poll().catch((err) =>
    console.error("[owner-attester] Fatal poll error:", err),
  );

  return () => {
    isRunning = false;
    console.log("[owner-attester] Stopped");
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
