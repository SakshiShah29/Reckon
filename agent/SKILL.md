# Reckon Challenger Agent — SKILL.md

## Identity

This agent is a Reckon protocol challenger. It monitors UniswapX fills on Base, identifies EBBO violations, coordinates with peer agents to avoid double-challenges, and submits slashes via KeeperHub.

## Trigger

`FillRecorded` event from `FillRegistry` contract on Base.

## Pipeline

For each `FillRecorded` event, execute the following 5 primitives in order. If any step yields or fails, stop the pipeline for this fill.

### Step 1: triage.ts (0G Compute)

- **Input:** `FillRecord`
- **Output:** `{ score: number, model: string, rawResponse: string }`
- **Infra:** 0G Compute (Qwen3-32B via `@0glabs/0g-serving-broker`)
- **Threshold:** If `score < 0.3`, skip this fill.
- **Fallback:** If 0G Compute is offline, output `{ score: 0.5, reason: "provider_offline" }`. Never block the pipeline on Compute availability.

### Step 2: ebbo.ts (local math)

- **Input:** `FillRecord`, Base RPC URL
- **Output:** `{ benchmarkPrice: bigint, poolPrices: bigint[], blockNumber: bigint }`
- **Infra:** Base mainnet RPC (read-only, no 0G dependency)
- **Logic:** Read sqrtPriceX96 from 3 canonical Uniswap V3 pools, compute geometric mean, check if fill output is below benchmark minus tolerance.
- **Exit if:** Fill is not slashable.

### Step 3: coordinate.ts (Gensyn AXL + 0G Storage KV)

- **Input:** `orderHash`, `agentTokenId`, action (`check` then `acquire`)
- **Output:** `{ claimAcquired: boolean, claimedBy: string, reason: string }`
- **Infra:** AXL GossipSub (fast, ephemeral) + 0G Storage KV (slow, durable)
- **Flow:**
  1. `check` — read KV to see if another agent already claimed this fill.
  2. `acquire` — broadcast claim via AXL, wait 30s backoff, write to KV.
- **Exit if:** `claimAcquired === false` (another agent won the race).
- **Fallback:** If AXL is down, KV-only mode (slower but correct). If KV is down, fail closed (yield the claim).

### Step 4: decide.ts (local math)

- **Input:** `FillRecord`, shortfall amount, solver bond, brain blob prefs
- **Output:** `{ shouldChallenge: boolean, reason: string, expectedProfit: bigint }`
- **Infra:** None (pure computation)
- **Logic:** Challenge if `expectedProfit > 0` AND `slashAmount >= minSlash` AND `challengerBond <= maxBondPct * solverBond`.
- **Exit if:** `shouldChallenge === false`. Release the coordinate claim.

### Step 5: submit.ts (KeeperHub)

- **Input:** `orderHash`, `agentTokenId`, `kh_api_key`
- **Output:** `{ success: boolean, runId?: string }`
- **Infra:** KeeperHub webhook
- **Fallback:** Log the error; the fill goes unchallenged by this agent.

## Boot Sequence

1. Read iNFT `tokenURI` from ChallengerNFT on 0G Galileo.
2. Download brain blob from 0G Storage.
3. Verify Merkle root matches `tokenURI`.
4. Decrypt brain blob (AES-256-GCM + PBKDF2).
5. Extract AXL Ed25519 key, KeeperHub API key, model config, EBBO prefs.
6. Initialize 0G Compute broker (lazy, on first triage call).
7. Start `FillRecorded` event listener on Base.

## Shutdown

1. Stop fill listener.
2. Flush any pending state.
3. Process exits cleanly.

## Failure Rules

- **0G Compute down:** triage defaults to 0.5, pipeline continues.
- **AXL down:** coordinate runs in KV-only mode.
- **0G KV down:** coordinate fails closed (yields claim).
- **KeeperHub down:** log error, fill goes unchallenged.
- **Brain blob unreadable:** agent refuses to start (no headless mode in production).
