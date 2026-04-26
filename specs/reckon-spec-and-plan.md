# Reckon: A Cryptoeconomic Validation Layer for DeFi Solvers

**Spec version:** 0.2 — named, pre-build, technical due-diligence pass complete
**Team:** 2 builders, 4-week ETHGlobal online format (or 72h in-person, see scoping note at end)

---

## Naming and branding

**Project name:** **Reckon**

The name carries two meanings — *to calculate* and *to settle accounts / pass judgment* — and both are exactly what the protocol does. Reckon computes a canonical EBBO benchmark (the calculation), then enforces solver accountability against it (the settlement). The dual meaning is doing real work, which is rare in a one-word name.

| Field | Value |
|---|---|
| **Name** | Reckon |
| **Subtitle** | Cryptoeconomic validation for DeFi solvers |
| **Tagline** | We settle solver fills by math, not by vote. |
| **One-line pitch** | Reckon makes every DeFi solver fill cryptographically challengeable, with automatic slashing on objective EBBO violations — no DAO vote required. |
| **Domain (preferred)** | `reckon.fi` — fallback `reckon.xyz` |
| **GitHub org** | `github.com/reckon-protocol` |
| **npm scope** | `@reckon-protocol` |
| **Twitter / X** | `@reckonproto` (or `@reckon_fi`) |
| **Demo subdomain** | `app.reckon.fi` (mainnet dashboard), `testnet.reckon.fi` (Sepolia) |

**Pitch lines that write themselves:**
- "Solvers get reckoned with."
- "Day of reckoning for bad fills."
- "We reckon every fill."
- "Reckoned by math, settled on-chain."

**Verify before committing** (Phase 0, Day 1): availability of `reckon.fi` / `reckon.xyz`, `@reckonproto` on X, `reckon-protocol` on GitHub, and npm scope. If `reckon.fi` is taken, fallback order: `reckon.xyz` → `reckonprotocol.com` → `getreckon.xyz`.

**Backup names** (if Reckon is unavailable or the team dislikes it after sleeping on it): **Fillproof** (most self-explanatory, "proof for every fill") or **Marker** (DeFi-insider register, double-meaning of benchmark + collecting on a debt). Don't waste cycles re-litigating the name — pick within 24 hours.

---

## What changed after technical cross-check

I cross-checked five technical claims from the original idea pitch. Three held up; two needed redesign. Reading this section first is worth your time — it's where the spec actually got more honest.

