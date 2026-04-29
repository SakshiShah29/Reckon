import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
  type Hex,
  namehash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getDb } from "./db.js";
import { SOLVERS_PARENT, CHALLENGERS_PARENT } from "@reckon-protocol/types";

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

const RegisterABI = [
  {
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "solverOwner", type: "address" },
    ],
    name: "register",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const IsRegisteredABI = [
  {
    inputs: [{ name: "subnameOwner", type: "address" }],
    name: "isRegistered",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export interface RegistrarConfig {
  rpcUrl: string;
  relayerPrivateKey: `0x${string}`;
  solverRegistryAddress: Address;
  challengerRegistryAddress: Address;
}

export interface RegistrationRecord {
  node: Hex;
  label: string;
  role: "solver" | "challenger";
  ownerAddress: Address;
  registeredOnChain: boolean;
  txHash: Hex | null;
  createdAt: number;
}

const REGISTRATIONS_COLLECTION = "registrations";
const LABEL_REGEX = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

let state: {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  solverRegistryAddress: Address;
  challengerRegistryAddress: Address;
} | null = null;

export async function initRegistrar(config: RegistrarConfig): Promise<void> {
  const account = privateKeyToAccount(config.relayerPrivateKey);

  const publicClient = createPublicClient({
    chain: base,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: base,
    transport: http(config.rpcUrl),
    account,
  });

  state = {
    publicClient,
    walletClient,
    solverRegistryAddress: config.solverRegistryAddress,
    challengerRegistryAddress: config.challengerRegistryAddress,
  };

  const db = await getDb();
  await db
    .collection(REGISTRATIONS_COLLECTION)
    .createIndex({ node: 1 }, { unique: true });
  await db
    .collection(REGISTRATIONS_COLLECTION)
    .createIndex({ ownerAddress: 1, role: 1 }, { unique: true });

  console.log("[registrar] Initialized");
}

export interface RegisterResult {
  node: Hex;
  label: string;
  fullName: string;
  txHash: Hex;
}

export async function registerSolver(
  label: string,
  solverAddress: Address,
): Promise<RegisterResult> {
  return register(label, solverAddress, "solver");
}

export async function registerChallenger(
  label: string,
  challengerAddress: Address,
): Promise<RegisterResult> {
  return register(label, challengerAddress, "challenger");
}

async function register(
  label: string,
  ownerAddress: Address,
  role: "solver" | "challenger",
): Promise<RegisterResult> {
  if (!state) throw new Error("Registrar not initialized");

  if (!LABEL_REGEX.test(label)) {
    throw new Error(
      `Invalid label "${label}": must be 2-32 lowercase alphanumeric or hyphens`,
    );
  }

  const parent = role === "solver" ? SOLVERS_PARENT : CHALLENGERS_PARENT;
  const fullName = `${label}.${parent}`;
  const node = namehash(fullName) as Hex;

  const registryAddress =
    role === "solver"
      ? state.solverRegistryAddress
      : state.challengerRegistryAddress;

  const alreadyRegistered = await state.publicClient.readContract({
    address: registryAddress,
    abi: IsRegisteredABI,
    functionName: "isRegistered",
    args: [ownerAddress],
  });

  if (alreadyRegistered) {
    throw new Error(`Address ${ownerAddress} is already registered as a ${role}`);
  }

  console.log(`[registrar] Registering ${role}: ${fullName} → ${ownerAddress}`);

  const txHash = await (state.walletClient as any).writeContract({
    chain: base,
    address: registryAddress,
    abi: RegisterABI,
    functionName: "register",
    args: [node, ownerAddress],
  });

  await (state.publicClient as any).waitForTransactionReceipt({ hash: txHash });

  const db = await getDb();
  await db.collection<RegistrationRecord>(REGISTRATIONS_COLLECTION).updateOne(
    { node },
    {
      $setOnInsert: {
        node,
        label,
        role,
        ownerAddress,
        registeredOnChain: true,
        txHash,
        createdAt: Date.now(),
      },
    },
    { upsert: true },
  );

  console.log(`[registrar] Registered ${fullName}: ${txHash}`);

  return { node, label, fullName, txHash };
}
