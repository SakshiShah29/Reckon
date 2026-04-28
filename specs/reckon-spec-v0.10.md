# Reckon: A Cryptoeconomic Validation Layer for DeFi Solvers

**Spec version:** 0.10 — terminology cleanup: "indexer" renamed to "relayer" throughout (no architectural change)
**Team:** 2 builders, 4-week ETHGlobal online format (or 72h in-person, see scoping note at end)

---

## Naming and branding

**Project name:** **Reckon**

The name carries two meanings — *to calculate* and *to settle accounts / pass judgment* — and both are exactly what the protocol does. Reckon computes a canonical EBBO benchmark (the calculation), then enforces solver accountability against it (the settlement).

| Field | Value |
|---|---|
| **Name** | Reckon |
| **Subtitle** | Cryptoeconomic validation for DeFi solvers |
| **Tagline** | We settle solver fills by math, not by vote. |
| **One-line pitch** | Reckon makes every DeFi solver fill cryptographically challengeable, with automatic slashing on objective EBBO violations — no DAO vote required. |
| **Domain (preferred)** | `reckon.fi` — fallback `reckon.xyz` |
| **ENS namespace** | `reckon.eth` (with virtual subnames at `solvers.reckon.eth` and `challengers.reckon.eth`) |
| **GitHub org** | `github.com/reckon-protocol` |
| **npm scope** | `@reckon-protocol` |
| **Twitter / X** | `@reckonproto` (or `@reckon_fi`) |
| **Demo subdomain** | `app.reckon.fi` (Base mainnet dashboard) |

**Pitch lines that write themselves:**
- "Solvers get reckoned with."
- "Day of reckoning for bad fills."
- "We reckon every fill."
- "Reckoned by math, settled on-chain."

**Verify before committing** (Phase 0, Day 1): availability of `reckon.fi` / `reckon.xyz`, `@reckonproto` on X, `reckon-protocol` on GitHub, npm scope, AND `reckon.eth` on ENS mainnet. Fallback ordering for `reckon.eth`: `reckonprotocol.eth` → `getreckon.eth` → name change.

**Backup names** if needed: **Fillproof** or **Marker**. Don't waste cycles re-litigating the name — pick within 24 hours.

---

## Glossary — pin terminology before anything else

These distinctions matter because the spec touches multiple chain surfaces that share names but are different products:

- **AXL** = Agent eXchange Layer. An off-chain encrypted mesh networking primitive (Yggdrasil mesh + TLS direct peering + e2e encryption). **Not a chain. No token. No gas.** Reckon uses AXL.
- **Gensyn Testnet** (chain ID **685685**) — separate Gensyn product for ML protocol economics with the $AI token. **Reckon does NOT use this.**
- **0G Galileo** (chain ID **16602**, RPC `https://evmrpc-testnet.0g.ai`) — current 0G testnet. Reckon's `ChallengerNFT` and 0G Storage namespaces live here for the hackathon.
- **0G Aristotle** (chain ID **16661**) — 0G mainnet. Mentioned as future work; Reckon does not deploy here for the hackathon.
- **Base mainnet** (chain ID **8453**) — Reckon's primary deployment target for everything except `ChallengerNFT` and `ReckonWildcardResolver`.
- **Anvil-forked Base mainnet** — local development environment. Anvil's `--fork-url` points at a Base mainnet RPC endpoint.
- **ENS wildcard resolver (ENSIP-10)** — a resolver contract that handles resolution for all subnames of a name, including subnames that don't exist on-chain. Reckon uses this pattern for virtual subnames.
- **CCIP-Read (ERC-3668)** — the standard for offchain data retrieval in resolver responses. Reckon's wildcard resolver defers all lookups to a CCIP-Read gateway that reads from MongoDB and signs responses.
- **Virtual subnames** — subnames that don't exist on any chain. They live in MongoDB and are served by Reckon's CCIP-Read gateway. Resolved via standard ENS clients (viem, ethers, wagmi) without any client-side awareness that they're virtual.
- **OpenClaw-style SKILL.md** — a single markdown file at the agent's root that describes the full decision loop: trigger conditions, what command to run at each step, what JSON to expect back, and what to do based on the output. The file is documentation; the orchestrator implements the loop in TypeScript by reading the same rules.
- **`@0gfoundation/0g-ts-sdk`** — 0G Storage SDK (foundation scope).
- **`@0glabs/0g-serving-broker`** — 0G Compute SDK (labs scope; different package, different scope, both are real).

---

## Bounty strategy

This spec targets **4 sponsor bounties**, with Uniswap explicitly de-prioritized as a sponsor while keeping the Uniswap stack (UniswapX, v3/v4 pools) as load-bearing infrastructure.

| Sponsor | Status | Targeted prize | Strategy |
|---|---|---|---|
| **ENS** | Primary | $5,000 (both prize tracks) | Solver/challenger identity via wildcard-resolved virtual subnames + reputation in CCIP-Read responses + `resolve.reckon.fi` external demo |
| **0G** | Primary | $7,500 (Track B only) | Challenger agents minted as iNFTs (ERC-7857) with brains on 0G Storage; on 0G Galileo testnet (bounty does not require mainnet) |
| **Gensyn** | Primary | $5,000 | AXL-encrypted mesh (Yggdrasil + TLS) for first-claim-wins dedup; we contribute the dedup logic on top of AXL's application-agnostic byte transport |
| **KeeperHub** | Primary | $5,000 + $500 (feedback) | Webhook-triggered challenge submission + scheduled reputation flush + `@reckon-protocol/keeperhub-skills` skill pack |
| **Uniswap** | Stack only | $0 (not targeting) | UniswapX `additionalValidationContract` integration on Base mainnet; v3/v4 pools as EBBO oracle inputs. No FEEDBACK.md, no API integration work. |

**Aggregate target prize value:** $6,500-$22,000 (range), central tendency $12,500-$15,500, plus finalist pool consideration ($0-$5,000 independent).

---

## Builder roles and partner ownership

**Both builders are comfortable with TypeScript and Go in addition to Solidity.** Roles are defined by ownership of full sponsor surfaces, not by a strict on-chain/off-chain split.

| Builder A — owns ENS + KeeperHub end-to-end; co-owns 0G | Builder B — owns Gensyn end-to-end; co-owns 0G |
|---|---|
| **ENS contracts**: `ReckonWildcardResolver.sol` on Ethereum mainnet | **Gensyn AXL**: build from source, 3-node mesh networking, GossipSub fork, axl-claim-broadcast helper |
| **ENS off-chain**: CCIP-Read gateway (handles both subname existence + text records), `resolve.reckon.fi` demo tool | **0G Compute**: suspicion triage primitive (`triage.ts`), NL slash explanation generator |
| **KeeperHub workflows**: webhook + schedule workflows, skill pack, FEEDBACK.md, AI-generated workflow demo clip | **0G Storage Log**: batched fill audit trail |
| **Relayer**: subscribes to UniswapX Fill events, calls recordFill + attestOwner, writes to MongoDB | **0G Storage KV**: claim_state stream for swarm coordination |
| **MongoDB Atlas setup** + read-only credential management | **Challenger agent**: SKILL.md loop + 5 TypeScript primitives + orchestrator |
| **Bootstrap and deploy scripts**: BootstrapAnvilFork.s.sol, DeployBaseMainnet.s.sol, DeployENSResolver.s.sol | **Dashboard**: real-time feed, charts, leaderboards |
| **Hetzner hub VPS ops**: long-running Anvil fork hosting + AXL public hub | **Fly.io spoke ops**: AXL spoke nodes US + EU |
| **Reckon contracts**: ReckonValidator, FillRegistry, EBBOOracle, SolverBondVault, Challenger, RoyaltyDistributor, OwnerRegistry, SolverRegistry, ChallengerRegistry | **Demo recording**: video script execution, packet captures, transitions |
| **0G ChallengerNFT (ERC-7857 fork)** + iNFT brain encryption tooling | **0G iNFT brain blob writer**: encrypts agent state, uploads to Storage |

**Pairing seams** (where both builders coordinate at integration boundaries):

- **iNFT brain blob**: Builder A defines the encryption schema in `ChallengerNFT`; Builder B's agent reads + decrypts at boot
- **ENS reputation writes**: Builder A's reputation flush workflow updates MongoDB documents that the CCIP-Read gateway serves; B's agent provides the trigger data via slash events
- **Relayer**: Builder A writes it; Builder B's agent's primitive scripts subscribe to its outputs (FillRecorded events on Base, MongoDB documents)
- **MongoDB schema**: Builder A defines collections + write paths; Builder B's dashboard and primitives consume reads
- **KeeperHub webhook**: Builder A authors the webhook workflow; Builder B's `submit.ts` primitive triggers it

This split gives each builder one full sponsor end-to-end (A: ENS, KeeperHub; B: Gensyn) plus shared 0G work where the contract and agent halves meet.

---

## The development model — Anvil-forked Base mainnet

Reckon's development happens against an Anvil node forked from Base mainnet.

