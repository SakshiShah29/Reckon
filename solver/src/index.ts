import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { type Address, type Hex } from "viem";
import { initFiller, getHealth, fillOrder, getFillerState } from "./filler.js";
import { decodeOrder, validateOrder } from "./validate.js";
import { bootstrapSolver } from "./bootstrap.js";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string): string | undefined {
  return process.env[key];
}

const solverPrivateKey = required("SOLVER_PRIVATE_KEY") as `0x${string}`;
const baseRpcUrl = required("BASE_RPC_URL"); // Anvil fork — fill execution
const baseSepoliaRpcUrl = optional("BASE_SEPOLIA_RPC_URL"); // Base Sepolia — bonds + registration
const reckonValidatorAddress = required("RECKON_VALIDATOR_ADDRESS") as Address;
const port = parseInt(process.env["PORT"] ?? "3000", 10);

const solverAddress = initFiller({ rpcUrl: baseRpcUrl, solverPrivateKey });

// ── Bootstrap: register + bond if needed ────────────────────────
const solverBondVaultAddress = optional("SOLVER_BOND_VAULT_ADDRESS") as Address | undefined;
const relayerUrl = optional("RELAYER_URL");
const solverLabel = optional("SOLVER_LABEL");

if (solverBondVaultAddress && relayerUrl && solverLabel) {
  const bootstrapRpcUrl = baseSepoliaRpcUrl ?? baseRpcUrl;
  const { createPublicClient, createWalletClient, http, defineChain } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");

  const bootstrapChain = baseSepoliaRpcUrl
    ? defineChain({ id: 84532, name: "Base Sepolia", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["https://sepolia.base.org"] } } })
    : (await import("viem/chains")).base;

  const bootstrapAccount = privateKeyToAccount(solverPrivateKey);
  const bootstrapPublicClient = createPublicClient({ chain: bootstrapChain, transport: http(bootstrapRpcUrl) });
  const bootstrapWalletClient = createWalletClient({ chain: bootstrapChain, transport: http(bootstrapRpcUrl), account: bootstrapAccount });

  if (baseSepoliaRpcUrl) {
    console.log("[solver] Dual-chain: fills on Anvil fork, bonds on Base Sepolia");
  }

  bootstrapSolver({
    publicClient: bootstrapPublicClient,
    walletClient: bootstrapWalletClient,
    solverAddress,
    solverBondVaultAddress,
    relayerUrl,
    solverLabel,
  }).catch((err) => {
    console.error(`[bootstrap] Failed:`, err.message);
    console.error(`[bootstrap] Solver may not be registered or bonded — fills could revert`);
  });
} else {
  console.log("[solver] Bootstrap skipped — set SOLVER_BOND_VAULT_ADDRESS, RELAYER_URL, SOLVER_LABEL to enable");
}

const app = new Hono();

// ── CORS ─────────────────────────────────────────────────────────
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"],
}));

// ── Health check ─────────────────────────────────────────────────
app.get("/health", async (c) => {
  const health = await getHealth();
  return c.json(health);
});

// ── Fill endpoint — solver listens here for incoming orders ──────
app.post("/fill", async (c) => {
  const body = await c.req.json<{ encodedOrder: Hex; signature: Hex }>();

  if (!body.encodedOrder || !body.signature) {
    return c.json({ error: "Missing encodedOrder or signature", code: "INVALID_ORDER" }, 400);
  }

  let decoded;
  try {
    decoded = decodeOrder(body.encodedOrder);
  } catch (err: any) {
    return c.json({ error: `Failed to decode order: ${err.message}`, code: "INVALID_ORDER" }, 400);
  }

  const validationError = validateOrder(decoded, reckonValidatorAddress);
  if (validationError) {
    return c.json(validationError, 400);
  }

  try {
    const result = await fillOrder(body.encodedOrder, body.signature, decoded);
    console.log(`[solver] Fill complete: ${result.txHash} (block ${result.fillBlock})`);
    return c.json(result);
  } catch (err: any) {
    const message = err.shortMessage ?? err.message ?? "unknown error";
    const details = err.cause?.data ?? err.metaMessages?.join("\n") ?? "";
    console.error(`[solver] Fill failed:`, message);
    if (details) console.error(`[solver] Details:`, details);
    if (err.cause) console.error(`[solver] Cause:`, err.cause.message ?? err.cause);
    return c.json({ error: message, details, code: "TX_REVERTED" }, 500);
  }
});

console.log(`=== Reckon Demo Solver ===`);
console.log(`Solver: ${solverAddress}`);
console.log(`Validator: ${reckonValidatorAddress}`);
console.log(`RPC: ${baseRpcUrl}`);
console.log(`Port: ${port}`);

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`[solver] Listening on http://0.0.0.0:${port}`);
});