### Claims that held up
1. **ERC-8004 Validation Registry exists, is mainnet-deployed, but its incentives/staking/slashing layer is explicitly out-of-scope of the standard.** The spec on `github.com/erc-8004/erc-8004-contracts` says the validation portion is "still under active update." Mainnet addresses confirmed: IdentityRegistry `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, ReputationRegistry `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`. **Our economic layer plugs into this cleanly.**
2. **UniswapX has a clean integration point: the `additionalValidationContract` field in `OrderInfo`.** A custom validator is called automatically on fill. We don't need to fork UniswapX or run our own reactor — we deploy a validation contract, swappers reference it, the existing reactor calls it. This collapses 2 weeks of work.
3. **KeeperHub workflows are real and MCP-native.** JSON node/edge graphs with cron/event triggers, Turnkey-secured signing, x402 billing per execution. Confirmed via their MCP server and live workflow examples.

### Claims that did not survive scrutiny — and how the design changed

**Claim 1 (broken):** "Challenger re-executes the original intent against the exact state root at the original fill block." False. **Flashblocks are preconfirmations, not state proofs.** Cheap historical state access on Unichain doesn't exist. Reading historical storage requires either expensive MerkleProof verification (~200k+ gas per slot) or full optimistic dispute games (multi-week windows). Neither is hackathon-friendly.

**Fix:** switched from "re-execute" to **EBBO-style oracle benchmark** (Ethereum Best Bid and Offer — CowSwap's term). The challenger doesn't replay anything. They prove that **at the fill block, a canonical benchmark price was better than the solver's fill by more than X bps**. Benchmark = TWAP-resistant geometric mean across 3+ deep v3/v4 pools, computed via on-chain reads at the fill block (cheap, single-tx, ~50k gas). This is cryptographically clean, gas-cheap, and adversarially robust against any single-pool manipulation.

**Claim 2 (overstated):** "First crypto-economic validation for DeFi solvers." False — **CowSwap already has solver slashing**, and **UniswapX cross-chain has optimistic challenge bonds**. Both are partial precedents.

**Fix:** the precise gap is **objective, automated, per-fill challenges with on-chain settlement**. CowSwap's slashing is *DAO-discretionary* (humans vote, hours-to-days delay). UniswapX cross-chain only handles cross-chain fills with bridge-confirmation timing. **No one ships objective same-chain post-fill challenges with automatic slashing**. That's still novel and defensible. We restate the contribution accordingly — "first objective EBBO enforcement" rather than "first crypto-economic validation."

**Claim 3 (refined):** I claimed solver fill quality was directly comparable to LP execution quality. Half right. The user's curated-LP background gives strong intuition for **how prices move and how informed flow is detected**, which translates to **designing the EBBO benchmark**. It does not give intuition for solver bidding behavior or auction-game theory. We allocate explicit time to game-theory review.

### What this means for the spec

The mechanism is now simpler, cheaper, and tighter:
- No re-execution → no state proofs → no fraud-proof games → no multi-week dispute windows
- Benchmark is a multi-pool geometric mean computed on-chain → ~50-80k gas to verify
- Challenge window is 30 minutes, not 1 hour, because nothing depends on dispute timing
- The whole system fits in ~5 contracts and is shippable in 4 weeks

---

## Project: Reckon

### Tagline
**Objective EBBO enforcement for DeFi solvers, with bonded reputation.**

### Research-paper abstract
> We present Reckon, the first objective post-fill validation mechanism for DeFi solvers. Solvers post bonds proportional to their ERC-8004 reputation; any party can challenge a fill by submitting evidence that a canonical multi-pool benchmark exceeded the solver's outcome by a configurable threshold; slashing executes automatically without DAO discretion. We show this converts solver behavior from "trust the auction" to "trust the math."

### What it is, in one paragraph
Reckon is a UniswapX-compatible validation contract plus an ERC-8004 economic-layer extension that makes solver execution quality cryptographically challengeable. Swappers reference our `ReckonValidator` in their order. Solvers post bonded collateral scaled by their on-chain reputation. After a fill, anyone has 30 minutes to challenge by proving — through a single read of 3+ canonical Uniswap pools at the fill block — that the EBBO benchmark beat the solver's output by more than the swapper's specified tolerance. If the challenge succeeds, slashing is automatic: a fraction goes to the swapper as restitution, a fraction to the challenger as bounty, a fraction to the protocol. Reputation updates flow back to ERC-8004. Challenger agents (run by us as reference implementations + by anyone else) operate continuously over Gensyn AXL, paying KeeperHub workflows in x402 USDC for execution.

---

## L1 Specification

### Functional requirements

**FR-1: Solver registration and bonding**
- A solver registers as an ERC-8004 agent (Identity Registry) and bonds USDC into Reckon's `SolverBondVault`
- Required bond is dynamic: `requiredBond = baseBond * decay(reputation_score)` where higher reputation = lower required bond. Concretely: baseBond starts at 1000 USDC, decays linearly to 100 USDC at reputation 1.0
- Bond is locked while challenge windows are open against any of solver's recent fills

**FR-2: Order tagging**
- A swapper creating a UniswapX order can specify our deployed `ReckonValidator` address as the order's `additionalValidationContract` and encode their EBBO tolerance in `validationData`
- This is a 1-line change to the swap UI — no UniswapX fork needed

**FR-3: Fill recording**
- When the UniswapX reactor calls `ReckonValidator.validate(filler, resolvedOrder)`, we record a `FillRecord{orderHash, filler, fillBlock, inputAmount, outputAmount, swapper, eboTolerance, challengeDeadline}` in our own `FillRegistry` contract
- We do NOT block the fill from completing — validation always returns successfully. The challenge happens later
- We emit a `FillRecorded` event indexed by filler, swapper, and orderHash

**FR-4: Benchmark computation**
- `EBBOOracle.computeBenchmark(tokenIn, tokenOut, fillBlock)` reads the spot price from a hardcoded list of 3 canonical pools per pair (e.g., for USDC/WETH: Uniswap v4 0.05%, v3 0.05%, v3 0.30%) and returns the geometric mean weighted by per-pool TVL
- Reads are at `fillBlock` using current state (challenges submitted within ~150 blocks have negligible state drift on Unichain at 1s blocks)
- The pool list is upgradeable by a multisig, but only via timelock to prevent live attacks

**FR-5: Challenge mechanism**
- Within `challengeWindow` blocks of fill (default 1800 blocks ≈ 30 min on Unichain), any address can call `Challenger.submit(orderHash, challengerBond, beneficiary)`
- Challenger posts USDC bond equal to 10% of solver's bond (skin in the game)
- Contract immediately computes `expectedOutput = EBBOOracle.computeBenchmark(...) * (1 - eboTolerance)`
- If `actualOutput < expectedOutput`: challenge succeeds. If `actualOutput >= expectedOutput`: challenge fails and challenger loses bond

**FR-6: Slashing and payouts**
- On successful challenge, slash amount = `min(solverBond, expectedOutput - actualOutput)` (capped at bond, never more than the gap)
- Distribution: 60% to swapper as restitution, 30% to challenger, 10% to protocol treasury
- Challenger bond is returned in full
- Solver's ERC-8004 reputation is decreased via `ReputationRegistry.giveFeedback(...)` with our protocol-signed authorization

**FR-7: Reputation feedback**
- Successful clean fills (no challenge submitted, or all challenges failed) within a 7-day rolling window automatically increment solver reputation
- Reputation update batched once per day via KeeperHub workflow paid in x402 USDC
- Reputation aggregation function lives in `ReputationAggregator` (separate contract, can be upgraded without touching validator)

**FR-8: Challenger agent reference implementation**
- An OpenClaw-based agent that subscribes to `FillRecorded` events, computes EBBO benchmark off-chain (via 0G Compute for parallel multi-pool reads), and auto-submits challenges when expected slash > expected gas + bond risk
- Agent communicates with peer agents over Gensyn AXL to deduplicate challenge attempts (only one challenger needed per slashable fill — no need to gas-war)
- Agent uses KeeperHub workflow for actual challenge submission tx (gas optimization, retry, audit log)

### Non-functional requirements

**NFR-1: Gas budget**
- Validator's `validate()` call: ≤ 30k gas (must not slow down fills)
- Challenge submission: ≤ 250k gas (3-pool benchmark reads + slashing logic)
- Reputation update batched: amortized < 50k gas per agent per update

**NFR-2: Adversarial robustness**
- No single Uniswap pool can move the benchmark by more than `1 / sqrt(N)` where N = number of canonical pools (geometric mean weighting bounds influence)
- Challenger collusion mitigated by AXL deduplication + first-valid-challenge-wins
- Solver self-challenge (theatrics) prevented by requiring challenger ≠ filler at contract level
- Time-based attacks (manipulate pool right before challenge submission) mitigated by reading state at fillBlock, not challengeBlock

**NFR-3: Failure modes documented**
- If EBBO oracle pool list is wrong/manipulated: documented multisig timelock recovery path
- If challenger bond depletes before slashing completes: revert, challenger loses bond
- If solver's bond is insufficient to cover full restitution: pay what's available, log shortfall, decrement reputation by larger amount

**NFR-4: Observability**
- Every fill, challenge, slash, and reputation update emits an indexed event
- Subgraph deployed for indexing (use the public ERC-8004 subgraph as base)
- Public dashboard showing per-solver track record

### Contracts and architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         External                                │
│  UniswapX Reactor ──────────► ReckonValidator                   │
│  (existing, unchanged)        (NEW: our additionalValidation)   │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼ records fill
┌─────────────────────────────────────────────────────────────────┐
│                    FillRegistry (NEW)                           │
│  - mapping(orderHash => FillRecord)                             │
│  - emits FillRecorded                                           │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼ challenged via
┌─────────────────────────────────────────────────────────────────┐
│                    Challenger (NEW)                             │
│  - submit(orderHash, bond, beneficiary)                         │
│  - calls EBBOOracle for benchmark                               │
│  - executes slashing on success                                 │
└────────────┬─────────────────┬─────────────────────┬────────────┘
             │                 │                     │
             ▼                 ▼                     ▼
    ┌──────────────┐  ┌─────────────────┐  ┌─────────────────────┐
    │ EBBOOracle   │  │ SolverBondVault │  │ ReputationAggregator│
    │ (NEW)        │  │ (NEW)           │  │ (NEW)               │
    │ - 3+ pools   │  │ - lock/release  │  │ - calls ERC-8004    │
    │ - geo mean   │  │ - slash         │  │   ReputationRegistry│
    └──────────────┘  └─────────────────┘  └──────────┬──────────┘
                                                      │
                                                      ▼
                                          ┌────────────────────┐
                                          │ ERC-8004           │
                                          │ ReputationRegistry │
                                          │ (existing, mainnet)│
                                          └────────────────────┘

Off-chain:
┌─────────────────────────────────────────────────────────────────┐
│ Challenger Agent Swarm (NEW, OpenClaw + 0G Compute)             │
│  - subscribes to FillRecorded                                   │
│  - computes EBBO benchmark via 0G Compute                       │
│  - coordinates over Gensyn AXL (dedup challenges)               │
│  - submits challenges via KeeperHub workflow (x402 paid)        │
└─────────────────────────────────────────────────────────────────┘
```

