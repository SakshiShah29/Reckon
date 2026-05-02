import "dotenv/config";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http, defineChain, type Address } from "viem";
import { bootAgent, configFromEnv, type BootedAgent } from "./boot.js";
import { bootstrapChallenger } from "./bootstrap.js";
import { startFillListener } from "./listener.js";
import { computeEBBO, computeEBBOViaKeeperHub, isSlashable, type EBBOKeeperHubConfig } from "./ebbo.js";
import { runSuspicionTriage, generateSlashExplanation } from "./triage.js";
import { coordinate, type CoordinateConfig } from "./coordinate.js";
import { decideChallenge } from "./decide.js";
import { submitChallenge, type SubmitConfig } from "./submit.js";
import type { FillRecord } from "@reckon-protocol/types";
import { EBBO_PRECISION, BASE_SEPOLIA_CHAIN_ID } from "@reckon-protocol/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = join(__dirname, "..");

const baseSepolia = defineChain({
  id: BASE_SEPOLIA_CHAIN_ID,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
});

const SolverBondVaultABI = [
  {
    inputs: [{ name: "node", type: "bytes32" }],
    name: "bondedAmount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

function loadSkillMd(): string {
  try {
    return readFileSync(join(AGENT_ROOT, "SKILL.md"), "utf-8");
  } catch {
    return "";
  }
}

const SUSPICION_THRESHOLD = 0.3;

/**
 * Reckon Challenger Agent — SKILL.md orchestrator (v0.10).
 *
 * Pipeline per SKILL.md:
 *   FillRecorded → triage.ts → ebbo.ts → coordinate.ts → decide.ts → submit.ts
 */
async function main() {
  console.log("=== Reckon Challenger Agent ===");

  const skillMd = loadSkillMd();
  if (skillMd) {
    console.log("[orchestrator] SKILL.md loaded");
  } else {
    console.log("[orchestrator] SKILL.md not found — running with defaults");
  }

  // ── Boot: read iNFT, decrypt brain ─────────────────────────
  const config = configFromEnv();
  let agent: BootedAgent;

  try {
    agent = await bootAgent(config);
    console.log("[boot] Brain decrypted successfully");
  } catch (err) {
    if (process.env["HEADLESS_MODE"] === "true") {
      console.warn("[boot] Boot failed, running in headless mode:", err);
      agent = {
        config,
        brain: {
          axl_ed25519_secret: "0".repeat(64),
          ebbo_threshold_prefs: { minSlash: "1000000", maxBondPct: 50 },
          kh_api_key: process.env["KH_API_KEY"] ?? "kh_dev",
          model_config: { model: "qwen/qwen-2.5-7b-instruct" },
          performance_history: [],
        },
      };
    } else {
      console.error("[boot] Fatal:", err instanceof Error ? err.message : err);
      console.error("[boot] Set HEADLESS_MODE=true to bypass brain blob requirement.");
      process.exit(1);
    }
  }

  // ── 0G Compute API key ──────────────────────────────────────
  const zgApiKey = process.env["ZG_API_KEY"] ?? "";
  if (!zgApiKey) {
    console.warn("[orchestrator] ZG_API_KEY not set — triage will default to 0.5");
  }

  // ── Coordinate config ──────────────────────────────────────
  const coordConfig: CoordinateConfig = {
    zgRpcUrl: config.zgRpcUrl,
    zgIndexerUrl: config.zgIndexerUrl,
    zgPrivateKey: process.env["ZG_AGENT_PRIVATE_KEY"] ?? "",
    kvNodeUrl: process.env["ZG_KV_NODE_URL"],
    axlApiUrl: process.env["AXL_API_URL"],
    axlPeerKeys: process.env["AXL_PEER_KEYS"]?.split(",").filter(Boolean),
    axlPrivateKeyHex: agent.brain.axl_ed25519_secret,
  };

  // ── Submit config ───────────────────────────────────────────
  const submitConfig: SubmitConfig = {
    baseRpcUrl: config.baseRpcUrl,
    agentPrivateKey: (process.env["ZG_AGENT_PRIVATE_KEY"] ?? "0x") as `0x${string}`,
    challengerAddress: (process.env["CHALLENGER_ADDRESS"] ?? "0x") as `0x${string}`,
    keeperHubWebhookUrl: process.env["KH_WEBHOOK_URL"],
    keeperHubApiKey: process.env["KH_WEBHOOK_API_KEY"],
    keeperHubOrgApiKey: process.env["KH_API_KEY"],
  };

  if (submitConfig.keeperHubWebhookUrl) {
    console.log("[orchestrator] KeeperHub webhook mode enabled — challenges will be submitted via KeeperHub");
  }

  // ── EBBO KeeperHub config ──────────────────────────────────
  const ebboKhConfig: EBBOKeeperHubConfig | undefined = process.env["KH_EBBO_WEBHOOK_URL"]
    ? {
        webhookUrl: process.env["KH_EBBO_WEBHOOK_URL"],
        apiKey: process.env["KH_WEBHOOK_API_KEY"] ?? "",
        orgApiKey: process.env["KH_API_KEY"],
      }
    : undefined;

  if (ebboKhConfig) {
    console.log("[orchestrator] KeeperHub EBBO mode enabled — benchmark reads via KeeperHub");
  }

  // ── EBBO RPC — same as contracts chain (Base Sepolia) since test pool lives there ──
  const ebboRpcUrl = config.baseRpcUrl;
  console.log("[orchestrator] EBBO + contracts both via Base Sepolia");

  // ── Base client for on-chain reads ─────────────────────────
  const baseClient = createPublicClient({
    chain: baseSepolia,
    transport: http(config.baseRpcUrl),
  });
  const bondVaultAddress = process.env["SOLVER_BOND_VAULT_ADDRESS"] as Address | undefined;

  // ── Bootstrap: register in ChallengerRegistry if needed ───
  const relayerUrl = process.env["RELAYER_URL"];
  const challengerLabel = process.env["CHALLENGER_LABEL"];
  const challengerRegistryAddress = process.env["CHALLENGER_REGISTRY_ADDRESS"] as Address | undefined;
  const ownerRegistryAddress = process.env["OWNER_REGISTRY_ADDRESS"] as Address | undefined;

  if (relayerUrl && challengerLabel && challengerRegistryAddress && ownerRegistryAddress) {
    const { privateKeyToAccount } = await import("viem/accounts");
    const agentAccount = privateKeyToAccount(submitConfig.agentPrivateKey);

    await bootstrapChallenger({
      publicClient: baseClient,
      agentAddress: agentAccount.address,
      challengerRegistryAddress,
      ownerRegistryAddress,
      agentTokenId: config.tokenId,
      relayerUrl,
      challengerLabel,
    });
  } else {
    console.log("[bootstrap] Skipped — set RELAYER_URL, CHALLENGER_LABEL, CHALLENGER_REGISTRY_ADDRESS, OWNER_REGISTRY_ADDRESS to enable");
  }

  // ── SKILL.md pipeline: per-fill handler ────────────────────
  async function handleFill(fill: FillRecord) {
    const tag = fill.orderHash.slice(0, 10);
    console.log(`\n[orchestrator] ── Fill ${tag} ──`);

    // Step 1: triage.ts — 0G Compute suspicion score
    let suspicionScore = 0.5;

    if (zgApiKey) {
      try {
        const triageResult = await runSuspicionTriage(fill, zgApiKey);
        suspicionScore = triageResult.score;
        console.log(
          `[triage] ${tag} score=${suspicionScore.toFixed(3)} model=${triageResult.model}`,
        );
      } catch (err) {
        console.warn(`[triage] ${tag} failed, defaulting to 0.5:`, err);
      }
    } else {
      console.log(`[triage] ${tag} no API key, defaulting to 0.5`);
    }

    if (suspicionScore < SUSPICION_THRESHOLD) {
      console.log(`[triage] ${tag} score below threshold, skipping`);
      return;
    }

    // Step 2: ebbo.ts — benchmark price via KeeperHub or direct RPC
    console.log(`[ebbo] ${tag} computing benchmark...`);
    const ebboResult = ebboKhConfig
      ? await computeEBBOViaKeeperHub(
          fill.tokenIn as `0x${string}`,
          fill.tokenOut as `0x${string}`,
          ebboKhConfig,
        )
      : await computeEBBO(
          ebboRpcUrl,
          fill.tokenIn as `0x${string}`,
          fill.tokenOut as `0x${string}`,
          config.anvilRpcUrl ? undefined : BigInt(fill.fillBlock),
        );

    const { slashable, expectedOutput, shortfall } = isSlashable(
      ebboResult.benchmarkPrice,
      BigInt(fill.outputAmount),
      BigInt(fill.inputAmount),
      fill.eboToleranceBps,
    );

    if (!slashable) {
      console.log(`[ebbo] ${tag} not slashable`);
      return;
    }

    console.log(
      `[ebbo] ${tag} SLASHABLE shortfall=${shortfall} expected=${expectedOutput}`,
    );

    // Step 3: coordinate.ts — AXL gossip + 0G KV claim dedup
    const checkResult = await coordinate(
      "check",
      fill.orderHash,
      config.tokenId,
      coordConfig,
    );

    if (checkResult.claimedBy && checkResult.claimedBy !== config.tokenId) {
      console.log(`[coordinate] ${tag} already claimed by ${checkResult.claimedBy}`);
      return;
    }

    const acquireResult = await coordinate(
      "acquire",
      fill.orderHash,
      config.tokenId,
      coordConfig,
    );

    if (!acquireResult.claimAcquired) {
      console.log(
        `[coordinate] ${tag} claim failed: ${acquireResult.reason} (claimed by ${acquireResult.claimedBy})`,
      );
      return;
    }

    console.log(`[coordinate] ${tag} claim acquired`);

    // Step 4: decide.ts — cost-benefit analysis
    let solverBond = 1000n * 10n ** 6n; // default 1000 USDC
    if (bondVaultAddress) {
      try {
        const bondRaw = await baseClient.readContract({
          address: bondVaultAddress,
          abi: SolverBondVaultABI,
          functionName: "bondedAmount",
          args: [fill.fillerNamehash],
        });
        solverBond = bondRaw;
      } catch (err) {
        console.warn(`[decide] ${tag} bond read failed, using default:`, err);
      }
    }

    const decision = decideChallenge(fill, shortfall, solverBond, agent.brain);
    console.log(
      `[decide] ${tag} ${decision.shouldChallenge ? "CHALLENGE" : "SKIP"} — ${decision.reason}`,
    );

    if (!decision.shouldChallenge) {
      await coordinate("release", fill.orderHash, config.tokenId, coordConfig);
      return;
    }

    // NL explanation (non-blocking)
    const shortfallPct = (
      (Number(shortfall) / Number(expectedOutput)) *
      100
    ).toFixed(2);
    const benchmarkStr = formatPrice(ebboResult.benchmarkPrice);
    const actualStr = formatPrice(
      (BigInt(fill.outputAmount) * EBBO_PRECISION) / BigInt(fill.inputAmount),
    );

    if (zgApiKey) {
      generateSlashExplanation(fill, benchmarkStr, actualStr, shortfallPct, zgApiKey)
        .then((r) => console.log(`[submit] ${tag} NL: ${r.explanation}`))
        .catch(() => {});
    }

    // Step 5: submit.ts — direct on-chain challenge
    console.log(`[submit] ${tag} submitting challenge on-chain...`);
    const result = await submitChallenge(
      fill.orderHash as `0x${string}`,
      config.tokenId,
      solverBond,
      submitConfig,
    );

    if (result.success) {
      console.log(`[submit] ${tag} challenge submitted! tx: ${result.txHash}`);
    } else {
      console.error(`[submit] ${tag} failed: ${result.error}`);
    }
  }

  // ── Start fill listener ────────────────────────────────────
  const stopListener = await startFillListener(
    config.baseRpcUrl,
    config.fillRegistryAddress,
    handleFill,
  );

  // ── Heartbeat ──────────────────────────────────────────────
  const heartbeatTimer = setInterval(() => {
    console.log(`[orchestrator] heartbeat — alive, listening for fills`);
  }, 30_000);

  // ── Graceful shutdown ──────────────────────────────────────
  const shutdown = () => {
    console.log("\n[orchestrator] Shutting down...");
    clearInterval(heartbeatTimer);
    stopListener();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("[orchestrator] Running. Pipeline: triage → ebbo → coordinate → decide → submit");
}


function formatPrice(price1e18: bigint): string {
  const whole = price1e18 / EBBO_PRECISION;
  const frac = price1e18 % EBBO_PRECISION;
  const fracStr = frac.toString().padStart(18, "0").slice(0, 6);
  return `${whole}.${fracStr}`;
}

main().catch((err) => {
  console.error("[orchestrator] Fatal:", err);
  process.exit(1);
});
