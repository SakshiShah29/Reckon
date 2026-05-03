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
import { createLogger, formatDuration } from "./logger.js";

const log = createLogger("owner-attester");

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

const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
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
  /** Use Base Sepolia chain for OwnerRegistry */
  useBaseSepolia?: boolean;
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

  const baseChain = config.useBaseSepolia ? baseSepolia : base;
  const baseWalletClient = createWalletClient({
    chain: baseChain,
    transport: http(config.baseRpcUrl),
    account,
  });

  log.info("Starting NFT transfer watcher", {
    nftContract: config.challengerNftAddress,
    ownerRegistry: config.ownerRegistryAddress,
    galileoRpc: config.galileoRpcUrl,
    baseChain: baseChain.name,
  });

  let isRunning = true;
  let lastProcessedBlock = await galileoClient.getBlockNumber();
  let totalTransfers = 0;

  log.info("Polling from Galileo block", {
    startBlock: lastProcessedBlock.toString(),
  });

  const poll = async () => {
    while (isRunning) {
      try {
        const currentBlock = await galileoClient.getBlockNumber();
        if (currentBlock <= lastProcessedBlock) {
          await sleep(5000); // Galileo has slower blocks, poll less aggressively
          continue;
        }

        const from = lastProcessedBlock + 1n;
        const to = currentBlock;

        const logs = await galileoClient.getLogs({
          address: config.challengerNftAddress,
          event: TRANSFER_EVENT,
          fromBlock: from,
          toBlock: to,
        });

        if (logs.length > 0) {
          log.info(`Found ${logs.length} NFT Transfer event(s) in Galileo blocks ${from}..${to}`);
        }

        for (const logEntry of logs) {
          const startTime = Date.now();
          const to = logEntry.args.to!;
          const tokenId = logEntry.args.tokenId!;
          const tag = `token#${tokenId}`;

          totalTransfers++;
          log.info(`${tag} NFT transferred`, {
            from: logEntry.args.from ?? "0x0",
            to,
            block: logEntry.blockNumber.toString(),
            tx: logEntry.transactionHash,
          });

          // Call OwnerRegistry.attestOwner() on Base
          try {
            const txHash = await baseWalletClient.writeContract({
              address: config.ownerRegistryAddress,
              abi: OwnerRegistryWriteABI,
              functionName: "attestOwner",
              args: [tokenId, to],
            });
            log.info(`${tag} ownership attested on ${baseChain.name}`, {
              attestTx: txHash,
              owner: to,
            });

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
            log.info(`${tag} attestation saved to MongoDB`, {
              duration: formatDuration(Date.now() - startTime),
              totalTransfers,
            });
          } catch (err) {
            log.error(`${tag} attestation FAILED`, err, {
              tokenId: tokenId.toString(),
              newOwner: to,
            });
          }
        }

        lastProcessedBlock = currentBlock;
      } catch (err) {
        log.error("Poll cycle error (will retry in 5s)", err);
      }

      await sleep(5000);
    }
  };

  poll().catch((err) =>
    log.error("Fatal poll error — owner attester stopped", err),
  );

  return () => {
    isRunning = false;
    log.info("Owner attester stopped", { totalTransfers });
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
