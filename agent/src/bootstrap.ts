import {
  type Address,
  type Hex,
  namehash,
} from "viem";
import { CHALLENGERS_PARENT } from "@reckon-protocol/types";

const IsRegisteredABI = [
  {
    inputs: [{ name: "subnameOwner", type: "address" }],
    name: "isRegistered",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const OwnerOfABI = [
  {
    inputs: [{ name: "tokenId", type: "uint256" }],
    name: "ownerOf",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface BootstrapConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publicClient: any;
  agentAddress: Address;
  challengerRegistryAddress: Address;
  ownerRegistryAddress: Address;
  agentTokenId: string;
  relayerUrl: string;
  challengerLabel: string;
}

const REGISTRATION_POLL_INTERVAL_MS = 2000;
const REGISTRATION_POLL_TIMEOUT_MS = 30_000;

export async function bootstrapChallenger(config: BootstrapConfig): Promise<void> {
  const {
    publicClient,
    agentAddress,
    challengerRegistryAddress,
    ownerRegistryAddress,
    agentTokenId,
    relayerUrl,
    challengerLabel,
  } = config;

  // 1. Verify agent token ownership
  const tokenOwner: Address = await publicClient.readContract({
    address: ownerRegistryAddress,
    abi: OwnerOfABI,
    functionName: "ownerOf",
    args: [BigInt(agentTokenId)],
  });

  if (tokenOwner.toLowerCase() !== agentAddress.toLowerCase()) {
    throw new Error(
      `Agent token ${agentTokenId} is owned by ${tokenOwner}, not ${agentAddress}`,
    );
  }
  console.log(`[bootstrap] Agent token ${agentTokenId} ownership verified`);

  // 2. Check if already registered on-chain
  const alreadyRegistered: boolean = await publicClient.readContract({
    address: challengerRegistryAddress,
    abi: IsRegisteredABI,
    functionName: "isRegistered",
    args: [agentAddress],
  });

  if (alreadyRegistered) {
    console.log(`[bootstrap] Agent ${agentAddress} already registered in ChallengerRegistry`);
    return;
  }

  // 3. Resolve ENS to check if the name exists but points elsewhere
  const fullName = `${challengerLabel}.${CHALLENGERS_PARENT}`;
  const node = namehash(fullName) as Hex;

  console.log(`[bootstrap] ${fullName} not registered — requesting registration from relayer...`);

  // 4. POST to relayer /register
  const res = await fetch(`${relayerUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label: challengerLabel,
      address: agentAddress,
      role: "challenger",
    }),
  });

  if (!res.ok) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = await res.json().catch(() => ({ error: "unknown" })) as any;
    throw new Error(`Registration failed: ${err.error}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await res.json() as any;
  console.log(`[bootstrap] Relayer accepted: ${result.fullName} (tx: ${result.txHash})`);

  // 5. Poll ChallengerRegistry until on-chain confirmation
  console.log(`[bootstrap] Waiting for on-chain confirmation...`);
  const deadline = Date.now() + REGISTRATION_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const registered: boolean = await publicClient.readContract({
      address: challengerRegistryAddress,
      abi: IsRegisteredABI,
      functionName: "isRegistered",
      args: [agentAddress],
    });

    if (registered) {
      console.log(`[bootstrap] Confirmed on-chain: ${fullName} → ${agentAddress}`);
      return;
    }

    await new Promise((r) => setTimeout(r, REGISTRATION_POLL_INTERVAL_MS));
  }

  throw new Error(
    `Registration tx submitted but not confirmed within ${REGISTRATION_POLL_TIMEOUT_MS / 1000}s — check relayer logs`,
  );
}
