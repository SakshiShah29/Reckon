# Reckon: A Cryptoeconomic Validation Layer for DeFi Solvers

**Spec version:** 0.3 — bounty-aligned, ENS-as-identity, 0G iNFT focus
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
| **ENS namespace** | `reckon.eth` (with subnames at `solvers.reckon.eth` and `challengers.reckon.eth`) |
| **GitHub org** | `github.com/reckon-protocol` |
| **npm scope** | `@reckon-protocol` |
| **Twitter / X** | `@reckonproto` (or `@reckon_fi`) |
| **Demo subdomain** | `app.reckon.fi` (mainnet dashboard), `testnet.reckon.fi` (Sepolia) |

**Pitch lines that write themselves:**
- "Solvers get reckoned with."
- "Day of reckoning for bad fills."
- "We reckon every fill."
- "Reckoned by math, settled on-chain."

**Verify before committing** (Phase 0, Day 1): availability of `reckon.fi` / `reckon.xyz`, `@reckonproto` on X, `reckon-protocol` on GitHub, npm scope, AND `reckon.eth` on ENS mainnet (this is now load-bearing — see ENS section). If `reckon.eth` is taken, fallback ordering: `reckonprotocol.eth` → `getreckon.eth` → name change. If `reckon.fi` is taken, fallback order: `reckon.xyz` → `reckonprotocol.com` → `getreckon.xyz`.

**Backup names** (if Reckon is unavailable or the team dislikes it after sleeping on it): **Fillproof** (most self-explanatory, "proof for every fill") or **Marker** (DeFi-insider register, double-meaning of benchmark + collecting on a debt). Don't waste cycles re-litigating the name — pick within 24 hours.

---

## Bounty strategy

This spec targets **4 sponsor bounties**, with Uniswap explicitly de-prioritized as a sponsor while keeping the Uniswap stack (UniswapX, v3/v4 pools) as load-bearing infrastructure.

| Sponsor | Status | Targeted prize | Strategy |
|---|---|---|---|
| **ENS** | Primary | $5,000 (both prize tracks) | Solver/challenger identity via subnames + reputation in text records + CCIP-Read live resolver |
| **0G** | Primary | $7,500 (Track B only) | Challenger agents minted as iNFTs (ERC-7857) with persistent memory on 0G Storage and royalty splits to owners |
| **Gensyn** | Primary | $5,000 | AXL mesh for cryptographically-required challenger swarm deduplication across separate VPS nodes |
| **KeeperHub** | Primary | $5,000 + $500 (feedback) | Challenge submission and reputation flush as KeeperHub workflows + `@reckon-protocol/keeperhub-openclaw` connector |
| **Uniswap** | Stack only | $0 (not targeting) | UniswapX `additionalValidationContract` integration; v3/v4 pools as EBBO oracle inputs. No FEEDBACK.md, no API integration work. |
| **0G Track A** | Not targeting | $0 | Decided against splitting attention; depth on Track B beats shallow on both tracks |

**Aggregate target prize value:** $6,250-$20,500 (range), central tendency $11,000-$14,000, plus finalist pool consideration ($0-$5,000 independent).

---

## What this spec contributes to the field

The mechanism is now simpler, cheaper, and tighter than the ETHGlobal hackathon median:
- No re-execution → no state proofs → no fraud-proof games → no multi-week dispute windows
- Benchmark is a multi-pool geometric mean computed on-chain → ~50-80k gas to verify
- Challenge window is 30 minutes, balancing challenge gas cost vs price drift
- The whole system fits in ~6 contracts and is shippable in 4 weeks
- ENS subnames replace raw addresses for solver and challenger identity throughout
- Challenger agents are iNFTs — owned, transferable, with royalty splits to owners on every successful slash bounty

**Honest precedent check:**
- CowSwap has solver slashing, but it's *DAO-discretionary* (humans vote, hours-to-days delay)
- UniswapX cross-chain has optimistic challenge bonds, but only handles cross-chain fills with bridge timing
- ERC-8004 Validation Registry exists on mainnet but ships no concrete validation mechanism
- **No one ships objective same-chain post-fill challenges with automatic slashing tied to ENS-resolvable identity, with iNFT-owned challenger agents.** That's the gap.

---

## Project: Reckon

### Tagline
**Objective EBBO enforcement for DeFi solvers, with ENS-resolvable identity and iNFT-owned challenger agents.**

### Research-paper abstract
> We present Reckon, the first objective post-fill validation mechanism for DeFi solvers with ENS-native identity and tradeable challenger agents. Solvers register as ENS subnames under solvers.reckon.eth and post bonds proportional to their on-chain reputation; any party can challenge a fill by submitting evidence that a canonical multi-pool benchmark exceeded the solver's outcome by a configurable threshold; slashing executes automatically without DAO discretion. Challenger agents are minted as iNFTs (ERC-7857) with persistent memory on 0G Storage and royalty splits to current owners. We show this converts solver behavior from "trust the auction" to "trust the math," while making both the validators and the validated cryptographically discoverable.

### What it is, in one paragraph
Reckon is a UniswapX-compatible validation contract that makes solver execution quality cryptographically challengeable, with **ENS as the canonical identity layer** and **iNFTs as the ownership layer for challenger agents.** Swappers reference Reckon's `ReckonValidator` in their order. Solvers register subnames under `solvers.reckon.eth` and post bonded collateral scaled by reputation stored in their ENS text records. After a fill, anyone with a `challengers.reckon.eth` subname has 30 minutes to challenge by proving — through a single read of 3+ canonical Uniswap pools at the fill block — that the EBBO benchmark beat the solver's output by more than the swapper's specified tolerance. If the challenge succeeds, slashing is automatic: a fraction goes to the swapper as restitution, a fraction to the challenger's iNFT owner as bounty (royalty-split), a fraction to the protocol. Reputation updates flow back to the solver's ENS text records and (via CCIP-Read) become live-queryable by any external protocol. Challenger agents (run by us as reference implementations + by anyone else) are ERC-7857 iNFTs with their brain stored encrypted on 0G Storage; they coordinate over Gensyn AXL to deduplicate challenge attempts and pay KeeperHub workflows in x402 USDC for execution.