**Contract count:** 5 new Solidity contracts. ~1500-2000 lines total. Foundry tests target 95%+ coverage.

**Out of scope for hackathon:**
- Reputation aggregation function tuning beyond a simple decay model (publish as a research direction)
- Cross-chain challenges (UniswapX cross-chain has its own optimistic flow; we focus same-chain)
- Solver bond rebalancing UI (CLI only; web UI nice-to-have)
- Real solver onboarding (we run our own demo solver + 2 challenger agents)

---

## Phase-wise plan

Two builders. Online format = 4 calendar weeks. The phases below assume ~25 hr/week each = ~200 builder-hours total. If your team has more bandwidth, extend Phase 5 with the bonus items listed at the end.

Roles:
- **Builder A** = "Contracts." Solidity, Foundry, contract deployments, on-chain integrations.
- **Builder B** = "Off-chain." OpenClaw agent, 0G Compute integration, AXL networking, KeeperHub workflow, frontend, indexer.

These are not rigid — both should review each other's work. But ownership is clear.

### Phase 0 — Setup (Day 1, both builders, ~6 hours)

**Both:**
- Pin a single shared notion/repo with: spec (this doc), open questions, daily standup notes
- Decide chain: **Unichain Sepolia for development, Base Sepolia as fallback** (Base if anything blocks on Unichain). Reasoning: UniswapX is mainnet on Ethereum and Arbitrum; for testnet we deploy our own local-flavor reactor + permit2 fixture. Confirm with Uniswap docs before committing
- Decide Solidity version: 0.8.26 (matches UniswapX, v4)
- Run `forge init`, set up CI (GH Actions, lint + test on every push)
- Confirm KeeperHub testnet account, x402 facilitator config, 0G Newton testnet RPC, Gensyn AXL local-mesh test
- Both deploy a hello-world contract to Unichain Sepolia to validate environment

