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
import { USDC_BASE, WETH_BASE, USDC_BASE_SEP, WETH_BASE_SEP } from "@reckon-protocol/types";
import { createLogger, redactKey } from "./logger.js";

const log = createLogger("indexer");

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
  log.info("========================================");
  log.info("  Reckon Indexer/Relayer — Starting up");
  log.info("========================================");
  log.info(`Node ${process.version} | PID ${process.pid} | env=${process.env["NODE_ENV"] ?? "development"}`);

  const baseRpcUrl = required("BASE_RPC_URL"); // Anvil fork — swap events
  const baseSepoliaRpcUrl = optional("BASE_SEPOLIA_RPC_URL"); // Base Sepolia — protocol contracts
  const recorderRpcUrl = baseSepoliaRpcUrl ?? optional("RECORDER_RPC_URL") ?? baseRpcUrl;
  const relayerPrivateKey = required("RELAYER_PRIVATE_KEY") as `0x${string}`;
  const defaultToleranceBps = parseInt(optional("DEFAULT_TOLERANCE_BPS") ?? "50", 10);

  // ── Config summary ─────────────────────────────────────────────
  log.info("Configuration:", {
    BASE_RPC_URL: baseRpcUrl,
    BASE_SEPOLIA_RPC_URL: baseSepoliaRpcUrl ?? "(not set)",
    RECORDER_RPC_URL: recorderRpcUrl,
    relayerKey: redactKey(relayerPrivateKey),
    defaultToleranceBps,
  });

  const fillRegistryAddress = optional("FILL_REGISTRY_ADDRESS") as Address | undefined;
  const solverRegistryAddress = optional("SOLVER_REGISTRY_ADDRESS") as Address | undefined;

  log.info("Contract addresses:", {
    FILL_REGISTRY: fillRegistryAddress ?? "(not set — listen-only mode)",
    SOLVER_REGISTRY: solverRegistryAddress ?? "(not set — hash fallback)",
    CHALLENGER: optional("CHALLENGER_ADDRESS") ?? "(not set)",
    CHALLENGER_NFT: optional("CHALLENGER_NFT_ADDRESS") ?? "(not set)",
    OWNER_REGISTRY: optional("OWNER_REGISTRY_ADDRESS") ?? "(not set)",
    CHALLENGER_REGISTRY: optional("CHALLENGER_REGISTRY_ADDRESS") ?? "(not set)",
  });

  if (baseSepoliaRpcUrl) {
    log.info("Dual-chain mode ACTIVE: listening on Anvil fork, recording on Base Sepolia");
  }

  // ── Initialize fill recorder ─────────────────────────────────
  initRecorder({
    rpcUrl: recorderRpcUrl,
    relayerPrivateKey,
    fillRegistryAddress: fillRegistryAddress ?? "0x0000000000000000000000000000000000000000",
    solverRegistryAddress: solverRegistryAddress ?? "0x0000000000000000000000000000000000000000",
    defaultToleranceBps,
    fillSourceRpcUrl: baseSepoliaRpcUrl ? baseRpcUrl : undefined,
    tokenAddressMap: baseSepoliaRpcUrl
      ? {
          [USDC_BASE.toLowerCase()]: USDC_BASE_SEP,
          [WETH_BASE.toLowerCase()]: WETH_BASE_SEP,
        }
      : undefined,
  });

  if (!fillRegistryAddress) {
    log.warn("Listen-only mode — FILL_REGISTRY_ADDRESS not set, on-chain recording will skip");
  }
  if (!solverRegistryAddress) {
    log.warn("No SolverRegistry — namehash lookup will use filler address hash fallback");
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
          chain: baseSepoliaRpcUrl ? baseSepolia : base,
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
    log.info("0G Storage batcher ENABLED", { zgRpcUrl, zgIndexerUrl });
  } else {
    log.info("0G Storage batcher DISABLED — ZG_* env vars not set");
  }

  // ── Track module statuses for startup summary ─────────────────
  const modules: { name: string; status: string }[] = [];

  // ── Start fill listener ──────────────────────────────────────
  let fillsProcessed = 0;
  const stopFillListener = await startFillListener(
    baseRpcUrl,
    async (rawFill) => {
      const fill = await recordFill(rawFill);
      fillsProcessed++;
      if (fill && batcher) {
        await batcher.add(fill);
      }
    },
  );
  modules.push({ name: "fill-listener", status: "RUNNING" });

  // ── Start owner attester (optional) ──────────────────────────
  let stopOwnerAttester: (() => void) | null = null;

  const challengerNftAddress = optional("CHALLENGER_NFT_ADDRESS") as Address | undefined;
  const ownerRegistryAddress = optional("OWNER_REGISTRY_ADDRESS") as Address | undefined;

  if (challengerNftAddress && ownerRegistryAddress && zgRpcUrl) {
    stopOwnerAttester = await startOwnerAttester({
      galileoRpcUrl: zgRpcUrl,
      baseRpcUrl: baseSepoliaRpcUrl ?? baseRpcUrl,
      relayerPrivateKey,
      challengerNftAddress,
      ownerRegistryAddress,
      useBaseSepolia: !!baseSepoliaRpcUrl,
    });
    modules.push({ name: "owner-attester", status: "RUNNING" });
  } else {
    log.info("Owner attester DISABLED — CHALLENGER_NFT_ADDRESS or OWNER_REGISTRY_ADDRESS not set");
    modules.push({ name: "owner-attester", status: "DISABLED" });
  }

  // ── Start bond unlocker (needs FillRegistry) ──────────────────
  let stopBondUnlocker: (() => void) | null = null;

  if (fillRegistryAddress) {
    stopBondUnlocker = await startBondUnlocker({
      rpcUrl: recorderRpcUrl,
      relayerPrivateKey,
      fillRegistryAddress,
      useBaseSepolia: !!baseSepoliaRpcUrl,
    });
    modules.push({ name: "bond-unlocker", status: "RUNNING" });
  } else {
    log.info("Bond unlocker DISABLED — no FILL_REGISTRY_ADDRESS");
    modules.push({ name: "bond-unlocker", status: "DISABLED" });
  }

  // ── Start challenge listener (needs Challenger + SolverRegistry) ──
  let stopChallengeListener: (() => void) | null = null;

  const challengerContractAddress = optional("CHALLENGER_ADDRESS") as Address | undefined;

  if (challengerContractAddress && solverRegistryAddress) {
    stopChallengeListener = await startChallengeListener({
      rpcUrl: recorderRpcUrl,   // Challenge events are on Base Sepolia, not Anvil
      recorderRpcUrl,
      relayerPrivateKey,
      challengerAddress: challengerContractAddress,
      solverRegistryAddress,
      useBaseSepolia: !!baseSepoliaRpcUrl,
    });
    modules.push({ name: "challenge-listener", status: "RUNNING" });
  } else {
    log.info("Challenge listener DISABLED — CHALLENGER_ADDRESS or SOLVER_REGISTRY_ADDRESS not set");
    modules.push({ name: "challenge-listener", status: "DISABLED" });
  }

  // ── Initialize registrar (needs both registries) ──────────────
  const challengerRegistryAddress = optional("CHALLENGER_REGISTRY_ADDRESS") as Address | undefined;

  const anvilSolverRegistryAddress = optional("ANVIL_SOLVER_REGISTRY_ADDRESS") as Address | undefined;
  const anvilChallengerRegistryAddress = optional("ANVIL_CHALLENGER_REGISTRY_ADDRESS") as Address | undefined;

  if (solverRegistryAddress && challengerRegistryAddress) {
    await initRegistrar({
      rpcUrl: recorderRpcUrl,
      relayerPrivateKey,
      solverRegistryAddress,
      challengerRegistryAddress,
      secondaryRpcUrl: baseSepoliaRpcUrl ? baseRpcUrl : undefined,
      secondarySolverRegistryAddress: anvilSolverRegistryAddress,
      secondaryChallengerRegistryAddress: anvilChallengerRegistryAddress,
    });
    modules.push({ name: "registrar", status: "RUNNING" });
  } else {
    log.info("Registrar DISABLED — SOLVER_REGISTRY_ADDRESS or CHALLENGER_REGISTRY_ADDRESS not set");
    modules.push({ name: "registrar", status: "DISABLED" });
  }

  // ── Startup summary ───────────────────────────────────────────
  log.info("────────────────────────────────────────");
  log.info("Module status:");
  for (const m of modules) {
    log.info(`  ${m.status === "RUNNING" ? "+" : "-"} ${m.name}: ${m.status}`);
  }
  log.info("────────────────────────────────────────");

  // ── HTTP server (health + registration endpoints) ─────────────
  const port = parseInt(process.env["PORT"] ?? "10000", 10);
  const startedAt = Date.now();
  const httpLog = createLogger("http");

  createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const method = req.method ?? "GET";
    const reqStart = Date.now();

    if (method === "GET" && url.pathname === "/health") {
      const uptime = Math.floor((Date.now() - startedAt) / 1000);
      const body = { status: "ok", uptime, batcherPending: batcher?.pending ?? 0, fillsProcessed };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }

    if (method === "POST" && url.pathname === "/register") {
      httpLog.info(`POST /register`, { ip: req.socket.remoteAddress });

      if (!solverRegistryAddress || !challengerRegistryAddress) {
        httpLog.warn("Registration attempted but registrar not configured");
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Registrar not configured" }));
        return;
      }

      try {
        const body = await readBody(req);
        const { label, address: ownerAddress, role } = JSON.parse(body);

        httpLog.info("Registration request", { label, address: ownerAddress ?? "", role });

        if (!label || !ownerAddress || !role) {
          httpLog.warn("Missing required fields in registration request");
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing required fields: label, address, role" }));
          return;
        }

        if (role !== "solver" && role !== "challenger") {
          httpLog.warn("Invalid role in registration request", { role });
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "role must be 'solver' or 'challenger'" }));
          return;
        }

        const result =
          role === "solver"
            ? await registerSolver(label, ownerAddress)
            : await registerChallenger(label, ownerAddress);

        httpLog.info("Registration succeeded", {
          label,
          role,
          node: result.node,
          duration: `${Date.now() - reqStart}ms`,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        const message = err.shortMessage ?? err.message ?? "unknown error";
        httpLog.error(`Registration failed: ${message}`, err);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    httpLog.warn(`404 ${method} ${url.pathname}`);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }).listen(port, () => {
    log.info(`HTTP server listening on port ${port}`);
  });

  // ── Periodic stats logging ─────────────────────────────────────
  const statsLog = createLogger("stats");
  const healthTimer = setInterval(() => {
    const uptime = Math.floor((Date.now() - startedAt) / 1000);
    const uptimeStr = uptime < 60 ? `${uptime}s` : `${Math.floor(uptime / 60)}m${uptime % 60}s`;
    const memMB = Math.round(process.memoryUsage.rss() / 1024 / 1024);
    statsLog.info("Heartbeat", {
      uptime: uptimeStr,
      fillsProcessed,
      batcherPending: batcher?.pending ?? 0,
      memoryMB: memMB,
    });
  }, 30_000);

  // ── Graceful shutdown ─────────────────────────────────────────
  const shutdown = async (signal: string) => {
    log.info(`Received ${signal} — shutting down gracefully...`);
    clearInterval(healthTimer);
    stopFillListener();
    if (stopOwnerAttester) stopOwnerAttester();
    if (stopBondUnlocker) stopBondUnlocker();
    if (stopChallengeListener) stopChallengeListener();

    if (batcher && batcher.pending > 0) {
      log.info(`Flushing remaining ${batcher.pending} batch records...`);
      await batcher.forceFlush();
    }

    await closeDb();
    log.info("Shutdown complete. Goodbye.");
    process.exit(0);
  };

  process.on("SIGINT", () => { shutdown("SIGINT"); });
  process.on("SIGTERM", () => { shutdown("SIGTERM"); });

  log.info("Indexer fully started. Listening for UniswapX Fill events...");
}

main().catch((err) => {
  log.error("Fatal startup error — exiting", err);
  process.exit(1);
});