**Why Anvil-fork instead of testnet:**
- UniswapX has zero testnet deployments anywhere on any chain
- We get the real `PriorityOrderReactor` at `0x000000001Ec5656dcdB24D90DFa42742738De729` with all its real bytecode
- We get real Uniswap v3/v4 pools with real liquidity for the EBBO oracle, not testnet pools with fake prices
- Test transactions cost zero real gas; iteration speed is dramatically higher than mainnet dev
- Phase 4 mainnet deploy is no longer the first time we touch real UniswapX — by then we've done hundreds of iterations against its real bytecode

**How it works mechanically:**
- Each builder runs `anvil --fork-url <BASE_MAINNET_RPC>` locally on port 8545
- Foundry's `vm.createSelectFork()` creates the same fork programmatically inside test files
- A long-lived Anvil fork on the Hetzner hub VPS lets all three AXL nodes share a consistent dev environment during integration testing

**State management on a fresh fork:**
- Every Anvil restart wipes our deployed contracts
- We maintain a `BootstrapAnvilFork.s.sol` Foundry script that deploys all contracts in one command (~5 min per fresh fork)
- The script is also useful as the Phase 4 mainnet deploy script — same code, different RPC

**What stays on real chains:**
- **Ethereum mainnet:** `reckon.eth` parent name, `ReckonWildcardResolver` contract. ~$50-75 one-time
- **0G Galileo testnet:** `ChallengerNFT`, 0G Storage Log namespace, 0G Storage KV, 0G Compute provider sub-accounts. Faucet-funded, persistent across our laptop restarts
- **Base mainnet (Phase 4 only):** the final demo deployment

**What never touches a chain:**
- AXL mesh (3 VPSes)
- KeeperHub workflows (KeeperHub SaaS)
- Reckon Relayer
- MongoDB Atlas (read-side store for events; source of truth for virtual subnames)
- CCIP-Read gateway server (Builder A)
- Dashboard
- Challenger agent (Builder B): SKILL.md + 5 primitives + orchestrator

---

## The hybrid topology

| Component | Network / location | Notes |
|---|---|---|
| `ReckonValidator` + supporting contracts | **Anvil-forked Base mainnet** during dev → **real Base mainnet** for Phase 4 demo | Same deploy script, different RPC |
| `ChallengerNFT` (ERC-7857 iNFT) | **0G Galileo testnet** (persistent) | Faucet-funded; bounty doesn't require mainnet |
| 0G Storage Log + KV | 0G Galileo testnet (accessed via 0G `indexer` client from `@0gfoundation/0g-ts-sdk`) | |
| 0G Compute (Qwen3-32B) | 0G Galileo provider | |
| `reckon.eth` parent name | **Ethereum mainnet** | One-time ~$25-50 |
| `ReckonWildcardResolver` contract | **Ethereum mainnet** | One-time ~$15-25 deploy gas |
| Virtual subnames (`bunni.solvers.reckon.eth`, etc.) | **MongoDB Atlas + CCIP-Read gateway** | Don't exist on-chain. Resolved via ENSIP-10 wildcard + ERC-3668 |
| CCIP-Read gateway | Off-chain (our server, Builder A) | Reads MongoDB, signs responses |
| **MongoDB Atlas** | **Off-chain SaaS (free tier M0)** | Read-side store for events AND source of truth for virtual subnames |
| AXL mesh (3 VPSes) | Off-chain | No chain dependency |
| KeeperHub workflows | Off-chain (KeeperHub SaaS, targets Base) | |
| Reckon Relayer | Off-chain | Subscribes to local Anvil during dev, real Base mainnet for demo; writes to MongoDB |
| Challenger agent | Off-chain (3 VPSes, one per AXL node) | SKILL.md-defined loop + 5 TypeScript primitives + orchestrator |
| Dashboard | Off-chain | Reads MongoDB directly with read-only credentials |

**Cross-chain plumbing:** the only interaction across networks is `RoyaltyDistributor` on Base needing to know who currently owns a `ChallengerNFT` on 0G Galileo. We solve this with a relayer-attested `OwnerRegistry` contract on Base — no LayerZero/Wormhole needed.

---

## What this spec contributes to the field

The mechanism is simple, cheap, and tight:
- No re-execution → no state proofs → no fraud-proof games → no multi-week dispute windows
- Benchmark is an equal-weighted multi-pool geometric mean computed on-chain → ~50-80k gas to verify
- Challenge window is 30 minutes, balancing challenge gas cost vs price drift
- 8 contracts on Base mainnet, 1 on 0G Galileo, 1 on Ethereum mainnet
- ENS subnames are **virtual** — they exist only in MongoDB and the CCIP-Read gateway, but resolve normally for any ENS-aware client
- Challenger agents are iNFTs on 0G Galileo — owned, transferable, with Reckon-native royalty splits to owners on every successful slash bounty
- Validator is `view`-only (UniswapX interface requirement); fill recording happens via off-chain relayer that subscribes to the reactor's `Fill` event
- **Agent behavior is defined by a single SKILL.md file** describing the decision loop; primitives are 5 standalone TypeScript scripts. Anyone (or any AI) can understand exactly what the agent does by reading one markdown file
- Read store is MongoDB Atlas (not subgraph) — simpler architecture, fewer moving parts

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
> We present Reckon, the first objective post-fill validation mechanism for DeFi solvers with ENS-native identity and tradeable challenger agents. Solvers register as virtual ENS subnames under solvers.reckon.eth (resolved via ENSIP-10 wildcard resolver + ERC-3668 CCIP-Read) and post bonds proportional to their on-chain reputation; any party can challenge a fill by submitting evidence that a canonical multi-pool benchmark exceeded the solver's outcome by a configurable threshold; slashing executes automatically without DAO discretion. Challenger agents are minted as iNFTs (ERC-7857) on 0G Galileo with persistent memory on 0G Storage and Reckon-native royalty splits to current owners. The agent's behavior is defined by a single OpenClaw-style SKILL.md file describing a five-step decision loop, with each step implemented as a standalone TypeScript primitive. We show this converts solver behavior from "trust the auction" to "trust the math," while making both the validators and the validated cryptographically discoverable.