---

## L1 Specification

### Functional requirements

**FR-1: Solver registration via ENS subname + bonding**
- A solver registers a subname under `solvers.reckon.eth` (e.g., `bunni.solvers.reckon.eth`) using our L2 subname registrar
- After subname registration, solver bonds USDC into Reckon's `SolverBondVault`, which keys storage by ENS namehash, not by address
- Required bond is dynamic: `requiredBond = baseBond * decay(reputation_score)` where higher reputation = lower required bond. Concretely: baseBond starts at 1000 USDC, decays linearly to 100 USDC at reputation 1.0
- Reputation is stored as a text record on the solver's ENS subname (key: `reckon.reputation`), updated by `ENSReputationWriter`
- Bond is locked while challenge windows are open against any of the solver's recent fills

**FR-2: Order tagging**
- A swapper creating a UniswapX order can specify our deployed `ReckonValidator` address as the order's `additionalValidationContract` and encode their EBBO tolerance in `validationData`
- This is a 1-line change to the swap UI — no UniswapX fork needed
- The swapper's address is recorded for restitution payout

**FR-3: Fill recording**
- When the UniswapX reactor calls `ReckonValidator.validate(filler, resolvedOrder)`, we resolve `filler` to its ENS namehash via reverse-lookup on `solvers.reckon.eth` (revert if filler has no subname — this is intentional; only registered solvers can be validated)
- Record a `FillRecord{orderHash, fillerNamehash, fillBlock, inputAmount, outputAmount, swapper, eboTolerance, challengeDeadline}` in our `FillRegistry` contract
- Append the same fill to **0G Storage Log** for off-chain agent indexing (cheaper than reading on-chain history)
- We do NOT block the fill from completing — validation always returns successfully. The challenge happens later
- Emit a `FillRecorded` event indexed by fillerNamehash, swapper, and orderHash

**FR-4: Benchmark computation**
- `EBBOOracle.computeBenchmark(tokenIn, tokenOut, atBlock)` reads spot prices from a hardcoded list of 3 canonical pools per pair (e.g., for USDC/WETH: Uniswap v4 0.05%, v3 0.05%, v3 0.30%) and returns the geometric mean weighted by per-pool TVL
- Reads are at challenge submission time using current state. Tightening the challenge window to 30 minutes makes this drift negligible. **Documented as a known limitation; in production, an indexer would snapshot at fill time.** This is the right call for hackathon scope
- The pool list is upgradeable by a multisig, but only via timelock to prevent live attacks
- Returns price in `1e18` precision

**FR-5: Challenge mechanism with ENS gating**
- Within `challengeWindow` blocks of fill (default 1800 blocks ≈ 30 min on Unichain at 1s blocks), any address holding a subname under `challengers.reckon.eth` can call `Challenger.submit(orderHash, challengerBond, beneficiary)`
- The contract verifies the challenger's ENS subname ownership via a namehash check on the registrar
- Challenger posts USDC bond equal to 10% of solver's bond (skin in the game)
- Contract immediately computes `expectedOutput = EBBOOracle.computeBenchmark(...) * (1 - eboTolerance)`
- If `actualOutput < expectedOutput`: challenge succeeds. If `actualOutput >= expectedOutput`: challenge fails and challenger loses bond

**FR-6: Slashing and royalty-split payouts**
- On successful challenge, slash amount = `min(solverBond, expectedOutput - actualOutput)` (capped at bond, never more than the gap)
- Distribution: 60% to swapper as restitution, 30% to **iNFT owner of the challenger agent**, 10% to protocol treasury
- The 30% challenger share resolves through the ERC-7857 royalty-split logic: if the challenger agent's iNFT was transferred mid-bond-period, the *current* owner at slash time receives the bounty (configurable per-agent — see FR-9)
- Challenger bond is returned in full
- Solver's ENS reputation text record is decremented via `ENSReputationWriter`
- The slash event is appended to 0G Storage Log for permanent off-chain audit trail

**FR-7: ENS-native reputation feedback**
- Successful clean fills (no challenge submitted, or all challenges failed) within a 7-day rolling window automatically increment solver reputation
- Reputation update batched once per day via KeeperHub workflow paid in x402 USDC
- Updates are written to the solver's ENS subname text records: `reckon.reputation`, `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`
- A **CCIP-Read gateway** (off-chain resolver, ENSIP-10) serves live reputation derived from the subgraph, so external apps resolving `bunni.solvers.reckon.eth` get always-fresh data without on-chain writes for every micro-update
- Reputation aggregation function lives in `ReputationAggregator` (separate contract, can be upgraded without touching validator)

**FR-8: Challenger agent reference implementation**
- An OpenClaw-based agent that subscribes to `FillRecorded` events, computes EBBO benchmark off-chain (via 0G Compute for parallel multi-pool reads), and auto-submits challenges when expected slash > expected gas + bond risk
- Agents communicate with peer agents over Gensyn AXL across separate VPS nodes (Hetzner + Fly.io minimum) to deduplicate challenge attempts (only one challenger needed per slashable fill — no need to gas-war)
- Agents share state via 0G Storage KV (which fills are being claimed, which are completed) — this turns AXL coordination from gossip into auditable shared memory
- Agents use KeeperHub workflow for actual challenge submission tx (gas optimization, retry, audit log)

**FR-9: Challenger agents as iNFTs (ERC-7857)**
- Each challenger agent is minted as an iNFT via Reckon's `ChallengerNFT` contract
- The iNFT's metadata URI points to encrypted agent state on 0G Storage (the "brain" — model config, AXL identity keys, reputation, performance history)
- Ownership of the iNFT entitles the holder to:
  - 30% of every successful slash bounty produced by that agent
  - Configurable royalty split (e.g., 25% to original creator, 5% to performance optimizer)
  - Right to upgrade the agent's brain (via ERC-7857 dynamic update mechanism)
