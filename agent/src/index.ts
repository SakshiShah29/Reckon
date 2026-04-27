import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { bootAgent, configFromEnv, type BootedAgent } from "./boot.js";
import { startFillListener } from "./listener.js";
import { computeEBBO, isSlashable } from "./ebbo.js";
import { runSuspicionTriage, generateSlashExplanation } from "./triage.js";
import { decideChallenge, submitChallengeViaKeeperHub } from "./challenge.js";
import type { FillRecord } from "@reckon-protocol/types";
import { EBBO_PRECISION } from "@reckon-protocol/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = join(__dirname, "..");

// ── OpenClaw workspace config ───────────────────────────────────
// Load workspace markdown files that define this agent's behavior.
// These are the canonical references OpenClaw uses for agent identity,
// operating procedures, and periodic tasks.

function loadWorkspaceFile(filename: string): string {
  try {
    return readFileSync(join(AGENT_ROOT, filename), "utf-8");
  } catch {
    return "";
  }
}

const workspace = {
  soul: loadWorkspaceFile("SOUL.md"),
  agents: loadWorkspaceFile("AGENTS.md"),
  heartbeat: loadWorkspaceFile("HEARTBEAT.md"),
  identity: loadWorkspaceFile("IDENTITY.md"),
};

// ── Skill registry ──────────────────────────────────────────────
// Each skill maps to a SKILL.md definition + a TypeScript implementation.
// Skills are lazy-loaded: the SKILL.md is read on-demand, but the
// implementation functions are imported at startup.

interface Skill {
  name: string;
  description: string;
  path: string;
}

function discoverSkills(): Skill[] {
  const skillsDir = join(AGENT_ROOT, "skills");
  const skills: Skill[] = [];

  for (const name of [
    "inft-boot",
    "fill-monitor",
    "suspicion-triage",
    "ebbo-check",
    "challenge-submit",
  ]) {
    try {
      const md = readFileSync(join(skillsDir, name, "SKILL.md"), "utf-8");
      // Parse description from YAML frontmatter
      const descMatch = md.match(/^description:\s*(.+)$/m);
      skills.push({
        name,
        description: descMatch?.[1] ?? name,
        path: join(skillsDir, name),
      });
    } catch {
      console.warn(`[openclaw] Skill ${name}/SKILL.md not found, skipping`);
    }
  }

  return skills;
}

// Suspicion threshold: skip EBBO computation for fills scoring below this
const SUSPICION_THRESHOLD = 0.3;

/**
 * Reckon Challenger Agent — OpenClaw runtime.
 *
 * This agent follows the OpenClaw workspace pattern:
 * - SOUL.md defines purpose, values, and behavioral boundaries
 * - AGENTS.md defines boot sequence and operating procedures
 * - HEARTBEAT.md defines periodic monitoring tasks
 * - skills/ contains SKILL.md files for each capability
 *
 * The agent loop implements the pipeline from AGENTS.md:
 * Boot → Listen → Triage → EBBO → Decide → Coordinate → Submit
 */
