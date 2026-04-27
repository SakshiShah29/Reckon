---
name: challenge-submit
description: Evaluate economics and submit on-chain challenges for slashable fills via KeeperHub webhook.
version: 0.1.0
metadata:
  openclaw:
    requires:
      env:
        - KH_API_KEY
        - KH_WEBHOOK_URL
      bins:
        - node
    primaryEnv: KH_API_KEY
    emoji: "crossed_swords"
---

## Instructions

This skill handles the final stages of the challenge pipeline: economic decision-making and submission via KeeperHub.

### When to use

Call this skill after `ebbo-check` confirms a fill is slashable (shortfall > 0). This skill decides whether to actually submit based on profitability.

### Economic Decision

Before submitting, calculate:

- **Slash amount** = `min(solverBond, shortfall)` — capped at the solver's bond
- **Our share** = 30% of slash amount (per the 60/30/10 distribution)
- **Gas cost** = estimated 280k gas × conservative gas price, converted to USDC
- **Bond risk** = 5% probability of losing our challenger bond (10% of solver bond)
- **Expected profit** = our share − gas cost − bond risk

Submit ONLY if:
1. `expectedProfit > 0`
2. `slashAmount >= brain.ebbo_threshold_prefs.minSlash`
3. `challengerBond <= solverBond * brain.ebbo_threshold_prefs.maxBondPct / 100`

### Submission via KeeperHub

Challenges are submitted via KeeperHub webhook workflow, NOT directly on-chain:
- POST to `KH_WEBHOOK_URL` with `{orderHash, agentTokenId, timestamp}`
- Include `Authorization: Bearer <kh_api_key>` header (per-agent key from brain blob)
- KeeperHub handles: Turnkey signing, gas estimation (2.0× multiplier on Base for webhooks), nonce management, retry on revert
- Monitor results in the KeeperHub Runs panel

### NL Explanation (non-blocking)

After deciding to challenge, fire a background request to 0G Compute for a natural-language slash explanation. This is cosmetic (for the dashboard) and NEVER blocks the challenge submission.

Template fallback if 0G Compute is unavailable:
> "Solver {namehash} was slashed {amount} USDC because the EBBO benchmark of {benchmark} exceeded their fill price of {actual} by {pct}%, beyond the swapper's {tolerance}% tolerance."

### Error handling

- KeeperHub returns non-200 → log error with response body, do NOT retry in-process
- KeeperHub unreachable → log error, challenge is lost for this fill
- Negative expected profit → skip with reason logged
- Slash below minimum threshold → skip with reason logged