**Risk to flush early:**
- UniswapX testnet availability on Unichain. If UniswapX team has not deployed on Unichain testnet (likely as of April 2026), we deploy a fork ourselves using the audited contracts from `github.com/Uniswap/UniswapX`. Confirm in Phase 0 day 1 by reading their deployments doc; if no Unichain testnet, allocate 4 hours to deploy our own.

### Phase 1 — Core contracts + benchmark (Week 1, both builders)

**Builder A (contracts, ~30 hours):**

Day 2-3: Write `ReckonValidator.sol` implementing UniswapX's `IValidationCallback` interface. The `validate(filler, resolvedOrder)` function:
- Decodes `resolvedOrder.info.additionalValidationData` to extract `eboTolerance` (uint16, bps)
- Calls `FillRegistry.recordFill(orderHash, filler, swapper, inputAmount, outputAmount, eboTolerance, block.number, block.timestamp + 30 min)`
- Returns successfully (does not block fill)

Day 3-4: Write `FillRegistry.sol`:
- Storage: `mapping(bytes32 orderHash => FillRecord)`
- `recordFill(...)` — only callable by Validator
- `getFillRecord(orderHash)` — view
- Emits `FillRecorded(orderHash, filler, swapper, fillBlock)` indexed
- Emits `FillChallenged(orderHash, challenger, succeeded)` later

Day 5-6: Write `EBBOOracle.sol`:
- Hardcoded canonical pool list per token pair (testnet: 2-3 pools)
- `computeBenchmark(tokenIn, tokenOut, atBlock)` — reads each pool's spot price at `atBlock` via direct slot reads, computes TVL-weighted geometric mean
- Use OpenZeppelin's `Math.sqrt` + log/exp tricks for geometric mean in fixed point (PRB-Math is overkill here, custom assembly is fine for hackathon)
- Returns price in `1e18` precision

