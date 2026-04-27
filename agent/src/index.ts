import "dotenv/config";
import { bootAgent, configFromEnv, type BootedAgent } from "./boot.js";
import { startFillListener } from "./listener.js";
import { computeEBBO, isSlashable } from "./ebbo.js";
import { runSuspicionTriage, generateSlashExplanation } from "./triage.js";
import { decideChallenge, submitChallengeViaKeeperHub } from "./challenge.js";
import type { FillRecord } from "@reckon-protocol/types";
import { USDC_BASE, WETH_BASE, EBBO_PRECISION } from "@reckon-protocol/types";

// Suspicion threshold: skip EBBO computation for fills scoring below this
const SUSPICION_THRESHOLD = 0.3;

/**
 * Main agent loop.
 *
 * Lifecycle per fill:
 * 1. Detect FillRecorded event
 * 2. Suspicion triage via 0G Compute (if available)
 * 3. If suspicious: compute EBBO benchmark deterministically
 * 4. If slashable: economic decision (profit > gas + bond risk?)
 * 5. If profitable: submit challenge via KeeperHub webhook
 */
async function main() {
  console.log("=== Reckon Challenger Agent ===");
  console.log();

  // Boot: load config and decrypt brain blob
  const config = configFromEnv();
  let agent: BootedAgent;

  try {
    agent = await bootAgent(config);
  } catch (err) {
    console.error("[main] Boot failed:", err);
    console.log("[main] Running in headless mode (no iNFT brain). Using defaults.");

    // Headless mode for development/testing without iNFT
    agent = {
      config,
      brain: {
        axl_ed25519_secret: "0".repeat(64),
        ebbo_threshold_prefs: { minSlash: "1000000", maxBondPct: 50 },
        kh_api_key: process.env["KH_API_KEY"] ?? "kh_dev",
        model_config: { model: "Qwen3-32B", maxTokens: 512 },
        performance_history: [],
      },
    };
  }

  // Initialize 0G Compute broker (lazy — only when first needed)
  let computeBroker: Awaited<ReturnType<typeof createBroker>> | null = null;

  async function getComputeBroker() {
    if (computeBroker) return computeBroker;
    try {
      computeBroker = await createBroker(config.zgRpcUrl, process.env["ZG_AGENT_PRIVATE_KEY"]!);
      return computeBroker;
    } catch (err) {
      console.warn("[main] Failed to create 0G Compute broker:", err);
      return null;
    }
  }

  // Fill handler — the core per-fill analysis pipeline
  async function handleFill(fill: FillRecord) {
    const tag = fill.orderHash.slice(0, 10);
    console.log(`\n[agent] Processing fill ${tag}...`);

    // Step 1: Suspicion triage (optional, saves compute)
    const broker = await getComputeBroker();
    let suspicionScore = 0.5; // default if compute unavailable

    if (broker) {
      try {
        const triageResult = await runSuspicionTriage(
          fill,
          config.zgComputeProviderAddress,
          broker,
        );
        suspicionScore = triageResult.score;
        console.log(
          `[agent] ${tag} triage score: ${suspicionScore.toFixed(3)} (model: ${triageResult.model})`,
        );
      } catch (err) {
        console.warn(`[agent] ${tag} triage failed, using default:`, err);
      }
    } else {
      console.log(`[agent] ${tag} no compute broker, skipping triage`);
    }

    if (suspicionScore < SUSPICION_THRESHOLD) {
      console.log(
        `[agent] ${tag} suspicion ${suspicionScore.toFixed(3)} < threshold ${SUSPICION_THRESHOLD}, skipping`,
      );
      return;
    }

    // Step 2: Compute EBBO benchmark deterministically
    console.log(`[agent] ${tag} computing EBBO benchmark at block ${fill.fillBlock}...`);
    const ebboResult = await computeEBBO(
      config.baseRpcUrl,
      fill.tokenIn as `0x${string}`,
      fill.tokenOut as `0x${string}`,
      BigInt(fill.fillBlock),
    );
    console.log(
      `[agent] ${tag} benchmark: ${ebboResult.benchmarkPrice} (pools: ${ebboResult.poolPrices.map((p) => p.toString()).join(", ")})`,
    );

    // Step 3: Check if slashable
    const { slashable, expectedOutput, shortfall } = isSlashable(
      ebboResult.benchmarkPrice,
      BigInt(fill.outputAmount),
      BigInt(fill.inputAmount),
      fill.eboToleranceBps,
    );

    if (!slashable) {
      console.log(`[agent] ${tag} not slashable (output >= expected)`);
      return;
    }

    console.log(
      `[agent] ${tag} SLASHABLE! shortfall=${shortfall} expected=${expectedOutput} actual=${fill.outputAmount}`,
    );

    // Step 4: Economic decision
    // TODO: Read actual solver bond from SolverBondVault
    // For now, assume base bond
    const solverBond = 1000n * 10n ** 6n; // 1000 USDC placeholder

    const decision = decideChallenge(fill, shortfall, solverBond, agent.brain);
    console.log(
      `[agent] ${tag} decision: ${decision.shouldChallenge ? "CHALLENGE" : "SKIP"} — ${decision.reason}`,
    );

    if (!decision.shouldChallenge) {
      return;
    }

    // Step 5: Generate NL explanation (non-blocking)
    const shortfallPct = (
      (Number(shortfall) / Number(expectedOutput)) *
      100
    ).toFixed(2);
    const benchmarkStr = formatPrice(ebboResult.benchmarkPrice);
    const actualStr = formatPrice(
      (BigInt(fill.outputAmount) * EBBO_PRECISION) / BigInt(fill.inputAmount),
    );

    // Fire explanation generation in background (don't block challenge)
    if (broker) {
      generateSlashExplanation(
        fill,
        benchmarkStr,
        actualStr,
        shortfallPct,
        config.zgComputeProviderAddress,
        broker,
      ).then((result) => {
        console.log(`[agent] ${tag} NL explanation: ${result.explanation}`);
      }).catch(() => {
        // Non-critical, already has template fallback
      });
    }

    // Step 6: Submit challenge via KeeperHub
    // TODO: In Phase 2, this goes through AXL claim coordination first
    const webhookUrl = process.env["KH_WEBHOOK_URL"];
    if (!webhookUrl) {
      console.log(`[agent] ${tag} KH_WEBHOOK_URL not set, would submit challenge`);
      return;
    }

    console.log(`[agent] ${tag} submitting challenge via KeeperHub...`);
    const result = await submitChallengeViaKeeperHub(
      fill.orderHash,
      config.tokenId,
      agent.brain.kh_api_key,
      webhookUrl,
    );

    if (result.success) {
      console.log(`[agent] ${tag} challenge submitted! RunID: ${result.runId}`);
    } else {
      console.error(`[agent] ${tag} challenge submission failed: ${result.error}`);
    }
  }

  // Start listening for fills
  const stopListener = await startFillListener(
    config.baseRpcUrl,
    config.fillRegistryAddress,
    handleFill,
  );

  // Graceful shutdown
  const shutdown = () => {
    console.log("\n[agent] Shutting down...");
    stopListener();
    // TODO: In Phase 3, write performance_history back to brain blob
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("[agent] Agent is running. Listening for fills...");
}

/**
 * Create 0G Compute broker. Separate function for lazy init.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createBroker(rpcUrl: string, privateKey: string): Promise<any> {
  const { ethers } = await import("ethers");
  const { createZGComputeNetworkBroker } = await import(
    "@0glabs/0g-serving-broker"
  );

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM ethers type mismatch
  return await createZGComputeNetworkBroker(wallet as any);
}

function formatPrice(price1e18: bigint): string {
  const whole = price1e18 / EBBO_PRECISION;
  const frac = price1e18 % EBBO_PRECISION;
  const fracStr = frac.toString().padStart(18, "0").slice(0, 6);
  return `${whole}.${fracStr}`;
}

main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
