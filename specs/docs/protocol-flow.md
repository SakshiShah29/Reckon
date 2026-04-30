# Reckon Protocol — End-to-End Flow

## Phase 0: Registration (one-time setup)

### Solvers

1. Solver visits Reckon dashboard, picks a label (e.g. `bunni`)
2. Signs a registration intent with their wallet
3. **Relayer** receives the intent, validates it, writes `bunni.solvers.reckon.eth` to MongoDB, and calls `SolverRegistry.register(namehash, solverAddress)` on Base
4. Solver calls `SolverBondVault.deposit(amount)` — USDC bond, sized by reputation (new solver = max bond, proven solver = lower bond)

### Challengers

1. Same flow but under `challengers.reckon.eth` via `ChallengerRegistry`
2. Builder B mints a `ChallengerNFT` (ERC-7857 iNFT) on 0G Galileo — the brain blob containing AXL Ed25519 keys, EBBO prefs, and KeeperHub API key is encrypted and uploaded to 0G Storage Log
3. Each of the 3 VPSes boots: orchestrator decrypts brain blob → starts AXL node → 3-node mesh connects

---

## Phase 1: A Swap Happens (UniswapX)

A swapper creates a UniswapX order on Base with:

```
additionalValidationContract = ReckonValidator
additionalValidationData = abi.encode(eboTolerance)  // e.g. 50 bps
```

A solver picks up the order and fills it through `PriorityOrderReactor`. The reactor calls `ReckonValidator.validate()` — a **view-only** check that just confirms the filler is registered in `SolverRegistry`. The reactor emits a `Fill` event.

**The validator records nothing. It is purely a gate.**

---

## Phase 2: Fill Recording

**>>> RELAYER enters <<<**

1. **Relayer** is subscribed to `Fill` events on `PriorityOrderReactor` (Base)
2. It sees the fill, extracts order details (filler, swapper, tokenIn, tokenOut, amounts, tolerance)
3. Looks up the filler's namehash via `SolverRegistry`
4. Calls `FillRegistry.recordFill(orderHash, filler, swapper, tokenIn, tokenOut, inputAmount, outputAmount, eboTolerance, outputsLength=1, fillBlock)` from its permissioned EOA
5. `FillRegistry` internally calls `SolverBondVault.lockOnFill(fillerNode)` — increments the solver's open-fill counter, preventing bond withdrawal
6. `FillRegistry` emits `FillRecorded(orderHash, fillerNamehash, swapper, fillBlock)`
7. The challenge window is now open: **30 minutes** (1800 Base blocks)

**>>> RELAYER also batches <<<**

8. Every 50 fills or 60s, relayer batches records → uploads to 0G Storage Log → calls `FillRegistry.anchorBatch(rootHash, ...)` on Base (the audit trail)

---

## Phase 3: Challenger Agent Decision Loop

All 3 agent nodes see the `FillRecorded` event (via their orchestrator subscribing to Base). Each orchestrator runs the SKILL.md 5-step loop:

### Step 1 — `triage.ts` (0G Compute, ~2-5s)

- Sends fill details to Qwen3-32B on 0G Compute
- Gets back a suspicion score 0→1
- If score < threshold → skip this fill, move to next event
- If 0G Compute is down → default to 0.5 (proceed cautiously)

### Step 2 — `ebbo.ts` (pure math, <100ms)

- Reads 3 canonical Uniswap v3 USDC/WETH pools on Base
- Computes equal-weighted geometric mean benchmark price
- Computes `expectedOutput = benchmark * inputAmount * (1 - eboTolerance)`
- If `actualOutput >= expectedOutput` → fill is fine, skip
- If `actualOutput < expectedOutput` → fill looks bad, proceed

### Step 3 — `coordinate.ts` (AXL + 0G KV, ~30s)

- Broadcasts a claim message over AXL GossipSub to the other 2 agents: "I'm taking orderHash X"
- Waits 30 seconds, polling AXL `/recv` every 200ms for competing claims
- If another agent claimed first (earlier `claimedAt`) → yield
- After 30s, verifies against 0G Storage KV (durable truth layer) — writes claim if clear
- Output: `{claimAcquired: true/false, claimedBy: "..."}`
- If claim not acquired → stop here, another agent handles it