- Transfer of the iNFT atomically transfers earnings rights — the smart contract reads the current owner at slash time
- Off-chain: when a challenger agent boots up, it reads its own iNFT to derive its identity (AXL keypair, EBBO threshold preferences) from the encrypted blob on 0G Storage. **The agent literally is its iNFT.**

### Non-functional requirements

**NFR-1: Gas budget**
- Validator's `validate()` call: ≤ 35k gas (slightly higher than spec v0.2 due to namehash check; still doesn't slow down fills materially)
- Challenge submission: ≤ 280k gas (3-pool benchmark reads + ENS gating check + slashing logic + iNFT owner lookup)
- Reputation update batched: amortized < 60k gas per agent per update (slightly higher due to text record writes)

**NFR-2: Adversarial robustness**
- No single Uniswap pool can move the benchmark by more than `1 / sqrt(N)` where N = number of canonical pools (geometric mean weighting bounds influence)
- Challenger collusion mitigated by AXL deduplication + first-valid-challenge-wins
- Solver self-challenge (theatrics) prevented by requiring challenger ENS subname ≠ filler ENS subname at contract level
- Time-based attacks (manipulate pool right before challenge submission) mitigated by tight 30-minute challenge window
- iNFT theft mitigated by standard ERC-7857 transfer mechanics; agent's encrypted brain on 0G Storage protects against unauthorized state manipulation

**NFR-3: Failure modes documented**
- If EBBO oracle pool list is wrong/manipulated: documented multisig timelock recovery path
- If challenger bond depletes before slashing completes: revert, challenger loses bond
- If solver's bond is insufficient to cover full restitution: pay what's available, log shortfall, decrement reputation by larger amount
- If ENS resolver / CCIP-Read gateway is offline: text records still readable on-chain (slower path, but not broken)
- If 0G Storage is unavailable: agents fall back to local cache; iNFT transfer still works, only the dynamic-upgrade path is degraded

**NFR-4: Observability**
- Every fill, challenge, slash, reputation update, and iNFT transfer emits an indexed event
- Subgraph deployed for indexing
- Public dashboard showing per-solver track record, all resolvable by ENS name
- 0G Storage Log provides permanent audit trail independent of subgraph

### Contracts and architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         External                                │
│  UniswapX Reactor ──────────► ReckonValidator                   │
│  (existing, unchanged)        (NEW: our additionalValidation)   │
└────────────────────────────────────┬────────────────────────────┘
                                     │ (resolves filler to ENS namehash)
                                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FillRegistry (NEW)                           │
│  - mapping(orderHash => FillRecord)                             │
│  - emits FillRecorded                                           │
│  - appends to 0G Storage Log                                    │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                                     ▼ challenged via
┌─────────────────────────────────────────────────────────────────┐
│                    Challenger (NEW)                             │
│  - submit(orderHash, bond, beneficiary)                         │
│  - verifies challenger holds challengers.reckon.eth subname     │
│  - calls EBBOOracle for benchmark                               │
│  - executes slashing on success                                 │
│  - distributes 30% bounty to ChallengerNFT current owner        │
└────────────┬────────────┬────────────┬────────────┬─────────────┘
             │            │            │            │
             ▼            ▼            ▼            ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────────┐
    │ EBBOOracle │ │SolverBond  │ │Challenger  │ │ENSReputation    │
    │ (NEW)      │ │Vault (NEW) │ │NFT — iNFT  │ │Writer (NEW)     │
    │ - 3+ pools │ │ - keyed by │ │(NEW,       │ │ - writes text   │
    │ - geo mean │ │   namehash │ │ ERC-7857)  │ │   records to    │
    │            │ │ - lock/    │ │ - 0G       │ │   solver's      │
    │            │ │   release  │ │   Storage  │ │   subname       │
    │            │ │ - slash    │ │   metadata │ └────────┬────────┘
    └────────────┘ └────────────┘ └────────────┘          │
                                                          ▼
                                              ┌────────────────────┐
                                              │ ENS Resolver       │
                                              │ (mainnet, existing)│
                                              │ + CCIP-Read gateway│
                                              │ (NEW, off-chain)   │
                                              └────────────────────┘

Off-chain:
┌─────────────────────────────────────────────────────────────────┐
│ Challenger Agent Swarm (NEW, OpenClaw + 0G Compute + iNFTs)     │
│  - each agent IS an iNFT; reads brain from 0G Storage           │
│  - subscribes to FillRecorded                                   │
│  - computes EBBO benchmark via 0G Compute                       │
│  - coordinates over Gensyn AXL (dedup challenges)               │
│  - shares claim state via 0G Storage KV                         │
│  - submits challenges via KeeperHub workflow (x402 paid)        │
│  - earnings route to current iNFT owner                         │
└─────────────────────────────────────────────────────────────────┘

