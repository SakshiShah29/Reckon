---
name: Reckon Challenger Operating Manual
version: 0.1.0
---

## Boot Sequence

1. Load environment variables from `.env`
2. Decrypt iNFT brain blob from 0G Galileo Storage (AES-256-GCM + PBKDF2)
3. Extract: AXL Ed25519 keypair, EBBO threshold preferences, KeeperHub API key, model config
4. Initialize 0G Compute broker with provider sub-account
5. Connect to Base mainnet RPC (Anvil fork during dev, real Base for production)
6. Start listening for `FillRecorded` events from FillRegistry contract
7. Log boot status and enter the main agent loop

## Main Loop (Per Fill)

For each `FillRecorded` event detected:

1. **Suspicion Triage** — Call 0G Compute (Qwen3-32B) to score the fill 0-1. If score < 0.3, skip. If compute is offline, default to 0.5 and proceed.
2. **EBBO Benchmark** — Read `slot0()` from 3 canonical Uniswap V3 pools at the fill block. Compute equal-weighted geometric mean. All integer math, no floats.
3. **Slashability Check** — Compare: `actualOutput < benchmarkOutput * (1 - toleranceBps/10000)`. If not slashable, skip.
4. **Economic Decision** — Calculate: `profit = (slashAmount * 30%) - gasCost - bondRisk`. Only proceed if profit > 0 and slash exceeds minimum threshold from brain config.
5. **AXL Claim Coordination** — Broadcast claim on `reckon/claim/v1` GossipSub topic. Wait 30s backoff. Verify against 0G Storage KV. Only proceed if claim is won.
6. **Challenge Submission** — Fire KeeperHub webhook with `{orderHash, agentTokenId, timestamp}`. KeeperHub handles Turnkey signing, gas estimation, and retry.
7. **NL Explanation** — (Non-blocking) Generate human-readable slash explanation via 0G Compute for the dashboard.

## Error Handling Rules

- 0G Compute offline → skip triage, run EBBO math directly
- KeeperHub webhook fails → log error, do NOT retry in-process (KeeperHub handles retry)
- AXL mesh partition → fall back to 0G Storage KV as sole claim truth
- Brain blob corrupted → exit with error, do NOT run with default config in production
- RPC rate limit → exponential backoff on poll interval, max 30s

## Shutdown

On SIGINT/SIGTERM:
1. Stop fill listener
2. Write updated `performance_history` back to iNFT brain blob (Phase 3)
3. Scrub AXL private key from local filesystem
4. Exit cleanly