async function main() {
  console.log("=== Reckon Challenger Agent (OpenClaw Runtime) ===");
  console.log();

  // ── Load workspace ──────────────────────────────────────────
  if (workspace.soul) {
    const nameMatch = workspace.identity.match(/^name:\s*(.+)$/m);
    console.log(`[openclaw] Identity: ${nameMatch?.[1] ?? "Reckon Challenger"}`);
  }

  const skills = discoverSkills();
  console.log(`[openclaw] Loaded ${skills.length} skills: ${skills.map((s) => s.name).join(", ")}`);
  console.log();

  // ── Skill: inft-boot ─────────────────────────────────────────
  // Per AGENTS.md boot sequence steps 1-4
  const config = configFromEnv();
  let agent: BootedAgent;

  try {
    agent = await bootAgent(config);
    console.log("[skill:inft-boot] Brain decrypted successfully");
  } catch (err) {
    console.error("[skill:inft-boot] Boot failed:", err);
    console.log("[skill:inft-boot] Running in headless mode (no iNFT brain). Using defaults.");

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

  // ── Initialize 0G Compute broker (lazy) ────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let computeBroker: any | null = null;

  async function getComputeBroker() {
    if (computeBroker) return computeBroker;
    try {
      computeBroker = await createBroker(config.zgRpcUrl, process.env["ZG_AGENT_PRIVATE_KEY"]!);
      return computeBroker;
    } catch (err) {
      console.warn("[openclaw] Failed to create 0G Compute broker:", err);
      return null;
    }
  }

  // ── Skill: fill-monitor (event handler) ────────────────────
  // Per AGENTS.md main loop: for each FillRecorded event, run the pipeline
  async function handleFill(fill: FillRecord) {
    const tag = fill.orderHash.slice(0, 10);
    console.log(`\n[skill:fill-monitor] New fill detected: ${tag}`);

    // ── Skill: suspicion-triage ────────────────────────────────
    // Per AGENTS.md step 1: call 0G Compute for quick score
    const broker = await getComputeBroker();
    let suspicionScore = 0.5;

    if (broker) {
      try {
        const triageResult = await runSuspicionTriage(
          fill,
          config.zgComputeProviderAddress,
          broker,
        );
        suspicionScore = triageResult.score;
        console.log(
          `[skill:suspicion-triage] ${tag} score: ${suspicionScore.toFixed(3)} (model: ${triageResult.model})`,
        );
      } catch (err) {
        console.warn(`[skill:suspicion-triage] ${tag} failed, using default:`, err);
      }
    } else {
      console.log(`[skill:suspicion-triage] ${tag} no compute broker, defaulting to 0.5`);
    }

    if (suspicionScore < SUSPICION_THRESHOLD) {
      console.log(
        `[skill:suspicion-triage] ${tag} score ${suspicionScore.toFixed(3)} < ${SUSPICION_THRESHOLD}, skipping`,
      );
      return;
    }

    // ── Skill: ebbo-check ──────────────────────────────────────
    // Per AGENTS.md step 2-3: compute benchmark and check slashability
    console.log(`[skill:ebbo-check] ${tag} computing benchmark at block ${fill.fillBlock}...`);
    const ebboResult = await computeEBBO(
      config.baseRpcUrl,
      fill.tokenIn as `0x${string}`,
      fill.tokenOut as `0x${string}`,
      BigInt(fill.fillBlock),
    );
    console.log(
      `[skill:ebbo-check] ${tag} benchmark: ${ebboResult.benchmarkPrice} (pools: ${ebboResult.poolPrices.map((p) => p.toString()).join(", ")})`,
    );

    const { slashable, expectedOutput, shortfall } = isSlashable(
      ebboResult.benchmarkPrice,
      BigInt(fill.outputAmount),
      BigInt(fill.inputAmount),
      fill.eboToleranceBps,
    );

    if (!slashable) {
      console.log(`[skill:ebbo-check] ${tag} not slashable (output >= expected)`);
      return;
    }

    console.log(
      `[skill:ebbo-check] ${tag} SLASHABLE! shortfall=${shortfall} expected=${expectedOutput} actual=${fill.outputAmount}`,
    );

    // ── Skill: challenge-submit ────────────────────────────────
    // Per AGENTS.md step 4-6: economic decision + AXL coordination + submit

    // Step 4: Economic decision
    // TODO: Read actual solver bond from SolverBondVault
    const solverBond = 1000n * 10n ** 6n; // 1000 USDC placeholder

    const decision = decideChallenge(fill, shortfall, solverBond, agent.brain);
    console.log(
      `[skill:challenge-submit] ${tag} decision: ${decision.shouldChallenge ? "CHALLENGE" : "SKIP"} — ${decision.reason}`,
    );

    if (!decision.shouldChallenge) {
      return;
    }

    // Step 5: NL explanation (non-blocking, per AGENTS.md step 7)
    const shortfallPct = (
      (Number(shortfall) / Number(expectedOutput)) *
      100
    ).toFixed(2);
    const benchmarkStr = formatPrice(ebboResult.benchmarkPrice);
    const actualStr = formatPrice(
      (BigInt(fill.outputAmount) * EBBO_PRECISION) / BigInt(fill.inputAmount),
    );

    if (broker) {
      generateSlashExplanation(
        fill,
        benchmarkStr,
        actualStr,
        shortfallPct,
        config.zgComputeProviderAddress,
        broker,
      ).then((result) => {
        console.log(`[skill:challenge-submit] ${tag} NL: ${result.explanation}`);
      }).catch(() => {
        // Non-critical, template fallback exists
      });
    }

    // Step 6: Submit via KeeperHub
    // TODO: In Phase 2, AXL claim coordination (step 5) goes here
    const webhookUrl = process.env["KH_WEBHOOK_URL"];
    if (!webhookUrl) {
      console.log(`[skill:challenge-submit] ${tag} KH_WEBHOOK_URL not set, would submit challenge`);
      return;
    }

    console.log(`[skill:challenge-submit] ${tag} submitting via KeeperHub...`);
    const result = await submitChallengeViaKeeperHub(
      fill.orderHash,
      config.tokenId,
      agent.brain.kh_api_key,
      webhookUrl,
    );

    if (result.success) {
      console.log(`[skill:challenge-submit] ${tag} submitted! RunID: ${result.runId}`);
    } else {
      console.error(`[skill:challenge-submit] ${tag} failed: ${result.error}`);
    }
  }

  // ── Start fill listener (AGENTS.md boot step 6) ────────────
  const stopListener = await startFillListener(
    config.baseRpcUrl,
    config.fillRegistryAddress,
    handleFill,
  );

  // ── Heartbeat (per HEARTBEAT.md) ───────────────────────────
  // Parse interval from HEARTBEAT.md frontmatter
  const heartbeatMatch = workspace.heartbeat.match(/^interval:\s*(\d+)/m);
  const heartbeatIntervalSec = heartbeatMatch ? parseInt(heartbeatMatch[1], 10) : 30;

  const heartbeatTimer = setInterval(() => {
    console.log(`[openclaw:heartbeat] Tick — agent alive, listening for fills`);
    // Future: health checks, gap detection, claim cleanup, stats per HEARTBEAT.md
  }, heartbeatIntervalSec * 1000);

  // ── Graceful shutdown (per AGENTS.md shutdown section) ──────
  const shutdown = () => {
    console.log("\n[openclaw] Shutting down...");
    clearInterval(heartbeatTimer);
    stopListener();
    // TODO Phase 3: write performance_history back to brain blob
    // TODO Phase 3: scrub AXL private key from local filesystem
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(`[openclaw] Agent running. Heartbeat every ${heartbeatIntervalSec}s. Listening for fills...`);
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
  console.error("[openclaw] Fatal error:", err);
  process.exit(1);
});