ENS L2 Subname Registrar (NEW):
- solvers.reckon.eth — solver subnames
- challengers.reckon.eth — challenger access tokens
- Deployed via Durin or Namestone (Sepolia → mainnet)
```

**Contract count:** 6 new Solidity contracts (added `ChallengerNFT` and `ENSReputationWriter`). ~2000-2500 lines total. Foundry tests target 95%+ coverage on core contracts, 80%+ on iNFT and ENS layers.

**Out of scope for hackathon:**
- Reputation aggregation function tuning beyond a simple decay model (publish as a research direction)
- Cross-chain challenges (UniswapX cross-chain has its own optimistic flow; we focus same-chain)
- Solver bond rebalancing UI (CLI only; web UI nice-to-have)
- Real solver onboarding (we run our own demo solver + 2 challenger iNFTs)
- ERC-8004 ReputationRegistry integration (was in v0.2; demoted to "internal accounting reference" since ENS is now the external identity layer)
- Uniswap Trading API integration (was in v0.2 for the Uniswap bounty fit; dropped since we're not targeting that bounty)
- Second reference challenger agent in different framework (was v0.2 Phase 3 work)
- Full 24-hour adversarial attack simulation (compressed to 4-hour smoke test)

---

## Phase-wise plan

Two builders. Online format = 4 calendar weeks. The phases below assume ~25 hr/week each = ~200 builder-hours total. If your team has more bandwidth, extend Phase 4 with the bonus items listed at the end.

Roles:
- **Builder A** = "Contracts." Solidity, Foundry, contract deployments, on-chain integrations including ENS L2 registrar and ERC-7857 iNFT.
- **Builder B** = "Off-chain." OpenClaw agent, 0G Compute integration, 0G Storage integration, AXL networking, KeeperHub workflow, CCIP-Read gateway, frontend, indexer.

These are not rigid — both should review each other's work. But ownership is clear.

### Phase 0 — Setup (Day 1, both builders, ~6 hours)

**Both:**
- Pin a single shared notion/repo with: spec (this doc), open questions, daily standup notes
- Decide chain: **Unichain Sepolia for development, Base Sepolia as fallback** (Base if anything blocks on Unichain). Reasoning: UniswapX is mainnet on Ethereum and Arbitrum; for testnet we deploy our own local-flavor reactor + permit2 fixture. Confirm with Uniswap docs before committing
- Decide Solidity version: 0.8.26 (matches UniswapX, v4)
- Run `forge init`, set up CI (GH Actions, lint + test on every push)
- Confirm KeeperHub testnet account, x402 facilitator config, 0G Newton testnet RPC, Gensyn AXL local-mesh test
- Both deploy a hello-world contract to Unichain Sepolia to validate environment

**Builder A specifically (Day 1, ~3 hours):**
- **Acquire `reckon.eth`** on ENS mainnet (or fallback in order: `reckonprotocol.eth` → `getreckon.eth`). Set up resolver, configure for L2 subname delegation
- Verify Durin or Namestone availability on Sepolia. If both have issues, allocate 6 hours later for our own minimal subname registrar contract
- **Verify ERC-7857 reference implementation on 0G.** This is the biggest schedule risk in this spec. If no working reference exists, we have two paths: (a) implement the standard ourselves (+10h work, technically interesting, defensible 0G Track B story), or (b) fall back to ERC-721 + 0G Storage metadata, framing as "iNFT-pattern not strict-7857." Decide Day 1.

**Risks to flush early:**
- UniswapX testnet availability on Unichain. If UniswapX team has not deployed on Unichain testnet (likely as of April 2026), we deploy a fork ourselves using the audited contracts from `github.com/Uniswap/UniswapX`. Confirm in Phase 0 day 1 by reading their deployments doc; if no Unichain testnet, allocate 4 hours to deploy our own
- ERC-7857 tooling maturity. See Builder A Day 1 task above
- ENS subname registrar (Durin/Namestone) testnet availability. Fallback: deploy our own minimal registrar (~6 hours)

### Phase 1 — Core contracts + benchmark + ENS subnames (Week 1, both builders)

**Builder A (contracts + ENS layer, ~36 hours):**

Day 2-3: Write `ReckonValidator.sol` implementing UniswapX's `IValidationCallback` interface. The `validate(filler, resolvedOrder)` function:
- Resolves `filler` address to ENS namehash via reverse-lookup on `solvers.reckon.eth` registrar (revert if no subname)
- Decodes `resolvedOrder.info.additionalValidationData` to extract `eboTolerance` (uint16, bps)
- Calls `FillRegistry.recordFill(orderHash, fillerNamehash, swapper, inputAmount, outputAmount, eboTolerance, block.number, block.timestamp + 30 min)`
- Returns successfully (does not block fill)

Day 3-4: Write `FillRegistry.sol`:
- Storage: `mapping(bytes32 orderHash => FillRecord)` with fillerNamehash field
- `recordFill(...)` — only callable by Validator
- `getFillRecord(orderHash)` — view
- Emits `FillRecorded(orderHash, fillerNamehash, swapper, fillBlock)` indexed
- Emits `FillChallenged(orderHash, challengerNamehash, succeeded)` later

Day 4-5: **Deploy ENS L2 subname registrar** for `solvers.reckon.eth` and `challengers.reckon.eth` on Sepolia (Durin or Namestone preferred; fallback to custom registrar). Set up so:
- Solvers can claim arbitrary subnames under `solvers.reckon.eth` (light gating: must call from a funded EOA)
- Challenger subnames under `challengers.reckon.eth` require posting a 5 USDC anti-spam bond (returnable on de-registration)
- Both registrars expose namehash-from-address lookup for our contract reads

Day 5-6: Write `EBBOOracle.sol`:
- Hardcoded canonical pool list per token pair (testnet: 2-3 pools)
- `computeBenchmark(tokenIn, tokenOut)` — reads each pool's spot price via direct slot reads, computes TVL-weighted geometric mean
- Use OpenZeppelin's `Math.sqrt` + log/exp tricks for geometric mean in fixed point (PRB-Math is overkill here, custom assembly is fine for hackathon)
- Returns price in `1e18` precision

Day 6-7: Write `SolverBondVault.sol` — **keyed by ENS namehash, not address**:
- `deposit(namehash, amount)`, `withdraw(namehash, amount)` (only after challenge windows clear, only callable by current namehash owner)
- `lockBond(namehash, amount)` — only Challenger can call
- `slash(namehash, amount, beneficiary)` — only Challenger can call
- Tracks per-solver-namehash: `totalBond`, `lockedBond`, `lastFillBlock`

Foundry test targets for Phase 1: ≥ 80% line coverage on each contract, integration test that simulates a fill + benchmark read with ENS resolution.

**Builder B (off-chain bootstrap, ~30 hours):**

Day 2-3: Set up OpenClaw agent project. Repo skeleton: `agent/`, `keeper-workflow/`, `dashboard/`, `subgraph/`, `ccip-gateway/`, `inft-tools/`. Use TypeScript + viem for on-chain reads, ethers v6 for signer, Bun for runtime (fast, hackathon-friendly).

Day 4-5: Write the **EBBO computation off-chain** (mirrors A's on-chain version). Same algorithm, run via 0G Compute for parallel pool reads. Wire `@0glabs/0g-serving-broker` to call GLM-5-FP8 with a structured-output prompt: "Given these 3 pool prices and TVLs, compute the TVL-weighted geometric mean." This is overkill — simple math doesn't need an LLM — but **0G Compute integration is a sponsor requirement**. For real production we'd just compute it locally; for the hackathon, doing the heavier computation via 0G is the integration story. Document this honestly in the README.

Day 5-6: Wire viem to subscribe to `FillRecorded` events on Unichain Sepolia (or local anvil for now). When event fires, off-chain agent: fetch fill data, resolve fillerNamehash to ENS name for display, compute EBBO, decide whether to challenge.

Day 6-7: KeeperHub workflow proof-of-concept. Use their MCP server to create a workflow: "Trigger on webhook, call `Challenger.submit(orderHash, bond, beneficiary)` with retry logic." Confirm Turnkey signing works. Confirm x402 billing on workflow execution.

End of Week 1 milestone: locally, A's contracts deploy and pass forge tests with ENS resolution working. Solvers and challengers can register subnames. B's agent listens to a mock event from a local anvil and would-decide-to-challenge if benchmark deviation > tolerance.

### Phase 2 — Challenge mechanism + slashing + ENS reputation + 0G Storage (Week 2)

**Builder A (~33 hours):**

Day 8-9: Write `Challenger.sol`:
- `submit(orderHash, challengerBondAmount, beneficiary)` — main entrypoint
- Verify: `block.number <= fillRecord.challengeDeadline`, `msg.sender holds challengers.reckon.eth subname`, `msg.sender's namehash != fillRecord.fillerNamehash` (no self-challenge), `challengerBondAmount >= minBond`
- Pull challenger USDC bond into contract via `permit2` or `transferFrom`
- Call `EBBOOracle.computeBenchmark(...)`. Note: reading historical state for "fillBlock" is impossible cheaply — so we read **current** spot at challenge time. We compensate by tightening the challenge window to 30 minutes and arguing the price drift is negligible
- Compute `expectedOutput = benchmark * inputAmount * (10000 - eboTolerance) / 10000`
- If `fillRecord.outputAmount < expectedOutput`: succeed → slash flow. Else: fail → challenger loses bond
- Slash flow: distribute 60/30/10 — 30% to **iNFT current owner** of challenger's agent (look up via `ChallengerNFT.ownerOf(agentId)`), 60% to swapper, 10% protocol
- Emit indexed events for everything

