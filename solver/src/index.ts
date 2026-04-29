import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { type Address, type Hex } from "viem";
import { initFiller, getHealth, fillOrder } from "./filler.js";
import { decodeOrder, validateOrder } from "./validate.js";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const solverPrivateKey = required("SOLVER_PRIVATE_KEY") as `0x${string}`;
const baseRpcUrl = required("BASE_RPC_URL");
const reckonValidatorAddress = required("RECKON_VALIDATOR_ADDRESS") as Address;
const port = parseInt(process.env["PORT"] ?? "3000", 10);

const solverAddress = initFiller({ rpcUrl: baseRpcUrl, solverPrivateKey });

const app = new Hono();

app.get("/health", async (c) => {
  const health = await getHealth();
  return c.json(health);
});

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

serve({ fetch: app.fetch, port }, () => {
  console.log(`[solver] Listening on http://localhost:${port}`);
});
