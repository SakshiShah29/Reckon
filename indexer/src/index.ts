import "dotenv/config";
import { createServer, type IncomingMessage } from "node:http";
import { createWalletClient, http, defineChain, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { startFillListener } from "./fill-listener.js";
import { initRecorder, recordFill } from "./fill-recorder.js";
import { startOwnerAttester } from "./owner-attester.js";
import { startBondUnlocker } from "./bond-unlocker.js";
import { startChallengeListener } from "./challenge-listener.js";
import { createStorageBatcher, type BatcherConfig } from "./storage-batcher.js";
import { closeDb } from "./db.js";
import { initRegistrar, registerSolver, registerChallenger } from "./registrar.js";

const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
});

// ── Environment ─────────────────────────────────────────────────
function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string): string | undefined {
  return process.env[key];
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log("=== Reckon Indexer/Relayer ===");
  console.log();

  const baseRpcUrl = required("BASE_RPC_URL");
  const recorderRpcUrl = optional("RECORDER_RPC_URL") ?? baseRpcUrl; // separate RPC for writing (e.g. Anvil)
  const relayerPrivateKey = required("RELAYER_PRIVATE_KEY") as `0x${string}`;
  const defaultToleranceBps = parseInt(optional("DEFAULT_TOLERANCE_BPS") ?? "50", 10);

  // On-chain recording is optional — omit FILL_REGISTRY_ADDRESS to run in listen-only mode
  const fillRegistryAddress = optional("FILL_REGISTRY_ADDRESS") as Address | undefined;
  const solverRegistryAddress = optional("SOLVER_REGISTRY_ADDRESS") as Address | undefined;

  // ── Initialize fill recorder ─────────────────────────────────
  initRecorder({
    rpcUrl: recorderRpcUrl,
    relayerPrivateKey,
    fillRegistryAddress: fillRegistryAddress ?? "0x0000000000000000000000000000000000000000",
    solverRegistryAddress: solverRegistryAddress ?? "0x0000000000000000000000000000000000000000",
    defaultToleranceBps,
  });

  if (!fillRegistryAddress) {
    console.log("[indexer] Listen-only mode — FILL_REGISTRY_ADDRESS not set, on-chain recording will skip");
  }
  if (!solverRegistryAddress) {
    console.log("[indexer] No SolverRegistry — namehash lookup will use filler address hash fallback");
  }

  // ── Initialize storage batcher (optional) ─────────────────────
  const zgRpcUrl = optional("ZG_RPC_URL");
  const zgIndexerUrl = optional("ZG_INDEXER_URL");
  const zgPrivateKey = optional("RELAYER_PRIVATE_KEY");

  let batcher: ReturnType<typeof createStorageBatcher> | null = null;

  if (zgRpcUrl && zgIndexerUrl && zgPrivateKey) {
    // Build a wallet client for anchorBatch calls (reuses the same relayer key)
    const batcherWallet = fillRegistryAddress
      ? createWalletClient({
          chain: base,
          transport: http(recorderRpcUrl),
          account: privateKeyToAccount(relayerPrivateKey),
        })
      : undefined;

    batcher = createStorageBatcher({
      zgRpcUrl,
      zgIndexerUrl,
      zgPrivateKey,
      walletClient: batcherWallet,
      fillRegistryAddress,
    });
    console.log("[indexer] 0G Storage batcher enabled");
  } else {
    console.log("[indexer] 0G Storage batcher disabled — ZG_* env vars not set");
  }

  // ── Start fill listener ──────────────────────────────────────
  const stopFillListener = await startFillListener(
    baseRpcUrl,
    async (rawFill) => {
      const fill = await recordFill(rawFill);
      if (fill && batcher) {
        await batcher.add(fill);
      }
    },
  );

  // ── Start owner attester (optional) ──────────────────────────
  let stopOwnerAttester: (() => void) | null = null;

  const challengerNftAddress = optional("CHALLENGER_NFT_ADDRESS") as Address | undefined;
  const ownerRegistryAddress = optional("OWNER_REGISTRY_ADDRESS") as Address | undefined;

  if (challengerNftAddress && ownerRegistryAddress && zgRpcUrl) {
    stopOwnerAttester = await startOwnerAttester({
      galileoRpcUrl: zgRpcUrl,
      baseRpcUrl,
      relayerPrivateKey,
      challengerNftAddress,
      ownerRegistryAddress,
    });
  } else {
    console.log("[indexer] Owner attester disabled — CHALLENGER_NFT_ADDRESS or OWNER_REGISTRY_ADDRESS not set");
  }

  // ── Start bond unlocker (needs FillRegistry) ──────────────────
  let stopBondUnlocker: (() => void) | null = null;

  if (fillRegistryAddress) {
    stopBondUnlocker = await startBondUnlocker({
      rpcUrl: recorderRpcUrl,
      relayerPrivateKey,
      fillRegistryAddress,
    });
  } else {
    console.log("[indexer] Bond unlocker disabled — no FILL_REGISTRY_ADDRESS");
  }

  // ── Start challenge listener (needs Challenger + SolverRegistry) ──
  let stopChallengeListener: (() => void) | null = null;

  const challengerContractAddress = optional("CHALLENGER_ADDRESS") as Address | undefined;

  if (challengerContractAddress && solverRegistryAddress) {
    stopChallengeListener = await startChallengeListener({
      rpcUrl: baseRpcUrl,
      recorderRpcUrl,
      relayerPrivateKey,
      challengerAddress: challengerContractAddress,
      solverRegistryAddress,
    });
  } else {
    console.log("[indexer] Challenge listener disabled — CHALLENGER_ADDRESS or SOLVER_REGISTRY_ADDRESS not set");
  }

  // ── Initialize registrar (needs both registries) ──────────────
  const challengerRegistryAddress = optional("CHALLENGER_REGISTRY_ADDRESS") as Address | undefined;

  if (solverRegistryAddress && challengerRegistryAddress) {
    await initRegistrar({
      rpcUrl: recorderRpcUrl,
      relayerPrivateKey,
      solverRegistryAddress,
      challengerRegistryAddress,
    });
  } else {
    console.log("[indexer] Registrar disabled — SOLVER_REGISTRY_ADDRESS or CHALLENGER_REGISTRY_ADDRESS not set");
  }

  // ── HTTP server (health + registration endpoints) ─────────────
  const port = parseInt(process.env["PORT"] ?? "10000", 10);
  const startedAt = Date.now();

  createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);

    if (req.method === "GET" && url.pathname === "/health") {
      const uptime = Math.floor((Date.now() - startedAt) / 1000);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime, batcherPending: batcher?.pending ?? 0 }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/register") {
      if (!solverRegistryAddress || !challengerRegistryAddress) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Registrar not configured" }));
        return;
      }

      try {
        const body = await readBody(req);
        const { label, address: ownerAddress, role } = JSON.parse(body);

        if (!label || !ownerAddress || !role) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required fields: label, address, role" }));
          return;
        }

        if (role !== "solver" && role !== "challenger") {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "role must be 'solver' or 'challenger'" }));
          return;
        }

        const result =
          role === "solver"
            ? await registerSolver(label, ownerAddress)
            : await registerChallenger(label, ownerAddress);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        const message = err.shortMessage ?? err.message ?? "unknown error";
        console.error("[registrar] Registration failed:", message);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }).listen(port, () => {
    console.log(`[indexer] HTTP server listening on :${port}`);
  });

  // ── Health logging ────────────────────────────────────────────
  const healthTimer = setInterval(() => {
    console.log(
      `[indexer:health] alive — batcher pending: ${batcher?.pending ?? 0}`,
    );
  }, 30_000);

  // ── Graceful shutdown ─────────────────────────────────────────
  const shutdown = async () => {
    console.log("\n[indexer] Shutting down...");
    clearInterval(healthTimer);
    stopFillListener();
    if (stopOwnerAttester) stopOwnerAttester();
    if (stopBondUnlocker) stopBondUnlocker();
    if (stopChallengeListener) stopChallengeListener();

    if (batcher) {
      console.log("[indexer] Flushing remaining batch records...");
      await batcher.forceFlush();
    }

    await closeDb();
    console.log("[indexer] Shutdown complete");
    process.exit(0);
  };

  process.on("SIGINT", () => { shutdown(); });
  process.on("SIGTERM", () => { shutdown(); });

  console.log("[indexer] Running. Listening for UniswapX Fill events...");
}

main().catch((err) => {
  console.error("[indexer] Fatal error:", err);
  process.exit(1);
});