Day 10: Write `ENSReputationWriter.sol`:
- `recordSuccessfulFill(solverNamehash)` — called by Challenger when slash fails (= clean fill)
- `recordFailedFill(solverNamehash)` — called when slash succeeds
- Batches updates; settles to ENS resolver text records once per day via KeeperHub
- Text record keys written: `reckon.reputation`, `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash` (ISO timestamp)
- `flushReputation()` — anyone can call, pays a small bounty (1 USDC) to incentivize liveness

Day 11-12: ENS resolver integration testing. The text records are written via the public resolver, but our contract needs authorization to write to them. Two paths:
- **Path A:** Each solver, on subname registration, sets our `ENSReputationWriter` as an authorized writer for the `reckon.*` keys via the resolver's permission system
- **Path B:** Our L2 subname registrar uses a custom resolver that delegates `reckon.*` keys to our contract by default (cleaner, recommended)

Pick Path B unless registrar limitations prevent it. Either way, verify a real text record gets written on testnet end-to-end.

Day 13-14: End-to-end Foundry test. Mock UniswapX reactor → ReckonValidator → FillRegistry → Challenger → SolverBondVault slash → ENSReputationWriter → mock ENS resolver. Hit 90%+ coverage. Use `forge coverage --report lcov`.

**Builder B (~33 hours):**

Day 8-9: Complete the OpenClaw challenger agent loop:
- Listen for `FillRecorded`
- Compute EBBO via 0G Compute (or local fallback if 0G is rate-limited)
- Compare to fill outcome
- Decide: challenge if `slashable_amount > gas_cost + bond_risk_adjusted`
- Call KeeperHub workflow to submit challenge

Day 10-11: Set up a 2-node AXL mesh for challenger deduplication. Each node has independent eyes; first one to detect a slashable fill broadcasts an "I'm taking this" message over A2A. Other nodes back off for 30 seconds to let the first one challenge. If first one fails to submit, second tries. **This is the legitimate Gensyn integration** — without it, multiple challenger agents would gas-war for the same slash.

Verify AXL mesh works across two physically separate VPS nodes (Hetzner + Fly.io). Document the AXL bootstrap process — Gensyn judges will check.

Day 12: **0G Storage Log integration** — append every recorded fill and every executed slash to a 0G Storage Log namespace owned by our protocol. This becomes a permanent audit trail independent of any subgraph. Use `@0glabs/0g-ts-sdk` (or equivalent).

Day 13: **0G Storage KV integration** — agent swarm uses 0G Storage KV as the shared "claim state" map. When agent X claims a fill, it writes `{orderHash: X.agentId}` to the KV; other agents read this before deciding to challenge. This converts AXL coordination from gossip-only to gossip + persistent shared memory, which is exactly the "specialist agent swarms collaborate in real time via shared 0G Storage memory" example from the bounty description.