### Step 4 — `decide.ts` (pure logic, <100ms)

- Cost-benefit analysis: expected slash amount vs gas cost vs challenger bond risk
- Go/no-go decision

### Step 5 — `submit.ts` (KeeperHub webhook, ~1-2s)

- Triggers the on-chain `Challenger.submit()` call via KeeperHub's Direct Execution API
- Passes: orderHash, challengerBond, beneficiary, agentTokenId, Permit2 signature

---

## Phase 4: On-Chain Challenge Resolution

`Challenger.submit()` runs on Base:

### Preflight checks

- Fill exists and isn't already slashed
- `block.number <= challengeDeadline` (still within 30-min window)
- Challenger is registered in `ChallengerRegistry`
- `challengerNode != fillerNamehash` (no self-challenge)
- `OwnerRegistry.ownerOf(agentTokenId) == msg.sender`

### Pulls challenger bond

Via Permit2 (minimum 10% of solver's bonded amount)

### Computes benchmark on-chain

- `EBBOOracle.computeBenchmark(tokenIn, tokenOut)` — reads same 3 v3 pools, same geomean math
- `expectedOutput = benchmark * inputAmount * (1 - eboTolerance)`

### Judgment — no DAO, no discretion, pure math

**If `actualOutput < expectedOutput` → CHALLENGE SUCCEEDS:**

- `slashAmount = min(solverBond, expectedOutput - actualOutput)`
- `SolverBondVault.slash(fillerNode, slashAmount, royaltyDistributor)` — USDC moves from vault to distributor
- `RoyaltyDistributor.distribute(slashAmount, agentTokenId, swapper)`:
  - **60%** → swapper (restitution)
  - **30%** → iNFT current owner (looked up via `OwnerRegistry`)
  - **10%** → protocol treasury
- Challenger bond returned to beneficiary
- `FillRegistry.markSlashed(orderHash)` — prevents double-slash
- Emits `ChallengeSucceeded(orderHash, fillerNamehash, challengerNode, slashAmount)`

**If `actualOutput >= expectedOutput` → CHALLENGE FAILS:**

- Challenger bond forfeited to protocol treasury
- Emits `ChallengeFailed(orderHash, fillerNamehash, challenger)`

---

## Phase 5: Aftermath

**>>> RELAYER re-enters <<<**

1. **Reputation update:** Relayer subscribes to `ChallengeSucceeded` / `ChallengeFailed` events. Writes deltas to MongoDB `reputation_updates`. A daily KeeperHub workflow triggers the relayer to call `SolverRegistry.setText(node, "reckon.reputation", newValue)` on Base — which affects the solver's future bond requirements via `SolverBondVault.requiredBond()`

2. **Bond unlock (if no challenge):** If the 30-min window passes with no challenge, the relayer calls `SolverBondVault.unlockOnFill(fillerNode)` — decrements the open-fill counter so the solver can withdraw bond again

3. **Owner attestation (ongoing):** If a `ChallengerNFT` transfers on 0G Galileo, the relayer sees the `Transfer` event and calls `OwnerRegistry.attestOwner(tokenId, newOwner)` on Base — so the next slash bounty goes to the new owner

---

## Relayer Role Summary

| Step | Relayer Role |
|---|---|
| Registration | Writes subnames to MongoDB + on-chain registries |
| Fill happens | Subscribes to `Fill` event, calls `FillRegistry.recordFill()` — **opens the challenge window** |
| Batch anchoring | Uploads fill batches to 0G Storage Log — **audit trail** |
| Challenge resolves | Subscribes to outcome events — **updates reputation** |
| Window expires | Calls `unlockOnFill()` — **frees solver bond** |
| iNFT transfers | Calls `attestOwner()` — **routes future bounties** |

The relayer doesn't make any judgment calls. It is a **trusted courier** — it observes events on one chain/system and writes the corresponding state on another. Every write it makes is either verifiable (0G Storage Log batches with Merkle proofs) or will be replaced by trustless bridges in production (LayerZero for owner attestation, permissionless fill proofs for recording).
