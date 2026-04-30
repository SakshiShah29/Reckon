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

const ESTIMATED_CHALLENGE_GAS = 280_000n;
const CONSERVATIVE_GAS_PRICE = 100_000_000n; // 0.1 gwei in wei

export function decideChallenge(
  fill: FillRecord,
  shortfall: bigint,
  solverBondAmount: bigint,
  brain: BrainBlob,
): ChallengeDecision {
  const estimatedSlashAmount =
    shortfall < solverBondAmount ? shortfall : solverBondAmount;

  const challengerBond =
    (solverBondAmount * BigInt(CHALLENGER_BOND_PCT)) / 100n;

  const gasCostWei = ESTIMATED_CHALLENGE_GAS * CONSERVATIVE_GAS_PRICE;
  const estimatedGasCost = (gasCostWei * 3000n * 1_000_000n) / (10n ** 18n);

  // 5% failure risk on challenges we compute as slashable
  const estimatedBondRisk = challengerBond / 20n;

  // 30% of slash is our share
  const ourShare = (estimatedSlashAmount * 3000n) / 10000n;
  const expectedProfit = ourShare - estimatedGasCost - estimatedBondRisk;

  const minSlash = BigInt(brain.ebbo_threshold_prefs.minSlash);

  const maxBondValue =
    (solverBondAmount * BigInt(brain.ebbo_threshold_prefs.maxBondPct)) / 100n;
  const bondWithinLimit = challengerBond <= maxBondValue;

  const forceChallenge = process.env["FORCE_CHALLENGE"] === "true";

  const shouldChallenge =
    forceChallenge ||
    (estimatedSlashAmount >= minSlash &&
    expectedProfit > 0n &&
    bondWithinLimit);

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