Day 14: **CCIP-Read gateway scaffold.** Set up a Node.js service that implements the ENSIP-10 `resolve()` callback. When an external app resolves `bunni.solvers.reckon.eth`, our gateway receives the call, reads live reputation from the subgraph, signs the response per CCIP-Read protocol, returns. Verify with `viem.getEnsText({name, key})` from a test client.

End of Week 2 milestone: full happy path works end-to-end on testnet. A swap with bad price gets challenged automatically by the agent, slashed, swapper gets restitution, solver's ENS text record updates, audit trail appears on 0G Storage Log, swarm coordinates via 0G Storage KV. CCIP-Read gateway returns live reputation to external resolvers.

### Phase 3 — iNFT layer + adversarial testing + KeeperHub connector (Week 3)

This phase is where we **earn the "technically strong" claim** AND where the iNFT layer comes online. The iNFT is the centerpiece of our 0G Track B story.

**Builder A (~28 hours):**

Day 15-17: Write `ChallengerNFT.sol` implementing ERC-7857:
- Each minted token represents one challenger agent
- Token's metadata URI points to encrypted blob on 0G Storage containing: AXL keypair, EBBO threshold preferences, performance history, model config
- Standard ERC-7857 transfer mechanics: transfer of token = transfer of agent ownership = transfer of earnings rights
- `royaltyConfig(tokenId)` returns `(creatorAddress, creatorBps, optimizerAddress, optimizerBps, ownerBps)` — the Challenger contract reads this when distributing the 30% bounty
- `updateBrain(tokenId, newURI)` — only callable by current owner; allows dynamic upgrades per ERC-7857 spec

If ERC-7857 reference implementation isn't usable on 0G, fall back to ERC-721 + custom metadata + custom royalty config. Frame as "iNFT-pattern" rather than "ERC-7857-compliant." Same demo, slightly weaker standard claim.

Day 18: Adversarial Foundry tests. Write fuzz tests for:
- Challenger submitting with insufficient bond
- Solver self-challenging via different addresses but same namehash (must revert)
- Challenger without subname submitting (must revert)
- Challenge after deadline (must revert)
- Multiple simultaneous challenges on same order (first wins, others refunded)
- EBBO oracle returning manipulated value (verify geometric mean dampens)
- iNFT transferred mid-challenge (royalty routes to new owner correctly)
- Slashing edge cases: solver bond = 0, expected output > input (price inverted), fillRecord doesn't exist