### What it is, in one paragraph
Reckon is a UniswapX-compatible passive validator on Base mainnet that makes solver execution quality cryptographically challengeable, with **virtual ENS subnames** as the identity layer for both solvers and challengers, and ERC-7857 iNFTs on 0G Galileo as transferable challenger agents whose 30% slash bounty follows ownership. Swappers reference Reckon's `ReckonValidator` as their order's `additionalValidationContract`. Solvers register a virtual subname under `solvers.reckon.eth` (a MongoDB document, served by Reckon's CCIP-Read gateway) and post bonded collateral keyed by the subname's namehash. The validator is view-only — it gates fills on solver registration without recording them; an off-chain relayer subscribes to the UniswapX reactor's `Fill` event and writes records to `FillRegistry` on Base and to MongoDB. After a fill is recorded, anyone with a `challengers.reckon.eth` virtual subname has 30 minutes to challenge by proving — through a single read of 3 canonical Uniswap pools — that the equal-weighted geometric mean exceeded the solver's output by more than the swapper's specified tolerance. If the challenge succeeds, slashing is automatic: 60% to the swapper, 30% to the iNFT current owner of the challenger's agent (resolved via relayer-attested `OwnerRegistry`), 10% to protocol. Challenger agents are defined by a single `SKILL.md` describing a 5-step decision loop (triage → benchmark → coordinate claim → decide → submit), with each step a standalone TypeScript script. Agents coordinate over Gensyn AXL using a forked GossipSub channel, with 0G Storage KV as durable backup truth.

---

## L1 Specification

### Functional requirements

**FR-1: Solver registration via virtual ENS subname + bonding**
- A solver registers a subname under `solvers.reckon.eth` (e.g., `bunni.solvers.reckon.eth`) by inserting a document into MongoDB's `subnames` collection. **The subname is virtual — it does not exist on any chain.** It is served entirely by Reckon's CCIP-Read gateway via the `ReckonWildcardResolver` on Ethereum mainnet
- Registration UI: a small page on the dashboard that takes a desired label, the solver's address, signs a registration intent, and submits to the relayer. Relayer validates and writes to MongoDB
- After subname registration, solver bonds USDC into Reckon's `SolverBondVault` (on Base mainnet) via direct EOA `transferFrom` — **not through any KeeperHub-managed wallet** (the KeeperHub agentic wallet has 100 USDC per-tx and 200 USDC daily caps that conflict with our `baseBond = 1000 USDC`)
- `SolverBondVault` keys storage by namehash (computed from the subname string), not by address
- Required bond is dynamic: `requiredBond = baseBond * decay(reputation_score)` where higher reputation = lower required bond. Concretely: baseBond starts at 1000 USDC, decays linearly to 100 USDC at reputation 1.0
- Reputation is stored in MongoDB and served via CCIP-Read at the text record key `reckon.reputation` on the subname's namehash
- Bond is locked while challenge windows are open against any of the solver's recent fills

**FR-2: Order tagging — the swapper-side surface**
- A swapper creating a UniswapX order sets `OrderInfo.additionalValidationContract` to our deployed `ReckonValidator` address on Base mainnet
- They encode their EBBO tolerance (`uint16` in basis points, e.g., 50 = 0.5%) into `OrderInfo.additionalValidationData` via `abi.encode`
- This is a 1-line change to the order construction code in their swap UI

**FR-3: Fill recording via off-chain relayer (NOT the validator)**

⚠️ **The UniswapX `IValidationCallback.validate()` function is `external view`.** It cannot write storage, emit events, or call non-view functions on other contracts. So the validator's role and the registry's role split as follows:

- **`ReckonValidator.validate(filler, resolvedOrder)`** is `view`. It does subname-existence gating only:
  - Computes the namehash for the candidate subname (`<filler-as-label>.solvers.reckon.eth`)
  - Calls `SolverRegistry.isRegistered(namehash)` — reverts if false
  - Decodes `eboTolerance` from `additionalValidationData` (sanity check)
  - Returns silently if all checks pass — never blocks a valid fill

- **`FillRegistry.recordFill(orderHash, fillerNamehash, swapper, inputAmount, outputAmount, eboTolerance, fillBlock, challengeDeadline)`** is the state-modifying function. Called by **Reckon's off-chain relayer**, not by the UniswapX reactor. The relayer:
  - Subscribes to `Fill(orderHash, filler, swapper, nonce)` events emitted by the UniswapX `PriorityOrderReactor` on Base mainnet
  - On each `Fill` event, fetches the resolved order details, looks up the filler's namehash, calls `recordFill()` from a permissioned relayer EOA
  - **Also writes the fill to MongoDB Atlas `fills` collection**
  - The recorder address is set in `FillRegistry` and only that EOA can call `recordFill()`
- After recording: emits `FillRecorded(orderHash, fillerNamehash, swapper, fillBlock)`, indexed
- After every 50 fills or 60 seconds (whichever first), the relayer batches recent records into a single file uploaded to 0G Galileo Storage Log; the resulting Merkle root is emitted as `FillBatchAnchored(rootHash, firstOrderHash, lastOrderHash)` on Base
- Multi-output orders (`outputs.length > 1`) are explicitly **rejected** in v1

**FR-4: Benchmark computation — equal-weighted geometric mean**
- `EBBOOracle.computeBenchmark(tokenIn, tokenOut)` reads spot prices from a hardcoded list of 3 canonical pools per pair on Base mainnet:
  - For Uniswap v3 pools: `IUniswapV3Pool(pool).slot0()` returns `(sqrtPriceX96, tick, ...)`. Convert via `FullMath.mulDiv` to a 1e18-precision price ratio
  - For Uniswap v4 pools: `StateLibrary.getSlot0(poolManager, poolId)` returns the equivalent tuple
- Returns the **equal-weighted geometric mean** across the three pools
- Token0/token1 ordering is normalized
- Pool addresses are real Base mainnet addresses from day one
- The pool list is upgradeable by a multisig, but only via timelock to prevent live attacks
- Returns price in `1e18` precision

**FR-5: Challenge mechanism with virtual subname gating + iNFT owner verification**
- Within `challengeWindow` blocks of fill (default 1800 blocks ≈ 30 min on Base at 1s blocks), any address with a registered `challengers.reckon.eth` virtual subname can call `Challenger.submit(orderHash, challengerBond, beneficiary, agentTokenId, permit, signature)`
- The contract verifies the challenger's subname registration via `ChallengerRegistry.isRegistered(namehash)`
- The contract verifies that `agentTokenId` is owned by `msg.sender` via `OwnerRegistry.ownerOf(agentTokenId)` on Base
- Challenger posts USDC bond (10% of solver's bond) via Permit2 at canonical address `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- Contract immediately computes `expectedOutput = EBBOOracle.computeBenchmark(...) * (1 - eboTolerance)`
- If `actualOutput < expectedOutput`: challenge succeeds. If `actualOutput >= expectedOutput`: challenge fails and challenger loses bond

**FR-6: Slashing, royalty splits, relayer-attested cross-chain owner read**
- On successful challenge, slash amount = `min(solverBond, expectedOutput - actualOutput)`
- Distribution: 60% to swapper as restitution, 30% to the iNFT current owner of the challenger's agent (per `OwnerRegistry.ownerOf(tokenId)`), 10% to protocol treasury
- The 30% challenger share is distributed via Reckon's own `RoyaltyDistributor.sol` contract on Base (~150 LoC, Reckon-native — ERC-7857 doesn't provide royalty logic). Royalty config keyed by tokenId

**Cross-chain owner read pattern:**
- Our off-chain relayer (already running for FR-3) also listens to `Transfer` events on `ChallengerNFT` (0G Galileo)
- On every transfer, the relayer calls `OwnerRegistry.attestOwner(tokenId, newOwner)` on Base from a permissioned EOA, AND writes to MongoDB `owner_attestations`
- `OwnerRegistry.ownerOf(tokenId)` returns the last attested owner with a freshness timestamp
- If `RoyaltyDistributor` queries `OwnerRegistry` and the freshness is stale (>24h), payout is queued (not blocked); the relayer re-attests on next iNFT event
- Trust assumption: same relayer that records fills is also trusted for owner attestations. Honest hackathon scoping; LayerZero/Wormhole is the production path

- Challenger bond is returned in full
- Solver's reputation is decremented by writing a `reputation_updates` document to MongoDB; CCIP-Read gateway serves the new value on next text record query
- The slash event is appended to the next batched 0G Storage Log file

**FR-7: ENS-native reputation feedback via CCIP-Read**
- Successful clean fills (no challenge submitted, or all challenges failed) within a 7-day rolling window automatically increment solver reputation
- Reputation update batched once per day via **KeeperHub schedule-triggered workflow (every 24h)**
- Updates are written to MongoDB's `reputation_updates` collection. The CCIP-Read gateway serves the latest values when external apps request text records
- Text record keys exposed via CCIP-Read: `reckon.reputation`, `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`, `reckon.bondLocked`
- **External apps resolve `bunni.solvers.reckon.eth` using standard ENS clients (viem, ethers, wagmi)** — the wildcard resolver redirects all reads to our gateway, which signs responses per ENSIP-10 + ERC-3668. Apps don't need to know any of this

**FR-8: Challenger agent — SKILL.md loop + TypeScript primitives + orchestrator**

The challenger agent is defined by a single `SKILL.md` file at the agent's repo root, which describes the full decision loop the agent follows on each `FillRecorded` event. The actual computation happens in 5 standalone TypeScript primitive scripts. A small orchestrator (`orchestrator.ts`, ~80-100 lines) implements the loop in code, executing primitives in sequence and routing outputs based on the rules described in `SKILL.md`.

**Project structure:**

```
agent/
├── SKILL.md                    # the agent's full loop, decisions, commands
├── orchestrator.ts             # main loop that follows SKILL.md
├── scripts/
│   ├── triage.ts              # 0G Compute suspicion scorer
│   ├── ebbo.ts                # deterministic benchmark math
│   ├── coordinate.ts          # AXL GossipSub broadcast + 0G Storage KV claim state
│   ├── decide.ts              # cost-benefit analysis (slash vs gas + risk)
│   └── submit.ts              # KeeperHub webhook trigger
└── package.json
```

**The 5 primitives:**

1. **`triage.ts`** — Inputs: `orderHash`. Reads fill data from MongoDB. Calls 0G Compute (Qwen3-32B) with a suspicion-scoring prompt. Outputs JSON: `{score: 0.0-1.0, reason: string}`. ~100 LoC.

2. **`ebbo.ts`** — Inputs: `tokenIn, tokenOut, fillBlock`. Reads `slot0` from 3 canonical Uniswap pools on Base via viem. Computes equal-weighted geometric mean (mirrors A's on-chain `EBBOOracle.sol`). Outputs JSON: `{benchmark: string}` in 1e18 precision. ~80 LoC.

3. **`coordinate.ts`** — Inputs: `orderHash, agentTokenId, action` (acquire/release/check). On `acquire`: broadcasts a claim message over AXL GossipSub, writes claim to 0G Storage KV. On `check`: queries 0G Storage KV for current claimer. On `release`: clears claim from KV. Outputs JSON: `{claimAcquired: bool, claimedBy: string}`. ~150 LoC.

4. **`decide.ts`** — Inputs: `slashAmount, gasEstimate, bondAtRisk`. Pure local logic — no network calls. Computes expected value of submitting the challenge. Outputs JSON: `{shouldChallenge: bool, reason: string}`. ~50 LoC.

5. **`submit.ts`** — Inputs: `orderHash, bond, agentTokenId`. Triggers the KeeperHub webhook workflow that calls `Challenger.submit()` on Base. Returns the txHash + success status. Outputs JSON: `{txHash: string, success: bool}`. ~80 LoC.

**The SKILL.md file** describes:
- **Trigger**: subscribed to `FillRecorded` events from `FillRegistry` on Base mainnet (via the relayer); on each event, run the loop
- **Step-by-step decision tree**: which command to run, what JSON output to expect, what to do based on each output
- **Failure handling**: what each primitive does when its dependency (0G Compute, MongoDB, AXL, KeeperHub) is offline
- **State**: where the agent reads its iNFT brain blob from on boot, where it writes outcomes

A judge reading SKILL.md once knows exactly what the agent does. Demo benefit: in the video, briefly show SKILL.md scrolling — judges see the entire agent's behavior in 10 seconds without parsing TypeScript.

**The orchestrator** is a thin executor (~80-100 lines):
- On each `FillRecorded` event, runs the 5 primitives in sequence per SKILL.md's decision tree
- Spawns each primitive as a child process with environment variables passed in
- Parses each primitive's stdout JSON
- Routes to the next step based on the rules in SKILL.md (which the orchestrator implements in code; SKILL.md is documentation of the same rules)

**iNFT-aware boot:** the orchestrator on startup reads the agent's iNFT (token ID via env var) from 0G Galileo, decrypts the brain blob via AES-256-GCM using the owner's signature as decryption key, and initializes its AXL Ed25519 keypair, EBBO threshold preferences, and KeeperHub `kh_` API key from the decrypted blob. This brain data is then exposed to the primitives via env vars when they're spawned.

**AXL nodes** built from `gensyn-ai/axl` source (Go 1.25.5+, no binary releases exist — pinned commit SHA). Three-node hub-and-spoke topology: one public Hetzner hub + Fly.io US spoke + Fly.io EU spoke. Each node runs its own copy of the agent (orchestrator + 5 primitives). The `coordinate.ts` primitive uses AXL's e2e Yggdrasil encryption to broadcast claims that intermediate nodes cannot read or modify.

**Each agent has its own `kh_`-prefixed KeeperHub API key** (encoded in the iNFT brain) to stay under the 60 req/min Direct Execution API limit.

**FR-9: 0G Compute usage — natural-language slash explanations + suspicion triage**
- The challenger agent uses **Qwen3-32B** (predefined 0G Compute model, 4 0G per million tokens; fallback to Qwen2.5-0.5B-Instruct) via `@0glabs/0g-serving-broker`
- Two real LLM use cases:
  1. **Suspicion triage** (`triage.ts` primitive): scores fills 0-1 on suspiciousness before running deterministic EBBO math. Used as a soft pre-filter — agent skips benchmark computation for low-suspicion fills, saving 0G Compute calls
  2. **Natural-language slash explanations**: when a slash executes, the LLM generates a human-readable summary for the dashboard
- **Concurrency constraint**: per-provider sub-account is serial. We provision 3 provider sub-accounts (one per AXL node) for parallel inference

**FR-10: Challenger agents as iNFTs (ERC-7857) on 0G Galileo**
- Each challenger agent is minted as an iNFT via Reckon's `ChallengerNFT` contract **deployed on 0G Galileo testnet (chain 16602)**. Faucet-funded
- Implementation forks `github.com/0gfoundation/0g-agent-nft` reference; ERC-7857 extends ERC-721 with `iTransferFrom()` requiring `AccessProof` + `OwnershipProof`
- For the demo, we ship with the **mock oracle** from the reference implementation
- The iNFT's metadata URI points to encrypted agent state on 0G Galileo Storage. Encryption: **AES-256-GCM with PBKDF2 key derivation (100k iterations)**. The brain blob contains: AXL Ed25519 keypair, EBBO threshold preferences, KeeperHub `kh_` API key, model config, performance history
- **Royalties are NOT inherited from ERC-7857** — Reckon's `RoyaltyDistributor.sol` (on Base) implements the split
- Ownership transfer: standard ERC-7857 mechanics on 0G Galileo. Earnings rights follow ownership atomically via `OwnerRegistry`

**FR-11: 0G Storage Log audit trail**
- Independent of MongoDB, all fills and slashes are batched and anchored to 0G Galileo Storage Log under a Reckon-owned namespace
- Batch size: N=50 records or 60s, whichever first. Anchored Merkle root emitted as `FillBatchAnchored` on Base
- Provides permanent off-chain audit trail. If MongoDB is wiped or unavailable, 0G Storage Log is the source of truth
- Writes via `@0gfoundation/0g-ts-sdk`

**FR-12: Optional paid workflow listing — `EBBOOracle.computeBenchmark()`**
- We list our `EBBOOracle.computeBenchmark()` view as a **KeeperHub paid workflow** at $0.005/call
- Settles via **x402 on Base USDC** OR **MPP on Tempo USDC.e**
- Auto-discoverable via x402scan and mppscan
- Earnings split into separate Base USDC and Tempo USDC.e creator balances on KeeperHub

**FR-13: MongoDB Atlas as read store + virtual subname source of truth**
- A free tier M0 Atlas cluster hosts collections for: `subnames`, `fills`, `challenges`, `slashes`, `reputation_updates`, `owner_attestations`, `fill_batches`
- The `subnames` collection is the source of truth for virtual ENS subnames. Documents include label, namespace (`solvers` or `challengers`), owner address, registration timestamp, current text records (reputation, totalFills, etc.)
- The relayer holds read-write credentials and writes events as they happen
- The dashboard, CCIP-Read gateway, and any external query tool hold separate read-only credentials
- Schema is duck-typed (TypeScript interfaces in shared package)

**FR-14: ENS wildcard resolver + CCIP-Read gateway**
- `ReckonWildcardResolver.sol` is deployed on **Ethereum mainnet**. Implements [ENSIP-10](https://docs.ens.domains/ensip/10) (wildcard resolution) and [ERC-3668](https://eips.ethereum.org/EIPS/eip-3668) (CCIP-Read)
- `reckon.eth`'s resolver is set to this contract via the standard ENS `setResolver` flow
- For ANY query against a subname under `reckon.eth`, the resolver reverts with `OffchainLookup` per ERC-3668, redirecting clients to our gateway URL
- **CCIP-Read gateway** (Builder A, Node.js):
  - Receives signed query requests from ENS clients
  - Looks up the queried subname in MongoDB `subnames` collection
  - Returns the requested record (address, text record, etc.) with a signature the resolver verifies on-chain
  - Gateway signing key is a permissioned EOA Reckon controls; trusted in the resolver contract
- Standard ENS clients (viem, ethers, wagmi) handle CCIP-Read transparently
- ~80 lines of Solidity + ~150 lines of Node.js. Reference: ENS Labs' `offchain-resolver-example` repo

### Non-functional requirements

**NFR-1: Gas budget**
- Validator's `validate()` call: ≤ 30k gas (view-only — namehash compute + SolverRegistry read + abi.decode)
- `FillRegistry.recordFill()` call (from relayer): ≤ 80k gas
- Challenge submission: ≤ 280k gas before KeeperHub multiplier; ≤ 420k post-multiplier on Base (1.5× default)
- **Note**: KeeperHub applies a 1.5× gas-limit multiplier on Base by default

**NFR-2: Adversarial robustness**
- Equal-weighted geometric mean: **no single Uniswap pool can move the benchmark by more than `1/sqrt(N)`** where N=3 canonical pools
- **AXL e2e encryption (Yggdrasil) means intermediate AXL nodes cannot read, censor, or modify claim broadcasts**
- Challenger collusion mitigated by AXL gossip + 0G Storage KV durable claim state + first-valid-challenge-wins
- Solver self-challenge prevented by requiring challenger subname namehash ≠ filler subname namehash at contract level
- Time-based attacks mitigated by tight 30-minute challenge window
- iNFT theft mitigated by ERC-7857 oracle-based transfer mechanics
- **Burst load**: tested for N=20 concurrent challenges in 60s; per-agent KeeperHub `kh_` keys keep us under 60 req/min cap
- **Virtual subname tampering**: CCIP-Read gateway signs responses with a key the resolver contract trusts. Tampered responses fail signature verification on Ethereum mainnet and revert. The trust boundary is the gateway signing key, which is held by Reckon (same trust assumption as the relayer)

**NFR-3: Failure modes documented**
- If EBBO oracle pool list is wrong/manipulated: documented multisig timelock recovery path
- If challenger bond depletes before slashing completes: revert, challenger loses bond
- If solver's bond is insufficient to cover full restitution: pay what's available, log shortfall, decrement reputation
- **If CCIP-Read gateway is offline**: ENS clients receive errors when resolving Reckon subnames. On-chain operations (slashing, etc.) are unaffected. Mitigation: gateway is a small Node.js service; `make redeploy-gateway` script for fast recovery
- If 0G Galileo Storage is unavailable: agents fall back to local cache; iNFT transfer still works
- **If the relayer is offline**: fills are not recorded → challenges cannot be opened. Mitigation: redundant relayer instances; permissionless backfill is future work
- **If MongoDB Atlas is offline**: dashboard, CCIP-Read gateway, and virtual subname resolution all go down. On-chain state is unaffected; relayer continues recording fills to chain. Mitigation: 0G Storage Log batches give us permanent audit trail; pre-record key demo moments
- **If iNFT oracle is offline**: transfers pause, but bounty payouts to current owner still resolve via `OwnerRegistry` cached value
- **If `OwnerRegistry` attestation is stale**: the slash itself still executes; only the 30% iNFT-owner payout is queued for retry
- **If public AXL hub (Hetzner) goes down**: spokes cannot bootstrap from cold start. `make redeploy-hub` script
- **If 0G Compute is offline (`triage.ts` fails)**: SKILL.md specifies fallback — orchestrator treats triage score as 0.5 (suspicious enough to compute EBBO) and continues. Slash explanation falls back to a templated string
- **If individual primitive scripts crash**: orchestrator catches non-zero exit codes, logs to MongoDB `agent_errors` collection, exits gracefully on the current event and resumes on the next
- **Multi-output orders**: rejected in v1, relayer skips with warning
- **If Anvil fork RPC endpoint is rate-limited or down**: dev work pauses but production is unaffected. Backup RPC endpoint configured

**NFR-4: Observability**
- Every fill, challenge, slash, reputation update, iNFT transfer, royalty distribution, owner attestation, and subname registration emits an indexed event AND a corresponding MongoDB document
- 0G Galileo Storage Log provides permanent audit trail independent of MongoDB
- Public dashboard reads MongoDB directly with read-only credentials, displays per-solver track record by ENS name
- **KeeperHub Runs panel** is the primary debugging surface during the demo
- Primitive script outputs are logged to MongoDB `agent_runs` collection for auditability — every step's input, output, and decision is preserved

### Contracts and architecture

```
                    ┌───────────────────────┐
                    │   Ethereum Mainnet    │
                    │   (chain 1)           │
                    └──────────┬────────────┘
                               │
                               ▼
                    ┌──────────────────────────────┐
                    │  reckon.eth                  │
                    │  resolver →                  │
                    │                              │
                    │  ReckonWildcardResolver      │
                    │  (NEW, ENSIP-10 + ERC-3668)  │
                    │  - all subname queries fail  │
                    │    with OffchainLookup       │
                    │  - clients follow to gateway │
                    └──────────┬───────────────────┘
                               │ CCIP-Read
                               ▼
                    ┌──────────────────────────────┐
                    │  CCIP-Read Gateway           │
                    │  (NEW, Node.js, Builder A)   │
                    │  - reads MongoDB             │
                    │  - signs responses           │
                    │  - serves text records       │
                    │  - serves addr records       │
                    └──────────┬───────────────────┘
                               │
                               ▼
                       MongoDB Atlas
                   (subnames + events)

                    ┌───────────────────────┐
                    │   Base Mainnet        │
                    │   (chain 8453)        │
                    │   [or Anvil fork      │
                    │    during dev]        │
                    └──────────┬────────────┘
                               │
    ┌──────────────────────────┼───────────────────────────────────┐
    │                          │                                   │
    │  UniswapX                │ (real Uniswap-deployed)           │
    │  PriorityOrderReactor ───┼──► ReckonValidator                │
    │  0x00000000...De729      │     (NEW, view-only gating        │
    │                          │      via SolverRegistry read)     │
    │              emits Fill event                                │
    │                          │                                   │
    └──────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────────────────┐
                    │  Reckon Relayer         │
                    │  (NEW, off-chain, Builder A)    │
                    │  - subscribes to Fill events    │
                    │  - calls recordFill on Base     │
                    │  - listens to NFT Transfer      │
                    │    on 0G Galileo                │
                    │  - calls attestOwner on Base    │
                    │  - 0G Storage Log batching      │
                    │  - handles subname registration │
                    │  - WRITES events to MongoDB     │
                    └────────┬────────────┬───────────┘
                             │            │
                             ▼            ▼
              Base mainnet contracts    MongoDB Atlas
                                              │
                                              ▼
                                       Dashboard
                                       (read-only)

    ┌──────────────────────────────────────────────────────────────┐
    │                                                              │
    │   FillRegistry ──► Challenger ──► EBBOOracle                 │
    │   (NEW)            (NEW)          (NEW: 3 pools,             │
    │                    │              equal-weighted             │
    │                    │              geom mean)                 │
    │                    │                                         │
    │                    ▼                                         │
    │   SolverBondVault ──► RoyaltyDistributor ──► OwnerRegistry   │
    │   (NEW: namehash       (NEW: 60/30/10           (NEW)        │
    │   keying)              split)                                │
    │                                                              │
    │   SolverRegistry        ChallengerRegistry                   │
    │   (NEW: namehash        (NEW: namehash list,                 │
    │   list, relayer-        relayer-attested)                    │
    │   attested)                                                  │
    │                                                              │
    └──────────────────────────────────────────────────────────────┘

                    ┌──────────────────────┐
                    │  0G Galileo Testnet  │
                    │  (chain 16602)       │
                    └─────────┬────────────┘
                              │
                              ▼
                    ┌──────────────────────────────┐
                    │  ChallengerNFT               │
                    │  (NEW, ERC-7857 forked       │
                    │  from 0g-agent-nft)          │
                    │  - encrypted brain on        │
                    │    0G Storage (AES-256-GCM)  │
                    │  - emits Transfer events     │
                    │    consumed by relayer       │
                    └──────────────────────────────┘

Off-chain (no chain dependency):
┌─────────────────────────────────────────────────────────────────┐
│ Challenger Agent Swarm (NEW: SKILL.md + 5 primitives + orch.)   │
│  - 3 nodes: Hetzner hub + Fly.io US + Fly.io EU                 │
│                                                                 │
│  Each node runs:                                                │
│   ├── SKILL.md            (the loop, decisions, commands)       │
│   ├── orchestrator.ts     (~80 LoC, executes loop)              │
│   └── scripts/                                                  │
│       ├── triage.ts       (0G Compute Qwen3-32B suspicion)      │
│       ├── ebbo.ts         (deterministic geom mean math)        │
│       ├── coordinate.ts   (AXL GossipSub + 0G Storage KV)       │
│       ├── decide.ts       (cost-benefit pure logic)             │
│       └── submit.ts       (KeeperHub webhook trigger)           │
│                                                                 │
│  - each agent IS an iNFT; reads brain from 0G Galileo Storage   │
│  - subscribes to FillRecorded on Base (or Anvil fork during dev)│
│  - AXL (Yggdrasil + TLS): Ed25519 identity, Go 1.25.5+ build    │
│  - GossipSub-pattern channel forked from examples/gossipsub     │
│  - shared claim state on 0G Galileo Storage KV                  │
│  - challenges submitted via KeeperHub webhook workflow          │
│  - slash bounty (30%) routes to current iNFT owner via          │
│    OwnerRegistry on Base                                        │
└─────────────────────────────────────────────────────────────────┘

Shared dev infrastructure:
┌─────────────────────────────────────────────────────────────────┐
│ Hetzner-hosted long-running Anvil fork of Base mainnet          │
│  - exposes JSON-RPC for AXL spokes during integration testing   │
│  - bootstrap script deploys all contracts                       │
│  - resets manually or on schedule (rare)                        │
└─────────────────────────────────────────────────────────────────┘
```

**Contract count:** 10 new Solidity contracts. 8 deployed to Base mainnet, 1 (`ChallengerNFT`) deployed to 0G Galileo testnet, 1 (`ReckonWildcardResolver`) deployed to Ethereum mainnet. ~2400-2900 lines total.

**Off-chain code count:** relayer (~400 LoC), CCIP-Read gateway (~150 LoC), challenger agent (SKILL.md + orchestrator + 5 primitives, ~500 LoC total), dashboard (~600 LoC), KeeperHub skill pack (~300 LoC), AXL helper package (~150 LoC). All TypeScript except the AXL Go binary.

**Out of scope for hackathon:**
- Multi-output orders (rejected in v1; outputs.length must equal 1)
- Permissionless `recordFill` via fill-receipt proofs (relayer is permissioned in v1)
- Production iNFT oracle (TEE/ZKP) — we ship with mock oracle from reference impl
- Trustless cross-chain owner read via LayerZero/Wormhole — we use relayer-attested `OwnerRegistry`
- Cross-chain UniswapX challenges
- ERC-8004 ReputationRegistry integration — virtual ENS subnames are the external identity layer
- Uniswap Trading API integration
- Reputation aggregation function tuning beyond a simple decay model
- Real solver onboarding at scale (we run our own demo solver + 2 challenger iNFTs)
- Full 24-hour adversarial attack simulation (compressed to 4-hour smoke test)
- Deployment to additional chains
- Subgraph deployment — replaced by MongoDB Atlas
- Durin / Namestone integration — replaced by ENS wildcard resolver + CCIP-Read

---

## Phase-wise plan

Two builders. Online format = 4 calendar weeks. **Net change vs v0.8: ~-2 hours total** (5 small standalone primitives are easier to write than a single monolithic agent loop).

Hours summary:

| Builder | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Total |
|---|---|---|---|---|---|---|
| **A** | ~6 | ~38 | ~32 | ~30 | ~22 | ~128 |
| **B** | ~6 | ~28 | ~32 | ~28 | ~18 | ~112 |

### Phase 0 — Setup (Day 1, both builders, ~6 hours each)

**Both:**
- Pin a single shared notion/repo with: spec (this doc), open questions, daily standup notes
- **Decide chain/dev setup: Anvil-forked Base mainnet for development; real Base mainnet for Phase 4 deploy.** Plus Ethereum mainnet for `reckon.eth` + `ReckonWildcardResolver`
- Decide Solidity version: 0.8.26 (matches UniswapX, v4)
- Run `forge init`, set up CI (GH Actions, lint + test on every push)
- Both run `anvil --fork-url <BASE_MAINNET_RPC>` locally and confirm they can read `PriorityOrderReactor` state

**Builder A specifically (Day 1, ~5 hours):**
- **Acquire `reckon.eth`** on Ethereum mainnet via app.ens.domains. Two transactions, 60s wait. ~$25-50. Set resolver to "Public Resolver" temporarily
- **Set up MongoDB Atlas free tier (M0) cluster.** Configure two users: `relayer` (read-write) and `consumer` (read-only). Get connection strings. ~30 minutes
- **Look up current top-3 USDC/WETH pools by TVL on Base mainnet** for the EBBO oracle's initial canonical list
- Write `BootstrapAnvilFork.s.sol` skeleton
- **Generate a `kh_`-prefixed organisation API key** at app.keeperhub.com. Confirm Base mainnet selected. Test `claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp`
- Read ENS docs sections on [ENSIP-10 wildcard resolution](https://docs.ens.domains/ensip/10) and [CCIP-Read gateway implementation](/resolvers/ccip-read#writing-a-gateway). Skim ENS Labs' `offchain-resolver-example` repo

**Builder B specifically (Day 1, ~5 hours):**
- **Build AXL from source** on Hetzner and Fly.io US + EU (Go 1.25.5+ required). Generate Ed25519 identity key per node via OpenSSL. Pre-compute peer TLS addresses
- **Pin AXL to a specific commit SHA** in CI
- Confirm `@0gfoundation/0g-ts-sdk` and `@0glabs/0g-serving-broker` install cleanly
- Confirm Qwen3-32B is responding on 0G Galileo via the serving broker
- **Verify ERC-7857 reference deploys cleanly on 0G Galileo** at `github.com/0gfoundation/0g-agent-nft`. Mock oracle path works
- **Fund 0G Galileo wallet via `https://faucet.0g.ai`** — drip-fund Days 1-3
- **Set up long-running Anvil fork on Hetzner hub.** Becomes shared dev environment for AXL spokes in Phase 2
- **Draft initial SKILL.md** for the challenger agent: trigger, the 5 steps, expected JSON contracts for each primitive, failure handling. Won't be final but gets the loop on paper before writing any code

### Phase 1 — Core contracts + view-only validator + relayer + benchmark + ENS wildcard resolver + MongoDB + agent scaffold (Week 1)

**Builder A (~38 hours):**

Day 2: Write `ReckonValidator.sol` (~50 lines).

Day 2-3: Write `SolverRegistry.sol` and `ChallengerRegistry.sol` (~30 LoC each).

Day 3-4: Write `FillRegistry.sol`.

Day 4-5: **Write `ReckonWildcardResolver.sol`** (Ethereum mainnet target, ~80 lines).

Day 5-6: Write `EBBOOracle.sol`. Tests run against real pool state on Anvil-forked Base mainnet.

Day 6: Write `SolverBondVault.sol` — keyed by namehash.

Day 6-7: **Build the relayer** (~10 hours). TypeScript + viem + Bun. Subscribes to UniswapX `PriorityOrderReactor.Fill` events. Handles subname registration. Skips multi-output orders. Batches fills to 0G Galileo Storage Log.

**Defines MongoDB schema** (TypeScript interfaces in `@reckon-protocol/types`).

Foundry test targets for Phase 1: ≥ 80% line coverage on each contract.

**Builder B (~28 hours, was 30 in v0.8):**

Day 2-3: Set up challenger agent project. Repo skeleton: `agent/` with `SKILL.md`, `orchestrator.ts`, `scripts/`. Stub out the 5 primitive files with `// TODO` placeholders that print expected JSON shapes. SKILL.md is fleshed out from the Phase 0 draft.

Day 3-5: **iNFT brain blob writer**:
- AES-256-GCM encryption with PBKDF2 (matches ERC-7857 reference)
- Brain blob schema: `{axl_ed25519_secret, ebbo_threshold_prefs, kh_api_key, model_config, performance_history}`
- Upload to 0G Galileo Storage via `@0gfoundation/0g-ts-sdk`

Day 5-6: **Write `triage.ts` and `ebbo.ts` primitives** (~180 LoC combined):
- `triage.ts`: 0G Compute (Qwen3-32B) suspicion scorer using `@0glabs/0g-serving-broker`. Reads fill from MongoDB. Outputs JSON
- `ebbo.ts`: Deterministic equal-weighted geometric mean across 3 Base mainnet Uniswap pools using viem. Outputs JSON

Day 6-7: **Write `decide.ts` and `submit.ts` primitives, scaffold `coordinate.ts`** (~130 LoC combined):
- `decide.ts`: Pure local cost-benefit logic, no network calls. Outputs JSON
- `submit.ts`: Triggers KeeperHub webhook workflow (the workflow itself is built by Builder A in Phase 2). Outputs JSON
- `coordinate.ts`: Scaffold only; the AXL GossipSub + 0G Storage KV integration completes in Phase 2 when AXL is set up

Day 7: **Write `orchestrator.ts`** (~80 LoC). On `FillRecorded` events from MongoDB, runs the 5 primitives in sequence per SKILL.md's decision tree. Each primitive is spawned as a child process. Logs every step's IO to MongoDB `agent_runs`.

End of Week 1 milestone: A's contracts deploy on Anvil-forked Base mainnet. A's `ReckonWildcardResolver` deployment plan ready (actual mainnet deploy in Phase 2). A's relayer subscribes to real `PriorityOrderReactor` events on Anvil. B's agent has SKILL.md + 4 working primitives (`coordinate.ts` scaffolded), and the orchestrator can drive a fill through to a "would-decide-to-challenge" decision.

### Phase 2 — Challenge mechanism + AXL mesh + CCIP-Read gateway + 0G Storage + complete agent (Week 2)

**Builder A (~32 hours):**

Day 8-9: Write `Challenger.sol`. Verify ChallengerRegistry registration, deadline, no self-challenge, bond size, agentTokenId ownership via `OwnerRegistry`. Pull challenger USDC bond via Permit2.

Day 10: Write `OwnerRegistry.sol` (~50 LoC).

Day 11: Write `RoyaltyDistributor.sol` (~150 LoC). 60/30/10 split with cross-chain owner read via `OwnerRegistry`.

Day 12-13: **CCIP-Read gateway** (~12 hours). Node.js + Express. Receives queries per ERC-3668 spec. Looks up subname in MongoDB `subnames` collection. Returns address records and text records signed by Reckon's permissioned key. Reference: ENS Labs' `offchain-resolver-example` repo.

Day 13: **Deploy `ReckonWildcardResolver` to Ethereum mainnet.** Update `reckon.eth`'s resolver. Test resolution end-to-end with viem from a fresh client.

Day 12-13: **KeeperHub workflow PoC**:
- Webhook-triggered workflow that calls `Challenger.submit(...)` with retry logic. This is the workflow `submit.ts` triggers
- Schedule-triggered workflow (24h) that runs the reputation update batch (writes to MongoDB)
- Confirm Turnkey signing works on Base Sepolia / Anvil fork

Day 14: End-to-end Foundry test against Anvil-forked Base mainnet (real `PriorityOrderReactor` → ReckonValidator → relayer → FillRegistry → Challenger → SolverBondVault slash → RoyaltyDistributor → MongoDB reputation update → CCIP-Read query). Target 90%+ coverage.

**Builder B (~32 hours):**

Day 8-9: **Complete `coordinate.ts`** (~150 LoC). AXL GossipSub broadcast for claim acquisition; 0G Storage KV writes for durable claim state. The full pattern: agent claims an orderHash → gossips claim message over AXL → other agents back off for 30s → if claimer fails to submit, second agent retries.

Day 9-10: **Wire the agent to `FillRecorded` events on Anvil-forked Base mainnet**. Orchestrator listens via viem websocket, runs the SKILL.md loop on each event. Test against the long-running Hetzner Anvil fork.

Day 10-11: **3-node AXL mesh setup**:
- Verify Hetzner hub + Fly.io US + Fly.io EU all connect via Yggdrasil
- **Fork AXL `examples/gossipsub`** — swap message format to `{orderHash, agentTokenId, claimedAt, deadline}`. Define backoff (30s) and timeout (60s)
- Verify cross-region peer connectivity over Yggdrasil
- Verify all 3 spoke agents subscribe to `FillRecorded` events from Hetzner-hosted Anvil fork
- Document `make redeploy-hub` script

Day 12: **0G Galileo Storage KV integration in `coordinate.ts`** — single protocol-wide `streamId` for `claim_state`. AXL gossip first, KV durable backup.

Day 13: **0G Storage Log integration** — implement batching service inside the relayer (Builder A's component, but Builder B coordinates on the 0G Storage Log usage). Upload batch files via the 0G `indexer` SDK client's `upload()` method, capture root hash, emit `FillBatchAnchored`.

Day 14: **Dashboard MongoDB integration**. Wire dashboard to read from MongoDB Atlas via read-only credentials. Show real-time fill feed + recent challenges. Resolve solver namehashes back to subname strings via MongoDB lookup for display.

End of Week 2 milestone: full happy path works end-to-end on Anvil-forked Base mainnet. A swap with bad price gets challenged automatically — orchestrator runs through SKILL.md's 5 steps, AXL GossipSub coordinates 3-node swarm via `coordinate.ts`, KeeperHub webhook (built by A) submits via `submit.ts`, RoyaltyDistributor splits via OwnerRegistry-attested owner, swapper restitution, MongoDB reputation update, CCIP-Read gateway serves new value to external apps. Anyone resolving `bunni.solvers.reckon.eth` via viem gets live data.

### Phase 3 — iNFT layer + adversarial testing + KeeperHub skill pack (Week 3)

**Builder A (~30 hours):**

Day 15-17: **Deploy `ChallengerNFT.sol` on 0G Galileo**, forking `github.com/0gfoundation/0g-agent-nft`. `Transfer` events consumed by relayer to update `OwnerRegistry` on Base + MongoDB.

Day 17-18: **`@reckon-protocol/keeperhub-skills` skill pack** (~300 LoC):
1. `challenger-submit-webhook` — webhook trigger → call `Challenger.submit()` with retry/gas estimation
2. `reputation-flush-schedule` — daily schedule → batch reputation updates into MongoDB
3. `fill-audit-query` — manual trigger → query 0G Storage Log batch by root hash
4. `paid-ebbo-oracle-listing` — paid workflow listing for `EBBOOracle.computeBenchmark()` ($0.005/call, x402+MPP dual-protocol)
5. `discord-slash-notification` — webhook on slash → format message → post to Discord

Day 19: **CCIP-Read gateway hardening**:
- Add `resolve.reckon.fi` standalone web tool — takes any solver address, displays ENS-resolved reputation
- Add caching layer (in-memory, 30s TTL)
- Stress test: 100 concurrent CCIP-Read requests

Day 20: Adversarial Foundry tests + agent stress tests:
- Insufficient bond, deadline expired, challenger without subname registration, self-challenge edge cases (via namehash comparison)
- EBBO oracle equal-weighted geometric mean dampens against manipulated pool data
- iNFT transferred mid-challenge: royalty queued via `OwnerRegistry` freshness
- **Agent primitive failures**: `triage.ts` 0G Compute timeout, `ebbo.ts` RPC failure, `coordinate.ts` AXL partition, `submit.ts` KeeperHub webhook failure. Verify orchestrator handles each per SKILL.md's failure rules
- Burst load: N=20 simultaneous challenges in 60s, no `kh_` rate-limit violations
- Multi-output order rejection
- **Wildcard resolver tests** (on Anvil-forked Ethereum mainnet)

Day 21: Write **mechanism design analysis** doc (~500 words). Polish contracts. NatSpec on every public function. Run `slither` and `mythril`.

**Builder B (~28 hours):**

Day 15-16: **iNFT-aware agent runtime polish in orchestrator**:
- Boot sequence: read iNFT → decrypt brain blob → init AXL keypair / EBBO prefs / `kh_` key
- Pass brain data to primitives via env vars when spawning
- Performance history written back to brain on graceful shutdown

Day 17-18: **`@reckon-protocol/axl-claim-broadcast` helper package** (~150 LoC). Wraps the GossipSub fork pattern for use in `coordinate.ts` and externally. Mirrors the KeeperHub skill pack pattern for Gensyn — strengthens the meta-pitch.

Day 19-20: **Dashboard polish**:
- Real-time feed from MongoDB
- Charts of solver reputation over time
- Challenger leaderboard sorted by iNFT bounty earnings
- iNFT marketplace view
- Packet-capture demo prep for AXL TLS+Yggdrasil layers
- KeeperHub Runs panel embedded in debug pane
- All solvers display by ENS subname
- **Agent runs panel** showing the 5-step decision tree per fill (which primitive ran, what it returned, what the orchestrator decided)

Day 20-21: **4-hour attack smoke test** on Anvil-forked Base mainnet. Two demo solvers (one honest, one griefer). Run challenger agent for 4 hours. Document results for demo video.

End of Week 3 milestone: protocol is adversarially tested. ChallengerNFT minted on 0G Galileo. KeeperHub skill pack and AXL helper published. CCIP-Read gateway serves live reputation; `resolve.reckon.fi` works end-to-end. Dashboard polished with agent runs panel. SKILL.md is the single readable spec for the agent's behavior.

### Phase 4 — Mainnet deploy + demo + polish (Week 4)

**Builder A (~22 hours):**

Day 22-23: Run `DeployBaseMainnet.s.sol` against **real Base mainnet**. Deploys all 8 Base contracts.

Day 23: **Deploy `ChallengerNFT` on 0G Galileo**. Mint 2 demo challenger iNFTs.

Day 24: **Verify `ReckonWildcardResolver` is live on Ethereum mainnet** (deployed in Phase 2). Resolve a test subname end-to-end via viem.

Day 24: **Configure relayer for real Base mainnet** (one config line change).

Day 24-25: Recruit at least one external solver. Backup: run two of our own.

Day 25-26: **Mainnet smoke test.** Trigger a low-quality fill, demonstrate slashing, watch cross-chain royalty payout via `OwnerRegistry`.

Day 26: **Final ENS demo flourish — `resolve.reckon.fi`** polish.

Day 26-27: **AI-generated workflow demo clip.** 30 seconds of footage.

Day 27: KeeperHub feedback file. $500 bounty.

**Builder B (~18 hours):**

Day 22-23: **Demo video script + recording.** Strict 2-minute target:
- 0:00-0:15: The problem
- 0:15-0:35: Solution architecture — show the hybrid topology, virtual subname identity (ENS hit #1)
- 0:35-0:55: **SKILL.md scrolling** (10 seconds) — show the agent's complete decision loop in markdown. "Here's the agent's behavior in one file." Followed by 5 seconds of architecture-narration showing the 5 primitive scripts running
- 0:55-1:20: Live bad fill demo — packet capture showing TLS + Yggdrasil layers between AXL nodes, KeeperHub webhook submits via `submit.ts`, slash executes, MongoDB reputation update propagates to CCIP-Read (Gensyn + KeeperHub + ENS hits)
- 1:20-1:40: iNFT moment — show iNFT on 0G Galileo explorer, transfer to second wallet, relayer attests new owner, next bounty redirects (0G Track B hit)
- 1:40-1:55: Third-party app resolving `bunni.solvers.reckon.eth` via viem (ENS creative track hit)
- 1:55-2:00: What's next

Day 24-25: Write final README. Cover: motivation, architecture (with hybrid topology diagram), contract addresses across three chains, virtual ENS subname mechanics, iNFT mechanics, **the SKILL.md-defined agent loop** (link to it directly in the README), MongoDB schema, KeeperHub skill pack, AXL helper, security considerations, known limitations, FAQ.

**Dependencies section in README must note:**
- UniswapX (`github.com/Uniswap/UniswapX`) is GPL-3.0; Reckon stays at the interface boundary
- Permit2 canonical address `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- ERC-7857 reference at `github.com/0gfoundation/0g-agent-nft`
- ENS wildcard resolver pattern: ENSIP-10 + ERC-3668; reference: ENS Labs' `offchain-resolver-example`
- MongoDB Atlas free tier M0 cluster
- OpenClaw-style SKILL.md pattern (the agent's behavior spec)

Day 26: **Sponsor README sections**.

Day 27: Final QA pass on dashboard, agent runtime (orchestrator + 5 primitives + SKILL.md), AXL mesh stability, CCIP-Read gateway response signing.

Day 28: Final submission. ETHGlobal portal, all GitHub repos public, demo video uploaded, contract addresses verified across 3 chains, dashboard live, virtual subnames registered (in MongoDB), iNFTs minted on 0G Galileo, KeeperHub feedback submitted, paid EBBO oracle listing live on x402scan + mppscan.

End of Week 4 milestone: shipped, demoable, with the Base mainnet integration real and the 0G Galileo testnet integration honest. Ethereum mainnet wildcard resolver makes virtual subnames resolve everywhere via standard ENS clients. At least one external participant. Two open-source helper packages published. Agent behavior fully documented in a single SKILL.md.

### Bonus items if you have spare bandwidth

In rough priority order:
1. **`OrderQuoter` integration** in dashboard (Builder A, ~1 hour)
2. **Permissionless `recordFill`** via fill-receipt proofs (Builder A, ~8-10 hours)
3. **REE integration** for deterministic dispute replay (Builder B, ~6 hours)
4. **iNFT marketplace stub** (Builder B, ~4 hours)
5. **ENS DAS integration** (Builder A, ~3 hours)
6. **Cross-chain challenges**
7. **Insurance fund layer**
8. **`@reckon-protocol/sdk`** — TypeScript SDK letting anyone build a challenger from scratch

### Scoping note for in-person 72-hour format

If this is in-person 72h instead of online 4 weeks, cut as follows:
- Keep Phases 0, 1, 2 in full (~36 hours)
- **Cut iNFT layer entirely.** Use ERC-721 with metadata pointing to 0G Galileo Storage. Frame as "iNFT-pattern" — saves ~14 hours
- **Cut OwnerRegistry** — without iNFTs, owner is just `msg.sender`
- Skip `RoyaltyDistributor` complexity — make it a simple 60/30/10 to fixed addresses
- Skip `ReckonWildcardResolver` deploy to Ethereum mainnet — use Base Sepolia ENS testnet for a "demonstration of pattern" (loses ENS bounty fit, saves ~3h)
- **Keep SKILL.md + 5 primitives — this is small and high-signal even in compressed format**
- Skip Phase 3's mechanism-design doc
- Skip the standalone `resolve.reckon.fi` demo tool, the AI workflow generation clip, and `@reckon-protocol/axl-claim-broadcast`
- Mainnet deploy → Anvil fork only with a clear "this is mainnet-ready, here's the deploy script"
- Total: ~50 hours per builder = aggressive but feasible

---

## Pre-build checklist (do before Phase 0)

- [ ] **Confirm a Base mainnet RPC endpoint that supports fork-mode methods** (Alchemy, QuickNode both do)
- [ ] **Confirm `vm.createSelectFork()` works** in a hello-world Foundry test against the chosen Base mainnet RPC
- [ ] **Confirm UniswapX `IValidationCallback` interface** can be imported from `github.com/Uniswap/UniswapX` (interface only, source is GPL-3.0)
- [ ] **Confirm KeeperHub supports Base mainnet** (it does per FAQ)
- [ ] **Confirm 0G Galileo testnet has Qwen3-32B endpoint live** and we have a funded provider account
- [ ] **Confirm ERC-7857 reference implementation deploys cleanly on 0G Galileo** at `github.com/0gfoundation/0g-agent-nft`
- [ ] **Confirm `reckon.eth` is available on ENS mainnet.** If not, fallback in order
- [ ] **Set up MongoDB Atlas free tier cluster.** Configure read-write user (relayer) and read-only user (consumers)
- [ ] Generate a `kh_`-prefixed organisation API key at app.keeperhub.com. Test MCP transport
- [ ] **Confirm `gensyn-ai/axl` builds from source** with Go 1.25.5+ on Hetzner and both Fly.io regions
- [ ] **Pin Permit2 canonical address** `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- [ ] **Look up current top-3 USDC/WETH pools on Base mainnet by TVL**
- [ ] Read the entire UniswapX docs section on `additionalValidationContract`
- [ ] Read the ERC-7857 spec and the `0g-agent-nft` reference implementation
- [ ] **Read [ENSIP-10](https://docs.ens.domains/ensip/10) and [ERC-3668](https://eips.ethereum.org/EIPS/eip-3668)** carefully
- [ ] Read KeeperHub `ai-tools/mcp-server.md`, `ai-tools/agentic-wallet.md`, `workflows/paid-workflows.md`
- [ ] Read AXL's tech page and `gensyn-ai/axl` README
- [ ] **Draft the agent's SKILL.md before writing any code** — the loop and decisions on paper first

If any checkbox can't be confirmed in Day 1, raise the flag immediately and re-scope.

---

## Risks I am still uncertain about

Honest list, ranked by severity. **Risk landscape vs v0.8: roughly stable, slightly improved on agent runtime risk because individual primitives are easier to test in isolation than a monolithic loop.**

**1. Relayer reliability (HIGH severity, MEDIUM probability).** The relayer is the hinge of the entire system. Mitigation: redundant relayer instances; idempotent operations.

**2. CCIP-Read gateway as central read path (HIGH severity, LOW-MEDIUM probability).** All ENS resolution for Reckon subnames flows through the gateway. Mitigation: small Node.js service, easy to redeploy; pre-record key demo moments.

**3. AXL pre-release version churn (MEDIUM severity, MEDIUM probability).** Pin commit SHA in CI.

**4. Anvil fork RPC rate-limiting / availability (MEDIUM severity, LOW-MEDIUM probability).** Backup RPC endpoint configured.

**5. AXL public hub bootstrap dependency (MEDIUM severity, LOW probability).** `make redeploy-hub` script.

**6. ENSIP-10 + ERC-3668 implementation correctness (MEDIUM severity, MEDIUM probability).** ENS Labs' reference repo as guide.

**7. 0G Compute per-provider serial concurrency (MEDIUM severity, MEDIUM probability).** 3 sub-accounts gives N=3 parallelism. Triage primitive's failure mode (treat score as 0.5) ensures the system doesn't block on Compute outages.

**8. iNFT oracle (mock vs real) for production claim (LOW-MEDIUM severity, LOW probability).** Mock oracle from reference, documented in README.

**9. Recruiting external solver (MEDIUM severity, HIGH probability).** Backup plan with two of our own solvers.

**10. KeeperHub gas multiplier compatibility (LOW severity, LOW probability).** Verify in Phase 1.

**11. Multi-output order edge case (LOW severity, MEDIUM probability).** Reject in v1, relayer skips with warning.

**12. AXL conference Wi-Fi stability (LOW severity, LOW probability).** Yggdrasil's NAT/firewall traversal handles it.

**13. Anvil fork state ephemerality (LOW severity, MEDIUM probability).** `BootstrapAnvilFork.s.sol` re-deploys in ~5 min.

**14. MongoDB Atlas as third-party uptime dependency (LOW severity, LOW probability).** Atlas free tier reasonable uptime. Pre-record key demo moments.

---

## What this submission wins, realistically

Honest expected-value breakdown by sponsor:

- **ENS Integration prize ($1,250 1st):** medium-high probability of placing 1st-3rd. Virtual subnames + reputation in CCIP-Read responses + bond keying by namehash hits the bounty's "ENS doing real work" criterion squarely. Expected: $750-$1,250
- **ENS Creative prize ($1,250 1st):** medium-high probability. CCIP-Read gateway serving virtual subnames + `resolve.reckon.fi` external demo + virtual subnames as access control hits multiple creative angles. Expected: $1,000-$1,250
- **0G Track B ($7,500 split across 5 winners at $1,500):** medium-high probability. Expected: $1,500-$3,000
- **Gensyn ($5,000 ranked pool):** medium probability. Expected: $1,000-$2,500
- **KeeperHub ($4,500 ranked pool + $500 feedback):** high probability. Expected: $1,500-$3,000
- **ETHGlobal Finalist pool:** independent of sponsors. Expected: $0-$5,000

**Aggregate expected prize value:** $5,750-$22,000 with central tendency around **$12,500-$15,500**.

The SKILL.md pattern is also a quiet credibility signal across all sponsors — judges who scroll through GitHub will see one markdown file documenting the entire agent's behavior. That's much better than a 500-line monolithic agent loop they have to reverse-engineer.

---

## Changelog from v0.9

### Terminology cleanup: "indexer" renamed to "relayer" throughout
- The off-chain service that subscribes to chain events, calls contract functions, and writes to MongoDB was previously called "indexer" or "indexer/relayer" in the spec. This was a vestigial name from earlier spec versions that briefly considered a subgraph
- The service does NOT do GraphQL-style entity indexing. It is a relayer in the literal sense: it relays chain events into MongoDB writes and contract-side attestations
- All 28 references to "indexer" in v0.9 have been renamed to "relayer"
- Two correct uses of "indexer" preserved: the 0G Storage SDK exposes a client called `indexer` (`@0gfoundation/0g-ts-sdk` API surface). Method calls like the 0G `indexer.upload()` / `indexer.download()` keep their SDK names

### Net work change vs v0.9
- Zero. This is purely a documentation refactor. No architectural changes
- ENS implementation guide updated to match (relayer, not indexer)

### EV change
- Neutral. Same architecture, clearer naming

---

## Changelog from v0.8

### Agent architecture: monolithic OpenClaw runtime → SKILL.md + 5 standalone TypeScript primitives + thin orchestrator
- **Single `SKILL.md` at agent root** describes the full decision loop: trigger, 5 steps, expected JSON contracts, failure handling. This file is the readable specification of what the agent does
- **5 standalone TypeScript primitives** (`triage.ts`, `ebbo.ts`, `coordinate.ts`, `decide.ts`, `submit.ts`) — each is a small focused script with clear inputs and outputs
- **Thin orchestrator** (~80-100 LoC) executes the loop in code by spawning primitives as child processes and routing outputs per SKILL.md rules
- iNFT brain blob still drives orchestrator boot; brain values exposed to primitives via env vars
- New observability: `agent_runs` MongoDB collection logs every step's input/output/decision for full auditability
- New "Agent runs panel" in the dashboard displays this for the demo

### Why this is better
- Each primitive is independently testable (smaller surface, clear contracts)
- A judge reading SKILL.md once knows what the agent does without reading TypeScript
- Demo video gets a 10-second SKILL.md scroll — high-signal, low-effort
- Failure isolation: if `coordinate.ts` is broken, `triage.ts` and `ebbo.ts` keep working; orchestrator catches and logs per-step
- Aligns with OpenClaw's documented patterns without requiring an OpenClaw runtime dependency

### Net work change vs v0.8
- ~-2 hours total
- 5 small primitives are easier to write than 1 monolithic agent loop
- Slightly more upfront design (drafting SKILL.md before code) but saves time during implementation
- Phase 0 adds "draft SKILL.md" task (~30 min, Builder B)
- Phase 1 Day 6-7 cleaner: 4 primitives + orchestrator scaffold are smaller scope than v0.8's "OpenClaw agent loop"

### EV change
- Roughly neutral on aggregate, slight uplift on demo communicability
- Same partner placement expectations
