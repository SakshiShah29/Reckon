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

const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
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
  /** Secondary chain RPC + registry addresses for dual-chain registration */
  secondaryRpcUrl?: string;
  secondarySolverRegistryAddress?: Address;
  secondaryChallengerRegistryAddress?: Address;
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

interface ChainClients {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  solverRegistryAddress: Address;
  challengerRegistryAddress: Address;
}

let state: {
  primary: ChainClients;
  secondary: ChainClients | null;
} | null = null;

export async function initRegistrar(config: RegistrarConfig): Promise<void> {
  const account = privateKeyToAccount(config.relayerPrivateKey);

  const primaryChain = config.secondaryRpcUrl ? baseSepolia : base;

  const publicClient = createPublicClient({
    chain: primaryChain,
    transport: http(config.rpcUrl),
  });

  const walletClient = createWalletClient({
    chain: primaryChain,
    transport: http(config.rpcUrl),
    account,
  });

  let secondary: ChainClients | null = null;
  if (config.secondaryRpcUrl && config.secondarySolverRegistryAddress && config.secondaryChallengerRegistryAddress) {
    secondary = {
      publicClient: createPublicClient({ chain: base, transport: http(config.secondaryRpcUrl) }),
      walletClient: createWalletClient({ chain: base, transport: http(config.secondaryRpcUrl), account }),
      solverRegistryAddress: config.secondarySolverRegistryAddress,
      challengerRegistryAddress: config.secondaryChallengerRegistryAddress,
    };
    console.log("[registrar] Dual-chain: registering on both Sepolia and Anvil fork");
  }

  state = {
    primary: {
      publicClient,
      walletClient,
      solverRegistryAddress: config.solverRegistryAddress,
      challengerRegistryAddress: config.challengerRegistryAddress,
    },
    secondary,
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

async function registerOnChain(
  clients: ChainClients,
  chainLabel: string,
  node: Hex,
  ownerAddress: Address,
  role: "solver" | "challenger",
  fullName: string,
): Promise<Hex> {
  const registryAddress =
    role === "solver"
      ? clients.solverRegistryAddress
      : clients.challengerRegistryAddress;

  const alreadyRegistered = await clients.publicClient.readContract({
    address: registryAddress,
    abi: IsRegisteredABI,
    functionName: "isRegistered",
    args: [ownerAddress],
  });

  if (alreadyRegistered) {
    console.log(`[registrar] ${chainLabel}: ${ownerAddress} already registered as ${role}`);
    return "0x" as Hex;
  }

  console.log(`[registrar] ${chainLabel}: Registering ${role}: ${fullName} → ${ownerAddress}`);

  const txHash = await (clients.walletClient as any).writeContract({
    address: registryAddress,
    abi: RegisterABI,
    functionName: "register",
    args: [node, ownerAddress],
  });

  await (clients.publicClient as any).waitForTransactionReceipt({ hash: txHash });
  console.log(`[registrar] ${chainLabel}: Registered ${fullName}: ${txHash}`);
  return txHash;
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

  const txHash = await registerOnChain(state.primary, "primary", node, ownerAddress, role, fullName);

  if (state.secondary) {
    await registerOnChain(state.secondary, "secondary", node, ownerAddress, role, fullName);
  }

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

  return { node, label, fullName, txHash };
}
