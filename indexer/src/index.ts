import "dotenv/config";
import { startFillListener } from "./fill-listener.js";
import { initRecorder, recordFill } from "./fill-recorder.js";
import { startOwnerAttester } from "./owner-attester.js";
import { createStorageBatcher, type BatcherConfig } from "./storage-batcher.js";
import { closeDb } from "./db.js";
import type { Address } from "viem";

// ── Environment ─────────────────────────────────────────────────
function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string): string | undefined {
  return process.env[key];
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log("=== Reckon Indexer/Relayer ===");
  console.log();

  const baseRpcUrl = required("BASE_RPC_URL");
  const relayerPrivateKey = required("RELAYER_PRIVATE_KEY") as `0x${string}`;
  const defaultToleranceBps = parseInt(optional("DEFAULT_TOLERANCE_BPS") ?? "50", 10);

  // On-chain recording is optional — omit FILL_REGISTRY_ADDRESS to run in listen-only mode
  const fillRegistryAddress = optional("FILL_REGISTRY_ADDRESS") as Address | undefined;
  const subnameRegistrarAddress = optional("SUBNAME_REGISTRAR_ADDRESS") as Address | undefined;

  // ── Initialize fill recorder ─────────────────────────────────
  initRecorder({
    rpcUrl: baseRpcUrl,
    relayerPrivateKey,
    fillRegistryAddress: fillRegistryAddress ?? "0x0000000000000000000000000000000000000000",
    subnameRegistrarAddress: subnameRegistrarAddress ?? "0x0000000000000000000000000000000000000000",
    defaultToleranceBps,
  });

  if (!fillRegistryAddress) {
    console.log("[indexer] Listen-only mode — FILL_REGISTRY_ADDRESS not set, on-chain recording will skip");
  }
  if (!subnameRegistrarAddress) {
    console.log("[indexer] No SubnameRegistrar — ENS namehash will use filler address hash fallback");
  }

  // ── Initialize storage batcher (optional) ─────────────────────
  const zgRpcUrl = optional("ZG_RPC_URL");
  const zgIndexerUrl = optional("ZG_INDEXER_URL");
  const zgPrivateKey = optional("ZG_RELAYER_PRIVATE_KEY");

  let batcher: ReturnType<typeof createStorageBatcher> | null = null;

  if (zgRpcUrl && zgIndexerUrl && zgPrivateKey) {
    batcher = createStorageBatcher({ zgRpcUrl, zgIndexerUrl, zgPrivateKey });
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
