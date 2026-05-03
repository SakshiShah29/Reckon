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
import { createLogger, formatDuration } from "./logger.js";

const log = createLogger("registrar");

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
    log.info("Dual-chain registration enabled (Sepolia + Anvil fork)");
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

  log.info("Registrar initialized", {
    solverRegistry: config.solverRegistryAddress,
    challengerRegistry: config.challengerRegistryAddress,
    dualChain: secondary ? "yes" : "no",
  });
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
    log.info(`[${chainLabel}] Address already registered as ${role} — skipping`, {
      address: ownerAddress,
      role,
    });
    return "0x" as Hex;
  }

  log.info(`[${chainLabel}] Registering ${role}: ${fullName}`, {
    address: ownerAddress,
    node: node,
    registry: registryAddress,
  });

  const txHash = await (clients.walletClient as any).writeContract({
    address: registryAddress,
    abi: RegisterABI,
    functionName: "register",
    args: [node, ownerAddress],
  });

  log.info(`[${chainLabel}] Waiting for tx confirmation...`, {
    tx: txHash,
  });

  await (clients.publicClient as any).waitForTransactionReceipt({ hash: txHash });

  log.info(`[${chainLabel}] Registration confirmed`, {
    fullName,
    tx: txHash,
    role,
  });
  return txHash;
}

async function register(
  label: string,
  ownerAddress: Address,
  role: "solver" | "challenger",
): Promise<RegisterResult> {
  if (!state) throw new Error("Registrar not initialized");

  if (!LABEL_REGEX.test(label)) {
    log.warn(`Invalid label rejected: "${label}"`);
    throw new Error(
      `Invalid label "${label}": must be 2-32 lowercase alphanumeric or hyphens`,
    );
  }

  const parent = role === "solver" ? SOLVERS_PARENT : CHALLENGERS_PARENT;
  const fullName = `${label}.${parent}`;
  const node = namehash(fullName) as Hex;
  const startTime = Date.now();

  log.info(`Starting registration: ${fullName}`, {
    label,
    role,
    address: ownerAddress,
    node: node,
  });

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

  // Upsert into subnames so ENS resolution works in dashboard & challenge-listener
  const namespace = role === "solver" ? "solvers" : "challengers";
  await db.collection("subnames").updateOne(
    { namehash: node },
    {
      $setOnInsert: {
        label,
        namespace,
        owner: ownerAddress,
        namehash: node,
        registeredAt: Date.now(),
        textRecords: {},
      },
    },
    { upsert: true },
  );

  log.info(`Registration complete: ${fullName}`, {
    duration: formatDuration(Date.now() - startTime),
    node: node,
    tx: txHash ? txHash : "already-registered",
  });

  return { node, label, fullName, txHash };
}