Day 19: Write a **mechanism design analysis** doc (~500 words, trimmed from v0.2's 1500). Cover:
- Why second-price slashing isn't needed here (no auction, no need)
- Why the 30-minute window balances challenge gas cost vs price drift
- Why challenger gets 30% (had to be enough to cover gas + opportunity cost; chose by analyzing average gas + 1.5x safety margin)
- Why bond decay with reputation is incentive-compatible (high-rep solvers face less bond friction, but lose more reputation when slashed → still aligned)
- Why challenger agents are iNFTs (creates a market for proven challenger algorithms; new participants buy a working agent rather than train one from scratch)

Day 20-21: **4-hour attack smoke test** (compressed from v0.2's 24-hour run). Set up two demo solvers on testnet, one honest (uses good price), one griefer (deliberately fills at 1% worse than benchmark). Run challenger agent for 4 hours. Measure: how many of the bad fills get caught? What's the average time-to-challenge? Document findings — these numbers go in the demo video.

Polish contracts. Add NatSpec to every public function. Run `slither` and `mythril`, fix any non-trivial findings.

**Builder B (~25 hours):**

Day 15-16: **iNFT-aware agent runtime.** When the OpenClaw agent boots up, it:
- Reads its own iNFT (token ID passed via env var or CLI arg)
- Decrypts the brain blob from 0G Storage using owner's signature as decryption key
- Initializes its AXL keypair, EBBO preferences, etc. from the decrypted brain
- On bounty receipt, queries `ChallengerNFT.ownerOf(tokenId)` to confirm current owner before broadcasting agent identity

This makes the agent literally derived from its iNFT — the centerpiece of the 0G Track B pitch.

Day 17-18: **`@reckon-protocol/keeperhub-openclaw` connector.** Build a thin npm package that wraps KeeperHub's MCP server for OpenClaw agents. Exposes: `createWorkflow(spec)`, `triggerWorkflow(name, args)`, `getWorkflowHistory(name)`. This is the "build the bridge so other developers don't have to" angle the KeeperHub bounty explicitly calls out (Focus Area 2). Open-source it, publish to npm. ~300 lines, well-typed, README with quickstart.

Day 19-20: **Subgraph + CCIP-Read gateway completion.** Index `FillRecorded`, `FillChallenged`, `SolverSlashed`, `ReputationUpdated`, `ChallengerNFTMinted`, `ChallengerNFTTransferred`. Deploy on The Graph hosted service or a local Goldsky. CCIP-Read gateway reads from subgraph and returns formatted text records.

Day 21: **Dashboard polish.** Add real-time feed, charts of solver reputation over time, challenger leaderboard (sorted by iNFT bounty earnings), iNFT marketplace view (active challenger iNFTs, recent transfers, projected yield). Use `recharts` (already in our skill stack). Ensure all solvers display by ENS name, not address.

End of Week 3 milestone: protocol is adversarially tested, challenger agents are iNFTs with on-chain ownership, KeeperHub OpenClaw connector is published, dashboard shows everything by ENS name, CCIP-Read gateway serves live reputation. Could ship to mainnet next week if we wanted.

### Phase 4 — Mainnet deploy + demo + polish (Week 4)

**Builder A (~20 hours):**

Day 22-23: Deploy contracts to **Base mainnet** (Base has UniswapX live and a richer pool ecosystem for the EBBO oracle). Verify on Etherscan. Update SDK with mainnet addresses.

Day 23-24: Deploy **ENS mainnet subname registrar** for `solvers.reckon.eth` and `challengers.reckon.eth`. This requires `reckon.eth` to be on mainnet; coordinated with Phase 0 acquisition. Test by registering 2-3 demo solver subnames, 1-2 challenger subnames.

Day 24: Deploy **`ChallengerNFT` on Base mainnet.** Mint 2 demo challenger iNFTs for the demo. Transfer one to a second wallet to demonstrate ownership transfer.

Day 25: Recruit at least one external solver to register and post bond — even with $100 USDC. This is the "real external user in the demo" point. Reach out to: Bunni team, Arrakis, smaller MEV searchers in the CowSwap discord, anyone running a UniswapX filler. Even one external solver participating in the demo is enormous credibility.

Day 26-27: Mainnet smoke test. Run a real swap through ReckonValidator on Base. Have your own challenger agent (running as iNFT-derived agent) watch and not challenge (because the fill is good). Deliberately set up a low-quality fill to demonstrate slashing — pay the gas yourself, slash yourself, restitution yourself. The mechanism works regardless of who the actors are.

**Builder B (~22 hours):**

Day 22-23: Demo video script + recording. Strict 2-minute target. Updated structure:
- 0:00-0:15: The problem — solver fills with no objective accountability
- 0:15-0:35: Solution architecture diagram, mention `.eth` subname identity (ENS hit #1)
- 0:35-1:05: Live demo — bad fill happens, AXL-coordinated challenger swarm detects, KeeperHub workflow submits challenge, slash executes, restitution arrives, solver's ENS reputation text record drops on-chain (Gensyn + KeeperHub + ENS hits)
- 1:05-1:25: iNFT moment — show challenger agent's iNFT, transfer to second wallet on screen, next bounty earned routes to new owner (0G Track B hit)
- 1:25-1:45: Third-party app resolving `bunni.solvers.reckon.eth` and reading reputation via CCIP-Read (ENS creative track hit)
- 1:45-2:00: What's next — real solver onboarding, cross-chain, marketplace for trained challenger agents

Day 24-25: Write final README. Cover: motivation, architecture, contract addresses, ENS namespace structure, iNFT mechanics, security considerations (this matters), known limitations (this matters more), how to register as solver/challenger, how to mint a challenger iNFT. Include FAQ pre-empting judge questions: "Why not re-execute?" "Why 30-minute window?" "Why not DAO discretion?" "Why ENS instead of ERC-8004?" "What's iNFT vs regular NFT?"

Day 26: KeeperHub feedback file. Write an honest, specific, actionable feedback document about the KeeperHub experience. Bugs found, friction points, feature requests. **This is its own $500 prize** and is high-EV at low effort.

Day 26-27: **Final ENS demo flourish.** Build a tiny standalone web tool (`resolve.reckon.fi`) that takes any solver address, resolves it to its ENS name, displays reputation via CCIP-Read. This is a 2-hour build that visibly demonstrates the ENS layer doing real work for an external consumer. Memorable for ENS judges.

Day 28: Final submission. ETHGlobal portal, all GitHub repos public, demo video uploaded, contract addresses verified, dashboard live, ENS subnames registered, iNFTs minted, KeeperHub feedback submitted.

End of Week 4 milestone: shipped, demoable, mainnet, with at least one external participant and full ENS + iNFT + AXL + KeeperHub integration. Submission window: complete.

### Bonus items if you have spare bandwidth

In rough priority order:
1. **`@reckon-protocol/sdk`** — TypeScript SDK letting anyone build a challenger. ~300 lines. Bumps Gensyn and KeeperHub track scores
2. **iNFT marketplace stub** — minimal frontend for listing/buying challenger iNFTs. Reinforces 0G Track B story with concrete UX
3. **Cross-chain challenges** — extend to UniswapX cross-chain fills using existing bridge attestation. Hard but high-impact
4. **Insurance fund layer** — if a solver's bond is insufficient for full restitution, an insurance pool covers the gap (funded by protocol fees). One additional contract
5. **Visualizer of EBBO benchmark vs fill price** showing live data in the dashboard. Memorable for judges

### Scoping note for in-person 72-hour format

If this is in-person 72h instead of online 4 weeks, cut as follows:
- Keep Phases 0, 1, 2 in full (~36 hours)
- Cut iNFT layer entirely; use ERC-721 with metadata pointing to 0G Storage. Frame as "iNFT-pattern" — saves ~14 hours
- Skip Phase 3's mechanism-design doc (5 bullets in README instead, ~3 hours saved)
- Skip the standalone `resolve.reckon.fi` demo tool
- Mainnet deploy → testnet only with a clear "this is mainnet-ready, here's the deploy script"
- Total: ~50 hours per builder = aggressive but feasible
- Honest impact: the 0G Track B story weakens (no real iNFT) but ENS, Gensyn, and KeeperHub stories all stay intact

---

## Pre-build checklist (do before Phase 0)

- [ ] Confirm UniswapX is deployed on Unichain Sepolia. If not, allocate 4 hours in Phase 0 for our own deploy
- [ ] Confirm 0G Newton testnet has GLM-5-FP8 endpoint live and we have a funded provider account
- [ ] **Confirm ERC-7857 reference implementation exists on 0G.** Critical schedule risk. If not, decide implement-vs-fallback Day 1
- [ ] **Confirm `reckon.eth` is available on ENS mainnet.** If not, fallback in order
- [ ] **Confirm Durin or Namestone is usable on Sepolia for L2 subnames.** If not, allocate 6 hours for custom registrar
- [ ] Confirm KeeperHub testnet account works and we can create workflows via MCP
- [ ] Confirm Gensyn AXL binary runs on both our VPS providers
- [ ] Read the entire UniswapX docs section on `additionalValidationContract` (this is load-bearing)
- [ ] Read the ERC-7857 spec and any reference implementations
- [ ] Read the Bunni v2 audit (TOB-BUNNI-11) to understand how multi-pool oracles get attacked. This informs your EBBO oracle hardcoded list
- [ ] Read CCIP-Read (ENSIP-10) spec and at least one reference gateway

If any checkbox can't be confirmed in Day 1, raise the flag immediately and we re-scope.

---

## Risks I am still uncertain about

Honest list, ranked by severity.

**1. ERC-7857 tooling maturity (HIGH severity, MEDIUM probability).** ERC-7857 is new. If 0G has no reference factory or ergonomic SDK, implementing the standard from spec adds ~10 hours and the iNFT may not interop with future standard changes. Mitigation: fall back to ERC-721 + 0G Storage metadata, framing as "iNFT-pattern not strict-7857." Loses some 0G Track B differentiation but stays demoable.

**2. UniswapX testnet availability (HIGH severity, MEDIUM probability).** UniswapX is mainnet-Ethereum and Arbitrum; it may not be on Unichain or Base testnet in usable form. Mitigation: deploy our own UniswapX fork (audited contracts, ~4 hours). Doesn't change the spec, just adds Day-1 work.

**3. ENS L2 subname registrar availability (MEDIUM severity, LOW-MEDIUM probability).** Durin and Namestone are the leading options; if both have testnet issues, we deploy our own minimal registrar. Adds ~6 hours.

**4. CCIP-Read gateway integration complexity (MEDIUM severity, MEDIUM probability).** ENSIP-10 has subtle signature requirements. Off-chain resolver development can sink time if the spec interpretation is wrong. Mitigation: study an existing gateway (e.g., Coinbase's `cb.id`) before writing ours.

**5. 0G Compute rate limits (MEDIUM severity, MEDIUM probability).** GLM-5-FP8 has documented rate limits (~30 req/min per provider). Our challenger agent could hit this if we have many concurrent fills. Mitigation: cache benchmark calculations per (tokenIn, tokenOut, fillBlock), fallback to local computation if rate-limited.

**6. Recruiting external solver (MEDIUM severity, HIGH probability).** Cold-emailing solver teams in 4 weeks is hard. Mitigation: have a backup plan where we run two of our own solvers (one honest, one griefer) and frame the demo as "we built the infrastructure, here's how it works in action."

**7. KeeperHub workflow gas pricing on Base mainnet (LOW severity, LOW probability).** Their public docs mention 30% gas savings vs baseline; we should verify on actual workflow execution before committing demo to mainnet. Mitigation: Base has very low gas costs anyway.

**8. AXL mesh stability over conference Wi-Fi (LOW severity, MEDIUM probability if in-person).** Already hit by past hackathon teams. Mitigation: nodes on public-IPv6-enabled VPS, never on local laptops at the venue.

---

## What this submission wins, realistically

Honest expected-value breakdown by sponsor:

- **ENS Integration prize ($1,250 1st):** medium-high probability of placing 1st-3rd. Solver subnames + bond keying + reputation in text records is exactly what the bounty asks for. Expected: $750-$1,250
- **ENS Creative prize ($1,250 1st):** medium probability. CCIP-Read gateway serving live reputation is genuinely creative. Subnames as challenger access tokens is a second creative angle. Expected: $500-$1,250
- **0G Track B ($7,500 split across 5 winners at $1,500):** medium-high probability of winning one of the 5 slots. iNFT challenger agents with persistent memory + royalty splits + AXL coordination over shared 0G Storage memory hits multiple example use cases the bounty calls out. Expected: $1,500 (winning one slot is the realistic target; multiple slots possible but not banked)
- **Gensyn ($5,000 ranked pool):** medium probability of placing. AXL is genuinely load-bearing in challenger swarm dedup (no decentralization theater), which judges will recognize. But our AXL usage is "use the tool well," not "extend AXL." Expected: $1,000-$2,500
- **KeeperHub ($4,500 ranked pool + $500 feedback):** high probability of placing in their integration track. Our KeeperHub usage covers both their focus areas (innovative use + agent framework integration via OpenClaw connector). Plus the feedback bounty is essentially free. Expected: $1,500-$3,000
- **ETHGlobal Finalist pool:** independent of sponsors. Hard to predict but Reckon's sharpness, shippability, and 5-sponsor-spanning architecture put it in the running. Expected: $0-$5,000

**Aggregate expected prize value:** $5,250-$20,500 with central tendency around **$11,000-$14,000**.

That assumes execution quality matches the spec. Most of the variance is on our side.

---

## Changelog from v0.2

- **Dropped Uniswap as a sponsor target** (kept Uniswap stack as infra). Removed Uniswap Trading API integration, FEEDBACK.md for Uniswap, and Uniswap-specific demo time.
- **Promoted ENS from absent → primary**. Solver and challenger identity now flows through ENS subnames. Added ENS L2 subname registrar deployment, ENSReputationWriter contract, CCIP-Read gateway, and `resolve.reckon.fi` demo tool.
- **Demoted ERC-8004 from primary identity layer → internal accounting reference** (still used for some patterns, but ENS is the user-facing identity).
- **Promoted iNFT (ERC-7857) from bonus → core**. Challenger agents are now ERC-7857 iNFTs with on-chain ownership, royalty splits, and brains stored on 0G Storage.
- **Concentrated 0G strategy on Track B only** (was previously hedged across A and B). The iNFT angle is the differentiator.
- **Added 0G Storage Log + KV as load-bearing** for fill audit trail and swarm coordination.
- **Added `@reckon-protocol/keeperhub-openclaw` connector** as a second KeeperHub deliverable (Focus Area 2).
- **Trimmed Phase 3 work**: cut second reference challenger agent, cut 24-hour attack sim → 4-hour smoke test, trimmed mechanism design doc from 1500 to 500 words, dropped Phase 3 SDK polish.
- **Updated risk list**: ERC-7857 tooling maturity is now top risk; ENS L2 registrar availability and CCIP-Read complexity added.
- **Updated EV estimate**: $11K-$14K central tendency (vs $13K-$15K in v0.2). Slightly lower because we're explicitly leaving Uniswap's $5K on the table, but with much higher coherence and shippability.
