import type { BrainBlob, FillRecord } from "@reckon-protocol/types";
import { CHALLENGER_BOND_PCT } from "@reckon-protocol/types";

export interface ChallengeDecision {
  shouldChallenge: boolean;
  reason: string;
  estimatedSlashAmount: bigint;
  estimatedGasCost: bigint;
  estimatedBondRisk: bigint;
  expectedProfit: bigint;
}

/**
 * Gas cost estimate for a challenge submission on Base (pre-multiplier).
 * Challenge submission ≤ 280k gas per spec NFR-1.
 * Base gas price ~0.01 gwei typical, but budget conservatively.
 */
const ESTIMATED_CHALLENGE_GAS = 280_000n;
const CONSERVATIVE_GAS_PRICE = 100_000_000n; // 0.1 gwei in wei

/**
 * Decides whether to submit a challenge based on economic analysis.
 *
 * Challenge if: slashable_amount > gas_cost + bond_risk_adjusted
 *
 * @param fill - The fill record being analyzed
 * @param shortfall - The amount by which actual output falls short of expected (in output token units)
 * @param solverBondAmount - Solver's current bond in the vault (in USDC atomic units)
 * @param brain - Agent's brain config with threshold preferences
 */
export function decideChallenge(
  fill: FillRecord,
  shortfall: bigint,
  solverBondAmount: bigint,
  brain: BrainBlob,
): ChallengeDecision {
  // Slash amount is capped at solver's bond
  const estimatedSlashAmount =
    shortfall < solverBondAmount ? shortfall : solverBondAmount;

  // Challenger bond = 10% of solver bond
  const challengerBond =
    (solverBondAmount * BigInt(CHALLENGER_BOND_PCT)) / 100n;

  // Gas cost estimate (in ETH, rough conversion to USDC at ~$3000/ETH, 6 decimals)
  const gasCostWei = ESTIMATED_CHALLENGE_GAS * CONSERVATIVE_GAS_PRICE;
  // Convert Wei to approximate USDC (assuming ~3000 USDC/ETH, 6 decimal USDC)
  // gasCostUSDC = gasCostWei * 3000 * 1e6 / 1e18
  const estimatedGasCost = (gasCostWei * 3000n * 1_000_000n) / (10n ** 18n);

  // Bond risk: if challenge fails, we lose the bond. Weight by estimated success probability.
  // Conservative: assume 5% failure risk on challenges we compute as slashable
  const estimatedBondRisk = challengerBond / 20n; // 5% of bond

  // Expected profit = 30% of slash (our share) - gas - bond risk
  const ourShare = (estimatedSlashAmount * 3000n) / 10000n; // 30% in USDC atomic
  const expectedProfit = ourShare - estimatedGasCost - estimatedBondRisk;

  // Check against minimum slash threshold from brain config
  const minSlash = BigInt(brain.ebbo_threshold_prefs.minSlash);

  // Check against max bond percentage from brain config
  const maxBondValue =
    (solverBondAmount * BigInt(brain.ebbo_threshold_prefs.maxBondPct)) / 100n;
  const bondWithinLimit = challengerBond <= maxBondValue;

  const shouldChallenge =
    estimatedSlashAmount >= minSlash &&
    expectedProfit > 0n &&
    bondWithinLimit;

  let reason: string;
  if (!shouldChallenge) {
    if (estimatedSlashAmount < minSlash) {
      reason = `Slash amount ${estimatedSlashAmount} below min threshold ${minSlash}`;
    } else if (expectedProfit <= 0n) {
      reason = `Expected profit ${expectedProfit} not positive (gas: ${estimatedGasCost}, bond risk: ${estimatedBondRisk})`;
    } else {
      reason = `Challenger bond ${challengerBond} exceeds max bond limit ${maxBondValue}`;
    }
  } else {
    reason = `Profitable: slash=${estimatedSlashAmount}, profit=${expectedProfit}`;
  }

  return {
    shouldChallenge,
    reason,
    estimatedSlashAmount,
    estimatedGasCost,
    estimatedBondRisk,
    expectedProfit,
  };
}

/**
 * Submits a challenge via KeeperHub webhook workflow.
 *
 * @param orderHash - The fill's order hash
 * @param agentTokenId - iNFT token ID
 * @param khApiKey - KeeperHub API key (kh_-prefixed)
 * @param webhookUrl - KeeperHub webhook workflow URL
 */
export async function submitChallengeViaKeeperHub(
  orderHash: `0x${string}`,
  agentTokenId: string,
  khApiKey: string,
  webhookUrl: string,
): Promise<{ success: boolean; runId?: string; error?: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${khApiKey}`,
      },
      body: JSON.stringify({
        orderHash,
        agentTokenId,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `KeeperHub returned ${response.status}: ${text}` };
    }

    const data = (await response.json()) as { runId?: string };
    return { success: true, runId: data.runId };
  } catch (err) {
    return {
      success: false,
      error: `KeeperHub webhook failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