Day 7: Write `SolverBondVault.sol`:
- `deposit(amount)`, `withdraw(amount)` (only after challenge windows clear)
- `lockBond(solver, amount)` — only Challenger can call
- `slash(solver, amount, beneficiary)` — only Challenger can call
- Tracks per-solver: `totalBond`, `lockedBond`, `lastFillBlock`

Foundry test targets for Phase 1: ≥ 80% line coverage on each contract, integration test that simulates a fill + benchmark read.

**Builder B (off-chain bootstrap, ~30 hours):**

Day 2-3: Set up OpenClaw agent project. Repo skeleton: `agent/`, `keeper-workflow/`, `dashboard/`, `subgraph/`. Use TypeScript + viem for on-chain reads, ethers v6 for signer, Bun for runtime (fast, hackathon-friendly).

Day 4-5: Write the **EBBO computation off-chain** (mirrors A's on-chain version). Same algorithm, run via 0G Compute for parallel pool reads. Wire `@0glabs/0g-serving-broker` to call GLM-5-FP8 with a structured-output prompt: "Given these 3 pool prices and TVLs, compute the TVL-weighted geometric mean." This is overkill — simple math doesn't need an LLM — but **0G Compute integration is a sponsor requirement**. For real production we'd just compute it locally; for the hackathon, doing the heavier computation via 0G is the integration story. Document this honestly in the README.

Day 5-6: Wire viem to subscribe to `FillRecorded` events on Unichain Sepolia (or local anvil for now). When event fires, off-chain agent: fetch fill data, compute EBBO, decide whether to challenge.

Day 6-7: KeeperHub workflow proof-of-concept. Use their MCP server to create a workflow: "Trigger on webhook, call `Challenger.submit(orderHash, bond, beneficiary)` with retry logic." Confirm Turnkey signing works. Confirm x402 billing on workflow execution.

End of Week 1 milestone: locally, A's contracts deploy and pass forge tests. B's agent listens to a mock event from a local anvil and would-decide-to-challenge if benchmark deviation > tolerance.

### Phase 2 — Challenge mechanism + slashing + ERC-8004 integration (Week 2)

**Builder A (~30 hours):**

Day 8-9: Write `Challenger.sol`:
- `submit(orderHash, challengerBondAmount, beneficiary)` — main entrypoint
- Verify: `block.number <= fillRecord.challengeDeadline`, `msg.sender != fillRecord.filler` (no self-challenge), `challengerBondAmount >= minBond`
- Pull challenger USDC bond into contract via `permit2` or `transferFrom`
- Call `EBBOOracle.computeBenchmark(...)` at `fillRecord.fillBlock`. Note: reading historical state for "fillBlock" is impossible cheaply — so we read **current** spot at challenge time. We compensate by tightening the challenge window to 30 minutes and arguing the price drift is negligible. **Document this explicitly as a known limitation; in production, an indexer would snapshot at fill time.** This is the right call for hackathon scope
- Compute `expectedOutput = benchmark * inputAmount * (10000 - eboTolerance) / 10000`
- If `fillRecord.outputAmount < expectedOutput`: succeed → slash flow. Else: fail → challenger loses bond
- Slash flow: distribute 60/30/10, return challenger bond, decrement reputation
- Emit indexed events for everything

Day 10: Write `ReputationAggregator.sol`:
- `recordSuccessfulFill(filler)` — called by Challenger when slash fails (= clean fill)
- `recordFailedFill(filler)` — called when slash succeeds
- Batched: stores in mapping, settles to ERC-8004 ReputationRegistry once per day via KeeperHub
- `flushReputation()` — anyone can call, pays a small bounty (1 USDC) to incentivize liveness

Day 11-12: Integration with **mainnet ERC-8004 ReputationRegistry**. The registry is already deployed at `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`. We need:
- Each solver to register an ERC-8004 agent ID first (via `IdentityRegistry.newAgent(...)` with our protocol's domain)
- Our protocol holds a "Reckon Authorizer" agent ID, which co-signs feedback
- Use `giveFeedback(agentId, score, tag, fileHash)` per the standard

Verify: read the actual ABI from the deployed contract, don't guess. The `awesome-erc8004` repo has live integration examples — copy patterns from `UFX Agentic Commerce` (Base Mainnet, 208 tests, MIT-licensed).

Day 13-14: End-to-end Foundry test. Mock UniswapX reactor → ReckonValidator → FillRegistry → Challenger → SolverBondVault slash → ReputationAggregator → mock ERC-8004. Hit 90%+ coverage. Use `forge coverage --report lcov`.

**Builder B (~30 hours):**

Day 8-9: Complete the OpenClaw challenger agent loop:
- Listen for `FillRecorded`
- Compute EBBO via 0G Compute (or local fallback if 0G is rate-limited)
- Compare to fill outcome
- Decide: challenge if `slashable_amount > gas_cost + bond_risk_adjusted`
- Call KeeperHub workflow to submit challenge

Day 10-11: Set up a 2-node AXL mesh for challenger deduplication. Each node has independent eyes; first one to detect a slashable fill broadcasts an "I'm taking this" message over A2A. Other nodes back off for 30 seconds to let the first one challenge. If first one fails to submit, second tries. This is **the legitimate Gensyn integration** — without it, multiple challenger agents would gas-war for the same slash.

Verify AXL mesh works across two physically separate VPS nodes (Hetzner + Fly.io). Document the AXL bootstrap process — Gensyn judges will check.

Day 12-13: Subgraph. Index `FillRecorded`, `FillChallenged`, `SolverSlashed`, `ReputationUpdated`. Deploy on The Graph hosted service or a local Goldsky.

Day 14: Initial dashboard skeleton (Next.js + wagmi). Solver leaderboard, fill feed, challenge feed. Aesthetic polish later.

End of Week 2 milestone: full happy path works end-to-end on testnet. A swap with bad price gets challenged automatically by the agent, slashed, swapper gets restitution, solver's reputation drops on-chain ERC-8004.

### Phase 3 — Adversarial testing + game-theory review (Week 3)

This phase is where we **earn the "technically strong" claim**. Most hackathon teams skip it. We don't.

**Builder A (~25 hours):**

Day 15-16: Adversarial Foundry tests. Write fuzz tests for:
- Challenger submitting with insufficient bond
- Solver self-challenging (must revert)
- Challenge after deadline (must revert)
- Multiple simultaneous challenges on same order (first wins, others refunded)
- EBBO oracle returning manipulated value (verify geometric mean dampens)
- Slashing edge cases: solver bond = 0, expected output > input (price inverted), fillRecord doesn't exist

Day 17: Write a **mechanism design analysis** doc (~1500 words). Cover:
- Why second-price slashing isn't needed here (no auction, no need)
- Why the 30-minute window balances challenge gas cost vs price drift
- Why challenger gets 30% (had to be enough to cover gas + opportunity cost; chose by analyzing average gas + 1.5x safety margin)
- Why bond decay with reputation is incentive-compatible (high-rep solvers face less bond friction, but lose more reputation when slashed → still aligned)
- Open question: how to prevent "lazy challenger" attack where a bad challenger only submits clearly-winning challenges and never explores. Your defense: anyone can become a challenger, so an adversary's laziness creates opportunity for honest challengers.

Day 18-19: **Run a real attack simulation.** Set up two demo solvers on testnet, one honest (uses good price), one griefer (deliberately fills at 1% worse than benchmark). Run challenger agent for 24 hours. Measure: how many of the bad fills get caught? What's the average time-to-challenge? Document findings — these numbers go in the demo video.

Day 20-21: Polish contracts. Add NatSpec to every public function. Run `slither` and `mythril`, fix any non-trivial findings. **Do not skip this** — judges sometimes run automated security tools on submissions.

**Builder B (~25 hours):**

Day 15-16: Stress test the challenger agent. What if 0G Compute is down? What if AXL nodes can't reach each other? What if KeeperHub workflow fails? Write fallback logic for each case.

Day 17-18: Write a **second** reference challenger agent in a different framework (e.g., Eliza or pure TypeScript with no agent framework) to demonstrate the protocol is framework-agnostic. Open-source both. This signals to judges: "we built infrastructure, not a single product."

Day 19-20: Publish `@reckon-protocol/sdk` to npm — a TypeScript SDK that lets anyone build a challenger:
- `reckon.subscribeToFills(callback)`
- `reckon.computeBenchmark(orderHash)`
- `reckon.submitChallenge(orderHash, beneficiary)`
- ~300 lines, well-typed, README with quickstart

Day 21: Dashboard polish. Add real-time feed, charts of solver reputation over time, challenger leaderboard. Use `recharts` (already in our skill stack).

End of Week 3 milestone: protocol is adversarially tested, two reference agent implementations run, SDK is published, dashboard is polished. Could ship to mainnet next week if we wanted.

### Phase 4 — Mainnet deploy + demo + polish (Week 4)

**Builder A (~20 hours):**

Day 22-23: Deploy contracts to **Base mainnet** (not Unichain — Base has UniswapX live and a richer pool ecosystem for the EBBO oracle). Verify on Etherscan. Update SDK with mainnet addresses.

Day 24-25: Recruit at least one external solver to register and post bond — even with $100 USDC. This is the "real external user in the demo" point I made in the earlier conversation; without it, the submission is theoretical. Reach out to: Bunni team, Arrakis, smaller MEV searchers in the CowSwap discord, anyone running a UniswapX filler. Even one external solver participating in the demo is enormous credibility.

Day 26-27: Mainnet smoke test. Run a real swap through ReckonValidator on Base. Have your own challenger agent watch and not challenge (because the fill is good). Deliberately set up a low-quality fill to demonstrate slashing — pay the gas yourself, slash yourself, restitution yourself. This is a **legitimate demo trick**: the mechanism works regardless of who the actors are.

**Builder B (~20 hours):**

Day 22-23: Demo video script + recording. Strict 2-minute target. Show:
- 0:00-0:20: The problem (CowSwap solver hack screenshot, "this happens because slashing is discretionary")
- 0:20-0:50: Reckon architecture (animation of the diagram above)
- 0:50-1:20: Live mainnet demo — bad fill happens, challenger agent detects, challenge submitted, slash executes, restitution arrives, reputation drops
- 1:20-1:40: SDK quickstart (3 lines of code → "you're a challenger now")
- 1:40-2:00: What's next (cross-chain, reputation curves, real solvers)

Day 24-25: Write final README. Cover: motivation, architecture, contract addresses, security considerations (this matters), known limitations (this matters more), how to challenge, how to register as a solver. Include FAQ pre-empting judge questions: "Why not re-execute?" "Why 30-minute window?" "Why not DAO discretion?"

Day 26-27: KeeperHub feedback file. Write an honest, specific, actionable feedback document about the KeeperHub experience. Bugs found, friction points, feature requests. **This is its own $250 prize** and is high-EV at low effort.

Day 28: Final submission. ETHGlobal portal, all GitHub repos public, demo video uploaded, contract addresses verified, dashboard live.

End of Week 4 milestone: shipped, demoable, mainnet, with at least one external participant. Submission window: complete.

### Bonus items if you have spare bandwidth

In rough priority order:
1. **Add a Hookswarm-lite tie-in:** make the EBBO oracle itself an iNFT (ERC-7857) so anyone can fork the oracle config and the new oracle inherits a track record. This is a clean 0G Track B story without scope creep.
2. **Cross-chain challenges:** extend to challenge UniswapX cross-chain fills using existing bridge attestation. Hard but high-impact.
3. **Insurance fund layer:** if a solver's bond is insufficient for full restitution, an insurance pool covers the gap (funded by protocol fees). One additional contract.
4. **Visualizer of EBBO benchmark vs fill price** showing live data in the dashboard. Memorable for judges.

### Scoping note for in-person 72-hour format

If this is in-person 72h instead of online 4 weeks, cut as follows:
- Keep Phases 0, 1, 2 in full (~36 hours)
- Skip Phase 3's mechanism-design doc (do it as 5 bullet points in the README instead, ~3 hours)
- Skip the second reference agent
- Skip mainnet deploy → testnet only with a clear "this is mainnet-ready, here's the deploy script"
- Total: ~50 hours per builder = aggressive but feasible

The cuts hurt the "technically strong" claim less than you'd think — judges in 72h events explicitly understand the constraint and weight delivery over polish.

---

## Pre-build checklist (do before Phase 0)

- [ ] Confirm UniswapX is deployed on Unichain Sepolia. If not, allocate 4 hours in Phase 0 for our own deploy
- [ ] Confirm 0G Newton testnet has GLM-5-FP8 endpoint live and we have a funded provider account
- [ ] Confirm KeeperHub testnet account works and we can create workflows via MCP
- [ ] Confirm Gensyn AXL binary runs on both our VPS providers
- [ ] Read the entire UniswapX docs section on `additionalValidationContract` (this is load-bearing)
- [ ] Read ERC-8004 mainnet integration patterns from `awesome-erc8004` — pick 2 reference repos to study
- [ ] Read the Bunni v2 audit (TOB-BUNNI-11) to understand how multi-pool oracles get attacked. This informs your EBBO oracle hardcoded list

If any checkbox can't be confirmed in Day 1, raise the flag immediately and we re-scope.

---

## Risks I am still uncertain about

Honest list, ranked by severity.

**1. UniswapX testnet availability (HIGH severity, MEDIUM probability).** UniswapX is mainnet-Ethereum and Arbitrum; it may not be on Unichain or Base testnet in usable form. Mitigation: deploy our own UniswapX fork (audited contracts, ~4 hours). Doesn't change the spec, just adds Day-1 work.

**2. 0G Compute rate limits (MEDIUM severity, MEDIUM probability).** GLM-5-FP8 has documented rate limits (~30 req/min per provider). Our challenger agent could hit this if we have many concurrent fills. Mitigation: cache benchmark calculations per (tokenIn, tokenOut, fillBlock), fallback to local computation if rate-limited.

**3. ERC-8004 ReputationRegistry write authorization (MEDIUM severity, LOW probability).** The standard's `giveFeedback` requires authorization. We need to study the exact authorization flow — it might require pre-registration of our protocol as an authorized scorer. Mitigation: if it doesn't work cleanly, deploy our own ReputationAggregator that does the same job but uses ERC-8004 only for identity, not for scoring writes.

**4. Recruiting external solver (MEDIUM severity, HIGH probability).** Cold-emailing solver teams in 4 weeks is hard. Mitigation: have a backup plan where we run two of our own solvers (one honest, one griefer) and frame the demo as "we built the infrastructure, here's how it works in action."

**5. KeeperHub workflow gas pricing on Base mainnet (LOW severity, LOW probability).** Their public docs mention 30% gas savings vs baseline; we should verify on actual workflow execution before committing demo to mainnet. Mitigation: Base has very low gas costs anyway.

**6. AXL mesh stability over conference Wi-Fi (LOW severity, MEDIUM probability if in-person).** Already hit by past hackathon teams. Mitigation: nodes on public-IPv6-enabled VPS, never on local laptops at the venue.

---

## What this submission wins, realistically

Honest expected-value breakdown by sponsor:

- **ENS/ERC-8004 track ($5,000):** very high probability of placing 1st-3rd. Reckon is the cleanest validation-mechanism implementation for ERC-8004 anyone is shipping at this hackathon. ENS judges have explicitly identified this as a gap. Expected: $2,500-$5,000.
- **Uniswap ($5,000):** medium-high probability. UniswapX validator integration is novel; solver economics is a real Uniswap research direction. Expected: $1,500-$2,500.
- **0G Track B ($7,500):** medium probability. Without the iNFT-as-oracle bonus, our 0G integration is "compute used for benchmark calc," which is okay but not breathtaking. With the iNFT bonus: high probability of 1st-3rd. Expected: $1,500-$5,000.
- **0G Track A ($7,500):** medium probability. The OpenClaw challenger agent + SDK is framework-level work, but we'd be competing against teams shipping new agent runtimes. Expected: $500-$2,500.
- **Gensyn ($5,000):** medium probability. AXL is genuinely load-bearing in our challenger swarm (no decentralization theater), which judges will recognize. But our AXL usage is "use the tool well," not "extend AXL." Expected: $1,000-$2,500.
- **KeeperHub ($5,000 + $500 feedback):** high probability of placing in their integration track. Our KeeperHub usage covers both their focus areas (innovative use + agent framework integration via OpenClaw). Plus the feedback bounty is essentially free. Expected: $1,250-$2,750.
- **ETHGlobal Finalist pool:** independent of sponsors. Hard to predict but Reckon's sharpness and shippability put it in the running. Expected: $0-$5,000.

**Aggregate expected prize value:** $8,000-$25,000 with central tendency around $13,000-$15,000.

That assumes execution quality matches the spec. Most of the variance is on our side.
