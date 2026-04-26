# Reckon: A Cryptoeconomic Validation Layer for DeFi Solvers

**Spec version:** 0.7 — builder rebalance toward partner ownership; subgraph dropped for MongoDB Atlas
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
| **ENS namespace** | `reckon.eth` (with subnames at `solvers.reckon.eth` and `challengers.reckon.eth`) |
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
- **Base mainnet** (chain ID **8453**) — Reckon's primary deployment target for everything except `ChallengerNFT`.
- **Anvil-forked Base mainnet** — local development environment. Anvil's `--fork-url` points at a Base mainnet RPC endpoint. From inside the local node, all Base mainnet contracts and state are accessible — including the real `PriorityOrderReactor`, real Permit2, real Uniswap pools — but transactions cost zero real gas.
- **`@0gfoundation/0g-ts-sdk`** — 0G Storage SDK (foundation scope).
- **`@0glabs/0g-serving-broker`** — 0G Compute SDK (labs scope; different package, different scope, both are real).

---

## Bounty strategy

This spec targets **4 sponsor bounties**, with Uniswap explicitly de-prioritized as a sponsor while keeping the Uniswap stack (UniswapX, v3/v4 pools) as load-bearing infrastructure.

| Sponsor | Status | Targeted prize | Strategy |
|---|---|---|---|
| **ENS** | Primary | $5,000 (both prize tracks) | Solver/challenger identity via subnames + reputation in text records + CCIP-Read live resolver |
| **0G** | Primary | $7,500 (Track B only) | Challenger agents minted as iNFTs (ERC-7857) with brains on 0G Storage; on 0G Galileo testnet (bounty does not require mainnet) |
| **Gensyn** | Primary | $5,000 | AXL-encrypted mesh (Yggdrasil + TLS) for first-claim-wins dedup; we contribute the dedup logic on top of AXL's application-agnostic byte transport |
| **KeeperHub** | Primary | $5,000 + $500 (feedback) | Webhook-triggered challenge submission + scheduled reputation flush + `@reckon-protocol/keeperhub-skills` skill pack |
| **Uniswap** | Stack only | $0 (not targeting) | UniswapX `additionalValidationContract` integration on Base mainnet; v3/v4 pools as EBBO oracle inputs. No FEEDBACK.md, no API integration work. |

**Aggregate target prize value:** $6,500-$22,000 (range), central tendency $12,000-$15,000, plus finalist pool consideration ($0-$5,000 independent).

---

## Builder roles and partner ownership

**Both builders are comfortable with TypeScript and Go in addition to Solidity.** Roles are defined by ownership of full sponsor surfaces, not by a strict on-chain/off-chain split.

| Builder A — owns ENS + KeeperHub end-to-end; co-owns 0G | Builder B — owns Gensyn end-to-end; co-owns 0G |
|---|---|
| **ENS contracts**: L2 subname registrar, ENSReputationWriter | **Gensyn AXL**: build from source, 3-node mesh networking, GossipSub fork, axl-claim-broadcast helper |
| **ENS off-chain**: CCIP-Read gateway, resolve.reckon.fi demo tool | **0G Compute**: suspicion triage agent, NL slash explanation generator |
| **KeeperHub workflows**: webhook + schedule workflows, skill pack, FEEDBACK.md, AI-generated workflow demo clip | **0G Storage Log**: batched fill audit trail |
| **Indexer/relayer**: subscribes to UniswapX Fill events, calls recordFill + attestOwner, writes to MongoDB | **0G Storage KV**: claim_state stream for swarm coordination |
| **MongoDB Atlas setup** + read-only credential management | **OpenClaw agent runtime**: iNFT-aware boot, EBBO computation, decision logic |
| **Bootstrap and deploy scripts**: BootstrapAnvilFork.s.sol, DeployBaseMainnet.s.sol | **Dashboard**: real-time feed, charts, leaderboards |
| **Hetzner hub VPS ops**: long-running Anvil fork hosting + AXL public hub | **Fly.io spoke ops**: AXL spoke nodes US + EU |
| **Reckon contracts**: ReckonValidator, FillRegistry, EBBOOracle, SolverBondVault, Challenger, RoyaltyDistributor, OwnerRegistry | **Demo recording**: video script execution, packet captures, transitions |
| **0G ChallengerNFT (ERC-7857 fork)** + iNFT brain encryption tooling | **0G iNFT brain blob writer**: encrypts agent state, uploads to Storage |

**Pairing seams** (where both builders coordinate at integration boundaries):

- **iNFT brain blob**: Builder A defines the encryption schema in `ChallengerNFT`; Builder B's agent reads + decrypts at boot
- **ENS reputation writes**: Builder A's `ENSReputationWriter` is called by Builder A's KeeperHub schedule workflow, but Builder B's agent provides the trigger data via slash events
- **Indexer/relayer**: Builder A writes it; Builder B's agent is its primary downstream consumer
- **MongoDB schema**: Builder A defines collections + write paths; Builder B's dashboard and gateway consume reads

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
- Every Anvil restart wipes our deployed contracts and registered ENS subnames
- We maintain a `BootstrapAnvilFork.s.sol` Foundry script that deploys all contracts and registers a baseline set of test solvers/challengers in one command (~5 min per fresh fork)
- The script is also useful as the Phase 4 mainnet deploy script — same code, different RPC

**What stays on real chains:**
- **0G Galileo testnet:** `ChallengerNFT`, 0G Storage Log namespace, 0G Storage KV, 0G Compute provider sub-accounts. Faucet-funded, persistent across our laptop restarts
- **ENS mainnet:** `reckon.eth` parent name (one-time registration), CCIP-Read gateway resolution path
- **Base mainnet (Phase 4 only):** the final demo deployment

**What never touches a chain:**
- AXL mesh (3 VPSes)
- KeeperHub workflows (KeeperHub SaaS)
- Reckon Indexer/Relayer
- MongoDB Atlas (read-side store for events)
- CCIP-Read gateway server
- Dashboard

---

## The hybrid topology

| Component | Network / location | Notes |
|---|---|---|
| `ReckonValidator` + supporting contracts | **Anvil-forked Base mainnet** during dev → **real Base mainnet** for Phase 4 demo | Same deploy script, different RPC |
| `ChallengerNFT` (ERC-7857 iNFT) | **0G Galileo testnet** (persistent) | Faucet-funded; bounty doesn't require mainnet |
| 0G Storage Log + KV | 0G Galileo testnet indexer | |
| 0G Compute (Qwen3-32B) | 0G Galileo provider | |
| `reckon.eth` parent name | ENS mainnet | One-time ~$30 |
| L2 subname registrar | Anvil-forked Base mainnet → real Base mainnet | Demo subnames registered for the live demo |
| CCIP-Read gateway | Off-chain (our server), reads MongoDB | Resolves against MongoDB Atlas |
| **MongoDB Atlas** | **Off-chain SaaS (free tier M0)** | **Read-side store for indexer events; replaces subgraph** |
| AXL mesh (3 VPSes) | Off-chain | No chain dependency |
| KeeperHub workflows | Off-chain (KeeperHub SaaS, targets Base) | |
| Reckon Indexer/Relayer | Off-chain | Subscribes to local Anvil during dev, real Base mainnet for demo; writes to MongoDB |
| Dashboard | Off-chain | Reads MongoDB directly with read-only credentials |

**Cross-chain plumbing:** the only interaction across networks is `RoyaltyDistributor` on Base needing to know who currently owns a `ChallengerNFT` on 0G Galileo. We solve this with a relayer-attested `OwnerRegistry` contract on Base — no LayerZero/Wormhole needed.

---

## What this spec contributes to the field

The mechanism is simple, cheap, and tight:
- No re-execution → no state proofs → no fraud-proof games → no multi-week dispute windows
- Benchmark is an equal-weighted multi-pool geometric mean computed on-chain → ~50-80k gas to verify
- Challenge window is 30 minutes, balancing challenge gas cost vs price drift
- 8 contracts deployed across Base mainnet (7) + 0G Galileo (1)
- ENS subnames replace raw addresses for solver and challenger identity throughout
- Challenger agents are iNFTs on 0G Galileo — owned, transferable, with Reckon-native royalty splits to owners on every successful slash bounty
- Validator is `view`-only (UniswapX interface requirement); fill recording happens via off-chain indexer that subscribes to the reactor's `Fill` event
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
> We present Reckon, the first objective post-fill validation mechanism for DeFi solvers with ENS-native identity and tradeable challenger agents. Solvers register as ENS subnames under solvers.reckon.eth and post bonds proportional to their on-chain reputation; any party can challenge a fill by submitting evidence that a canonical multi-pool benchmark exceeded the solver's outcome by a configurable threshold; slashing executes automatically without DAO discretion. Challenger agents are minted as iNFTs (ERC-7857) on 0G Galileo with persistent memory on 0G Storage and Reckon-native royalty splits to current owners. We show this converts solver behavior from "trust the auction" to "trust the math," while making both the validators and the validated cryptographically discoverable.

### What it is, in one paragraph
Reckon is a UniswapX-compatible passive validator that makes solver execution quality cryptographically challengeable, with **ENS as the canonical identity layer** and **iNFTs on 0G Galileo as the ownership layer for challenger agents.** Swappers reference Reckon's `ReckonValidator` (deployed on Base mainnet) as their order's `additionalValidationContract`. Solvers register subnames under `solvers.reckon.eth` and post bonded collateral scaled by reputation stored in their ENS text records. The validator is view-only — it gates fills on solver registration without recording them; an off-chain indexer subscribes to the UniswapX reactor's `Fill` event and writes records to `FillRegistry` on Base and to MongoDB Atlas for read-side queries. After a fill is recorded, anyone with a `challengers.reckon.eth` subname has 30 minutes to challenge by proving — through a single read of 3+ canonical Uniswap pools — that the equal-weighted geometric mean exceeded the solver's output by more than the swapper's specified tolerance. If the challenge succeeds, slashing is automatic: 60% to the swapper, 30% to the iNFT current owner of the challenger's agent (resolved via relayer-attested `OwnerRegistry`), 10% to protocol. Challenger agents coordinate over Gensyn AXL using a forked GossipSub channel for first-claim-wins dedup, with 0G Storage KV as durable backup truth.

---

## L1 Specification

### Functional requirements

**FR-1: Solver registration via ENS subname + bonding**
- A solver registers a subname under `solvers.reckon.eth` (e.g., `bunni.solvers.reckon.eth`) using our L2 subname registrar on Base mainnet
- After subname registration, solver bonds USDC into Reckon's `SolverBondVault` (on Base mainnet) via direct EOA `transferFrom` — **not through any KeeperHub-managed wallet** (the KeeperHub agentic wallet has 100 USDC per-tx and 200 USDC daily caps that conflict with our `baseBond = 1000 USDC`)
- `SolverBondVault` keys storage by ENS namehash, not by address
- Required bond is dynamic: `requiredBond = baseBond * decay(reputation_score)` where higher reputation = lower required bond. Concretely: baseBond starts at 1000 USDC, decays linearly to 100 USDC at reputation 1.0
- Reputation is stored as a text record on the solver's ENS subname (key: `reckon.reputation`), updated by `ENSReputationWriter`
- Bond is locked while challenge windows are open against any of the solver's recent fills

**FR-2: Order tagging — the swapper-side surface**
- A swapper creating a UniswapX order sets `OrderInfo.additionalValidationContract` to our deployed `ReckonValidator` address on Base mainnet
- They encode their EBBO tolerance (`uint16` in basis points, e.g., 50 = 0.5%) into `OrderInfo.additionalValidationData` via `abi.encode`
- This is a 1-line change to the order construction code in their swap UI — no UniswapX fork needed, no UI modification needed beyond setting two existing fields. Swappers who don't want Reckon protection leave both fields empty (default UniswapX behavior)

**FR-3: Fill recording via off-chain indexer (NOT the validator)**

⚠️ **The UniswapX `IValidationCallback.validate()` function is `external view`.** It cannot write storage, emit events, or call non-view functions on other contracts. So the validator's role and the registry's role split as follows:

- **`ReckonValidator.validate(filler, resolvedOrder)`** is `view`. It does ENS gating only:
  - Resolves `filler` to its ENS namehash via reverse-lookup on the `solvers.reckon.eth` registrar
  - Reverts if filler has no subname (only registered solvers can be validated)
  - Decodes `eboTolerance` from `additionalValidationData` (sanity check, ensures decode doesn't revert on bad input)
  - Returns silently if all checks pass — never blocks a valid fill

- **`FillRegistry.recordFill(orderHash, filler, swapper, inputAmount, outputAmount, eboTolerance, fillBlock, challengeDeadline)`** is the state-modifying function. It is called by **Reckon's off-chain indexer/relayer**, not by the UniswapX reactor. The indexer:
  - Subscribes to `Fill(orderHash, filler, swapper, nonce)` events emitted by the UniswapX `PriorityOrderReactor` on Base mainnet
  - On each `Fill` event, fetches the resolved order details (input/output amounts) and calls `recordFill()` from a permissioned relayer EOA
  - **Also writes the fill to MongoDB Atlas `fills` collection** with the same data plus block timestamp and indexer-side metadata
  - The recorder address is set in `FillRegistry` and only that EOA can call `recordFill()`
- After recording: emits `FillRecorded(orderHash, fillerNamehash, swapper, fillBlock)`, indexed
- After every 50 fills or 60 seconds (whichever first), the indexer batches recent records into a single file uploaded to 0G Galileo Storage Log; the resulting Merkle root is emitted as `FillBatchAnchored(rootHash, firstOrderHash, lastOrderHash)` on Base
- Multi-output orders (`outputs.length > 1`) are explicitly **rejected** in v1 — the indexer skips them and logs a warning. Documented limitation; multi-output support is future work

**FR-4: Benchmark computation — equal-weighted geometric mean**
- `EBBOOracle.computeBenchmark(tokenIn, tokenOut)` reads spot prices from a hardcoded list of 3 canonical pools per pair on Base mainnet:
  - For Uniswap v3 pools: `IUniswapV3Pool(pool).slot0()` returns `(sqrtPriceX96, tick, ...)`. Convert via `FullMath.mulDiv` to a 1e18-precision price ratio
  - For Uniswap v4 pools: `StateLibrary.getSlot0(poolManager, poolId)` returns the equivalent tuple
- Returns the **equal-weighted geometric mean** across the three pools. Equal weighting (vs TVL weighting from earlier specs) is chosen because:
  - TVL is undefined for concentrated-liquidity pools without further qualification
  - Equal weighting preserves the clean `1/sqrt(N)` manipulation-resistance bound (see NFR-2)
  - Equal weighting is simpler to defend in mechanism design review
- Token0/token1 ordering is normalized — if the pool stores `tokenIn` as token0, we use the price directly; if as token1, we invert
- Pool addresses are real Base mainnet addresses from day one (no testnet pool list — Anvil fork has them all). Initial pool list for USDC/WETH on Base: TBD in Phase 0 (look up current top-3 by TVL)
- The pool list is upgradeable by a multisig, but only via timelock to prevent live attacks
- Returns price in `1e18` precision

**FR-5: Challenge mechanism with ENS gating + iNFT owner verification**
- Within `challengeWindow` blocks of fill (default 1800 blocks ≈ 30 min on Base at 1s blocks), any address holding a subname under `challengers.reckon.eth` can call `Challenger.submit(orderHash, challengerBond, beneficiary, agentTokenId, permit, signature)`
- The contract verifies the challenger's ENS subname ownership via a namehash check on the registrar
- The contract verifies that `agentTokenId` is owned by `msg.sender` via `OwnerRegistry.ownerOf(agentTokenId)` on Base — this is the relayer-attested cross-chain owner read (see FR-6)
- Challenger posts USDC bond (10% of solver's bond) via Permit2 at canonical address `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- Contract immediately computes `expectedOutput = EBBOOracle.computeBenchmark(...) * (1 - eboTolerance)`
- If `actualOutput < expectedOutput`: challenge succeeds. If `actualOutput >= expectedOutput`: challenge fails and challenger loses bond

**FR-6: Slashing, royalty splits, relayer-attested cross-chain owner read**
- On successful challenge, slash amount = `min(solverBond, expectedOutput - actualOutput)` (capped at bond, never more than the gap)
- Distribution: 60% to swapper as restitution, 30% to the iNFT current owner of the challenger's agent (per `OwnerRegistry.ownerOf(tokenId)`), 10% to protocol treasury
- The 30% challenger share is distributed via Reckon's own `RoyaltyDistributor.sol` contract on Base — **ERC-7857 does not provide royalty-split logic; we implement it ourselves** (~150 LoC). Royalty config (creator %, optimizer %, owner %) is keyed by tokenId

**Cross-chain owner read pattern:**
- Our off-chain relayer/indexer (already running for FR-3) also listens to `Transfer` events on `ChallengerNFT` (0G Galileo)
- On every transfer, the relayer calls `OwnerRegistry.attestOwner(tokenId, newOwner)` on Base from a permissioned EOA, AND writes the attestation to MongoDB Atlas `owner_attestations` collection
- `OwnerRegistry.ownerOf(tokenId)` returns the last attested owner with a freshness timestamp
- If `RoyaltyDistributor` queries `OwnerRegistry` and the freshness is stale (e.g., >24h), payout is queued (not blocked); the relayer re-attests on next iNFT event
- Trust assumption: same relayer that records fills is also trusted for owner attestations. This is honest hackathon scoping; LayerZero/Wormhole is the production path

- Challenger bond is returned in full
- Solver's ENS reputation text record is decremented via `ENSReputationWriter`
- The slash event is appended to the next batched 0G Storage Log file for permanent off-chain audit trail
- Relayer also writes the slash to MongoDB Atlas `slashes` collection

**FR-7: ENS-native reputation feedback**
- Successful clean fills (no challenge submitted, or all challenges failed) within a 7-day rolling window automatically increment solver reputation
- Reputation update batched once per day via **KeeperHub schedule-triggered workflow (every 24h)**. Gas paid from Reckon's Turnkey-backed org wallet (Base ETH). **No x402 billing for our own workflow runs** — x402/MPP only applies when external agents call paid workflows we've listed for sale (see FR-12)
- Updates are written to the solver's ENS subname text records: `reckon.reputation`, `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`
- A **CCIP-Read gateway** (off-chain resolver, ENSIP-10) serves live reputation by querying MongoDB Atlas directly with read-only credentials, signing the response per CCIP-Read protocol
- Reputation aggregation function lives in `ReputationAggregator` (separate contract, can be upgraded without touching validator)

**FR-8: Challenger agent reference implementation with AXL + 0G Storage KV coordination**
- An OpenClaw-based agent that subscribes to `FillRecorded` events on Base, computes EBBO benchmark off-chain (via 0G Compute — see FR-9), and auto-submits challenges when expected slash > expected gas + bond risk
- **AXL nodes** built from `gensyn-ai/axl` source (Go 1.25.5+, no binary releases exist — we build from a pinned commit SHA). Three-node hub-and-spoke topology: one public Hetzner hub + Fly.io US spoke + Fly.io EU spoke
- **Identity**: each node generates an Ed25519 keypair locally via OpenSSL on first boot, stored in the iNFT brain blob on 0G Galileo Storage. Peer TLS addresses pre-computed and exchanged at deploy time
- **Communication**: AXL is application-agnostic byte transport — we built first-claim-wins dedup on top by **forking AXL's `examples/gossipsub`** and swapping the message format to `{orderHash, agentTokenId, claimedAt, deadline}`. When agent X detects a slashable fill, it broadcasts a claim message; other agents back off for 30 seconds. If X fails to submit, the next agent retries
- **Encryption is e2e via Yggdrasil** — intermediate AXL nodes cannot read, censor, or modify claim messages. This is the cryptographic property that makes our deduplication adversarially robust (see NFR-2)
- **Durable backup**: shared claim state persists to **0G Galileo Storage KV** under a single protocol-wide `streamId` for `claim_state` (key = orderHash, value = `{agentTokenId, claimedAt, deadline}`)
- Agents use **KeeperHub webhook-triggered workflow** for challenge submission (KeeperHub handles gas estimation with Base 1.5× multiplier, nonce management, retry on revert, run logging in the Runs panel)
- **Each agent has its own `kh_`-prefixed KeeperHub API key** to stay under the 60 req/min Direct Execution API limit; key is encoded in the iNFT brain config

**FR-9: 0G Compute usage — natural-language slash explanations + suspicion triage**
- The challenger agent uses **Qwen3-32B** (predefined 0G Compute model on Galileo, 4 0G per million tokens; fallback to Qwen2.5-0.5B-Instruct at 0.5 0G per million tokens for cost) via `@0glabs/0g-serving-broker`
- Two real LLM use cases:
  1. **Suspicion triage**: before running deterministic on-chain benchmark math, the LLM scores fills 0-1 on "how suspicious does this look given pool history + counterparty patterns?" Used as a soft pre-filter — agent can skip benchmark computation for low-suspicion fills, saving 0G Compute calls
  2. **Natural-language slash explanations**: when a slash executes, the LLM generates a human-readable summary for the dashboard: "Solver bunni.solvers.reckon.eth was slashed 12.4 USDC because the EBBO benchmark of 1.0237 ETH/USDC exceeded their fill of 1.0089 by 1.45%, beyond the swapper's 0.5% tolerance"
- **Concurrency constraint**: per-provider sub-account is serial (one outstanding task at a time, must wait for `Finished` status before queuing next). We provision 3 provider sub-accounts (one per AXL node) to enable parallel inference
- Inference uses OpenAI SDK compatibility: `OpenAI(api_key="app-sk-...", base_url="<service_url>/v1/proxy")`

**FR-10: Challenger agents as iNFTs (ERC-7857) on 0G Galileo**
- Each challenger agent is minted as an iNFT via Reckon's `ChallengerNFT` contract **deployed on 0G Galileo testnet (chain 16602)**. Faucet-funded, no real gas cost during development or demo
- Implementation forks `github.com/0gfoundation/0g-agent-nft` reference; ERC-7857 extends ERC-721 with `iTransferFrom()` requiring `AccessProof` (signed by receiver) + `OwnershipProof` (signed by an oracle)
- For the demo, we ship with the **mock oracle** from the reference implementation; production would use TEE or ZKP oracle. Documented honestly in README
- The iNFT's metadata URI points to encrypted agent state on 0G Galileo Storage. Encryption: **AES-256-GCM with PBKDF2 key derivation (100k iterations)** — matches ERC-7857 reference's sealing flow. The brain blob contains: AXL Ed25519 keypair, EBBO threshold preferences, KeeperHub `kh_` API key, model config, performance history
- **Royalties are NOT inherited from ERC-7857** — base contract has zero royalty logic. Reckon's `RoyaltyDistributor.sol` (on Base) implements the split (see FR-6)
- Ownership transfer: standard ERC-7857 mechanics on 0G Galileo. Earnings rights follow ownership atomically via the relayer-attested `OwnerRegistry` (FR-6)
- **Off-chain agent boot**: when a challenger agent boots, it reads its own iNFT (token ID via env var), decrypts the brain blob using owner's signature as decryption key, initializes AXL keypair / EBBO prefs / KeeperHub key from decrypted blob

**FR-11: 0G Storage Log audit trail**
- Independent of MongoDB, all fills and slashes are batched and anchored to 0G Galileo Storage Log under a Reckon-owned namespace
- Batch size: N=50 records or 60s, whichever first. Anchored Merkle root emitted as `FillBatchAnchored` on Base
- Provides permanent off-chain audit trail. If MongoDB is wiped or unavailable, 0G Storage Log is the source of truth
- Read pattern: `indexer.download(rootHash, outPath, withProof)` for any historical batch
- Writes via `@0gfoundation/0g-ts-sdk`

**FR-12: Optional paid workflow listing — `EBBOOracle.computeBenchmark()`**
- We list our `EBBOOracle.computeBenchmark()` view as a **KeeperHub paid workflow** at $0.005/call
- Settles via **x402 on Base USDC** OR **MPP on Tempo USDC.e** — caller chooses based on what their wallet holds
- Auto-discoverable via x402scan and mppscan
- This is a real x402/MPP integration story (matching `paid-workflows.md` in KeeperHub docs exactly), separate from our own internal workflow gas costs
- Earnings split into separate Base USDC and Tempo USDC.e creator balances on KeeperHub

**FR-13: MongoDB Atlas as read store**
- A free tier M0 Atlas cluster hosts collections for: `fills`, `challenges`, `slashes`, `reputation_updates`, `owner_attestations`, `fill_batches`
- The relayer holds read-write credentials and writes events as they happen
- The dashboard and CCIP-Read gateway hold separate read-only credentials and query directly
- Replaces the subgraph from earlier specs; simpler setup, fewer moving parts, same dashboard/gateway functionality
- Connection strings stored in builder env vars; rotated if leaked
- Schema is duck-typed (TypeScript interfaces in shared package); no formal migrations

### Non-functional requirements

**NFR-1: Gas budget**
- Validator's `validate()` call: ≤ 30k gas (it's view-only and minimal — just an ENS resolution + abi.decode)
- `FillRegistry.recordFill()` call (from indexer): ≤ 80k gas
- Challenge submission: ≤ 280k gas before KeeperHub multiplier; ≤ 420k post-multiplier on Base (1.5× default)
- Reputation update batched: amortized < 60k gas per agent per update
- **Note**: KeeperHub applies a 1.5× gas-limit multiplier on Base by default (2.0× for time-sensitive event/webhook triggers). Quoted budgets are pre-multiplier

**NFR-2: Adversarial robustness**
- Equal-weighted geometric mean: **no single Uniswap pool can move the benchmark by more than `1/sqrt(N)`** where N=3 canonical pools. Bound holds because weights are equal; if we used TVL weighting, the bound would weaken
- **AXL e2e encryption (Yggdrasil) means intermediate AXL nodes cannot read, censor, or modify claim broadcasts.** A hostile relay node cannot suppress an honest challenger's claim or fabricate a competing one
- Challenger collusion mitigated by AXL gossip + 0G Storage KV durable claim state + first-valid-challenge-wins
- Solver self-challenge (theatrics) prevented by requiring challenger ENS subname ≠ filler ENS subname at contract level
- Time-based attacks (manipulate pool right before challenge submission) mitigated by tight 30-minute challenge window
- iNFT theft mitigated by ERC-7857 oracle-based transfer mechanics; agent's encrypted brain on 0G Storage protects against unauthorized state manipulation
- **Burst load**: tested for N=20 concurrent challenges in 60s; per-agent KeeperHub `kh_` keys keep us comfortably under the 60 req/min Direct Execution API cap

**NFR-3: Failure modes documented**
- If EBBO oracle pool list is wrong/manipulated: documented multisig timelock recovery path
- If challenger bond depletes before slashing completes: revert, challenger loses bond
- If solver's bond is insufficient to cover full restitution: pay what's available, log shortfall, decrement reputation by larger amount
- If ENS resolver / CCIP-Read gateway is offline: text records still readable on-chain (slower path, but not broken)
- If 0G Galileo Storage is unavailable: agents fall back to local cache; iNFT transfer still works, only the dynamic-upgrade path is degraded
- **If the indexer/relayer is offline**: fills are not recorded → challenges cannot be opened against them. Mitigation: operational redundancy (we run 2 indexer instances, only one writes); permissionless backfill via `recordFill(orderHash, proof)` is future work
- **If MongoDB Atlas is offline**: dashboard and CCIP-Read gateway lose live data. The on-chain state is unaffected; relayer continues recording fills to chain. Mitigation: 0G Storage Log batches give us permanent audit trail; dashboard can fall back to direct RPC reads (slower)
- **If iNFT oracle is offline**: transfers pause, but bounty payouts to current owner still resolve via `OwnerRegistry` cached value. Proof expiry can cause transfer reverts; new owners must fetch a fresh proof
- **If `OwnerRegistry` attestation is stale**: the slash itself still executes (swapper restitution + protocol cut both go through); only the 30% iNFT-owner payout is queued for retry until the relayer re-attests
- **If public AXL hub (Hetzner) goes down**: spokes cannot bootstrap from cold start. Mitigation: hub config kept minimal so it can be redeployed in <5 min; spec includes a `make redeploy-hub` script
- **If 0G Compute provider is offline**: agent skips suspicion triage and runs benchmark math directly. Slash explanation falls back to a templated string. Neither blocks the slash itself
- **Multi-output orders**: rejected in v1 (`outputs.length != 1` → indexer skips with warning log). Documented limitation
- **If Anvil fork RPC endpoint is rate-limited or down**: dev work pauses but production is unaffected. Mitigation: have a fallback RPC endpoint configured

**NFR-4: Observability**
- Every fill, challenge, slash, reputation update, iNFT transfer, royalty distribution, and owner attestation emits an indexed event AND a corresponding MongoDB document
- 0G Galileo Storage Log provides permanent audit trail independent of MongoDB
- Public dashboard reads MongoDB directly with read-only credentials, displays per-solver track record, all resolvable by ENS name
- **KeeperHub Runs panel** is the primary debugging surface during the demo (per-step inputs/outputs/transaction hashes/error messages)

### Contracts and architecture

```
                    ┌───────────────────────┐
                    │   Base Mainnet        │
                    │   (chain 8453)        │
                    │   [or Anvil fork      │
                    │    during dev]        │
                    └──────────┬────────────┘
                               │
    ┌──────────────────────────┼───────────────────────────────────┐
    │                          │                                   │
    │                          │ (real Uniswap-deployed)           │
    │  UniswapX                │                                   │
    │  PriorityOrderReactor ───┼──► ReckonValidator                │
    │  0x00000000...De729      │     (NEW, view-only gating)       │
    │                          │                                   │
    │              emits Fill event                                │
    │                          │                                   │
    └──────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────────────────┐
                    │  Reckon Indexer/Relayer         │
                    │  (NEW, off-chain, Builder A)    │
                    │  - subscribes to Fill events    │
                    │  - calls recordFill on Base     │
                    │  - listens to NFT Transfer      │
                    │    on 0G Galileo                │
                    │  - calls attestOwner on Base    │
                    │  - 0G Storage Log batching      │
                    │  - WRITES events to MongoDB     │
                    └────────┬────────────┬───────────┘
                             │            │
                             ▼            ▼
              Base mainnet contracts    MongoDB Atlas
                                        (read-side store)
                                              │
                                ┌─────────────┴────────────┐
                                ▼                          ▼
                      Dashboard (read-only       CCIP-Read gateway
                      creds, queries directly)   (read-only creds,
                                                  queries + signs)

    ┌──────────────────────────┬───────────────────────────────────┐
    │                          │                                   │
    │   FillRegistry ──► Challenger ──► EBBOOracle                 │
    │   (NEW)            (NEW)          (NEW: 3 pools,             │
    │                    │              equal-weighted             │
    │                    │              geom mean,                 │
    │                    │              slot0/StateLib)            │
    │                    │                                         │
    │                    ▼                                         │
    │   SolverBondVault ──► RoyaltyDistributor                     │
    │   (NEW: namehash       (NEW: 60/30/10 split,                 │
    │   keying)              Reckon-native)                        │
    │                                  │                           │
    │                                  ▼                           │
    │                           OwnerRegistry                      │
    │                           (NEW: relayer-attested             │
    │                           cross-chain ownerOf cache)         │
    │                                                              │
    │   ENSReputationWriter ──► ENS L2 Subname Registrar           │
    │   (NEW)                   (NEW: solvers.reckon.eth +         │
    │                            challengers.reckon.eth)           │
    │                                                              │
    └──────────────────────────────────────┬───────────────────────┘
                                           │
                                           ▼
                              ┌──────────────────────┐
                              │  ENS Mainnet         │
                              │  reckon.eth (parent) │
                              └──────────────────────┘

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
│ Challenger Agent Swarm (NEW, OpenClaw + 0G Compute + iNFT-aware)│
│  - 3 nodes: Hetzner hub + Fly.io US + Fly.io EU                 │
│  - each agent IS an iNFT; reads brain from 0G Galileo Storage   │
│  - subscribes to FillRecorded on Base (or Anvil fork during dev)│
│  - 0G Compute (Qwen3-32B) for suspicion triage + slash NL       │
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
│  - bootstrap script deploys all contracts + test subnames       │
│  - resets manually or on schedule (rare)                        │
└─────────────────────────────────────────────────────────────────┘
```

**Contract count:** 8 new Solidity contracts. 7 deployed to Base mainnet, 1 (`ChallengerNFT`) deployed to 0G Galileo testnet. ~2300-2800 lines total. Foundry tests target 95%+ coverage on core contracts, 80%+ on iNFT and ENS layers. Foundry tests run against Anvil-forked Base mainnet via `vm.createSelectFork()`.

**Out of scope for hackathon:**
- Multi-output orders (rejected in v1; outputs.length must equal 1)
- Permissionless `recordFill` via fill-receipt proofs (relayer is permissioned in v1)
- Production iNFT oracle (TEE/ZKP) — we ship with mock oracle from reference impl
- Trustless cross-chain owner read via LayerZero/Wormhole — we use relayer-attested `OwnerRegistry`
- Cross-chain UniswapX challenges (UniswapX cross-chain has its own optimistic flow; we focus same-chain)
- ERC-8004 ReputationRegistry integration — ENS is the external identity layer
- Uniswap Trading API integration — not targeting Uniswap bounty
- Reputation aggregation function tuning beyond a simple decay model
- Real solver onboarding at scale (we run our own demo solver + 2 challenger iNFTs)
- Full 24-hour adversarial attack simulation (compressed to 4-hour smoke test)
- Deployment to additional chains (Ethereum mainnet, Arbitrum, Unichain) — Phase 5 work
- Subgraph deployment — replaced by MongoDB Atlas

---

## Phase-wise plan

Two builders. Online format = 4 calendar weeks. The phases below assume ~25 hr/week each = ~200 builder-hours total. **Net change vs v0.6: roughly -3 hours** (subgraph dropped saves ~6 hours; MongoDB integration adds ~2 hours; rebalance is hours-neutral within each builder's 100-hour budget but redistributes ownership).

Hours summary:

| Builder | Phase 0 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Total |
|---|---|---|---|---|---|---|
| **A** | ~6 | ~38 | ~33 | ~30 | ~22 | ~129 |
| **B** | ~6 | ~30 | ~32 | ~28 | ~18 | ~114 |

A is slightly heavier than B. This is intentional given the rebalance toward partner ownership — A picks up KeeperHub, the indexer, and the CCIP-Read gateway from B.

### Phase 0 — Setup (Day 1, both builders, ~6 hours each)

**Both:**
- Pin a single shared notion/repo with: spec (this doc), open questions, daily standup notes
- **Decide chain/dev setup: Anvil-forked Base mainnet for development; real Base mainnet for Phase 4 deploy.** No testnet UniswapX, no Base Sepolia
- Decide Solidity version: 0.8.26 (matches UniswapX, v4)
- Run `forge init`, set up CI (GH Actions, lint + test on every push). CI uses Foundry's fork mode against a Base mainnet RPC
- Both run `anvil --fork-url <BASE_MAINNET_RPC>` locally and confirm they can read `PriorityOrderReactor` state

**Builder A specifically (Day 1, ~5 hours):**
- **Acquire `reckon.eth`** on ENS mainnet (or fallback). Set up resolver, configure for L2 subname delegation
- Verify Durin or Namestone availability for L2 subname registrar deployment on Base
- **Set up MongoDB Atlas free tier (M0) cluster.** Configure two users: `relayer` (read-write) and `consumer` (read-only). Get connection strings. Document in shared secrets vault. ~30 minutes
- **Look up current top-3 USDC/WETH pools by TVL on Base mainnet** for the EBBO oracle's initial canonical list. Confirm they're queryable via `slot0()` / `StateLibrary.getSlot0`
- Write `BootstrapAnvilFork.s.sol` — Foundry script skeleton (will be filled out as contracts get written)
- **Generate a `kh_`-prefixed organisation API key** at app.keeperhub.com → Settings → API Keys → Organisation. Confirm Base mainnet is selected. Test `claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp` and run a hello-world workflow

**Builder B specifically (Day 1, ~5 hours):**
- **Build AXL from source** on Hetzner and Fly.io US + EU (Go 1.25.5+ required, ~10 min build per node). Generate Ed25519 identity key per node via OpenSSL. Pre-compute peer TLS addresses. Confirm 3-node mesh handshakes
- **Pin AXL to a specific commit SHA** in CI
- Confirm `@0gfoundation/0g-ts-sdk` (Storage) and `@0glabs/0g-serving-broker` (Compute) install cleanly in TypeScript/Node project
- Confirm Qwen3-32B is responding on 0G Galileo via the serving broker
- **Verify ERC-7857 reference deploys cleanly on 0G Galileo** at `github.com/0gfoundation/0g-agent-nft`. Mock oracle path works for demo
- **Fund 0G Galileo wallet via `https://faucet.0g.ai`** — 0.1 0G/day cap, drip-fund Days 1-3
- **Set up long-running Anvil fork on Hetzner hub.** This becomes the shared dev environment that AXL spokes connect to in Phase 2

**Mandatory Phase 0 verification (split):**
- Builder A: confirm a Base mainnet RPC endpoint that supports fork-mode methods (Alchemy and QuickNode both do)
- Builder A: confirm `vm.createSelectFork()` works in a hello-world Foundry test against Base mainnet
- Builder B: confirm Hetzner hub exposes JSON-RPC for spokes and AXL public bootstrap

### Phase 1 — Core contracts + view-only validator + indexer + benchmark + ENS subnames + MongoDB (Week 1)

**Builder A (~38 hours):**

Day 2: Write `ReckonValidator.sol`:
- `validate(address filler, ResolvedOrder calldata resolvedOrder) external view`
- Resolves `filler` to ENS namehash via reverse-lookup on `solvers.reckon.eth` registrar
- Decodes `eboTolerance` from `additionalValidationData` (sanity check)
- Returns silently if all checks pass

Day 3-4: Write `FillRegistry.sol`:
- `mapping(bytes32 orderHash => FillRecord)` with fillerNamehash field
- `recordFill(...)` — only callable by permissioned indexer EOA
- Multi-output rejection: revert if outputs.length != 1
- Emits `FillRecorded`, `FillBatchAnchored`

Day 4-5: **Deploy ENS L2 subname registrar** for `solvers.reckon.eth` and `challengers.reckon.eth` on the Anvil fork (Durin or Namestone preferred)

Day 5-7: **Build the indexer/relayer** (~12 hours, biggest single Builder A task in Phase 1):
- TypeScript + viem + Bun runtime
- Subscribes to UniswapX `PriorityOrderReactor.Fill(orderHash, filler, swapper, nonce)` events. During dev, connects to local Anvil fork or Hetzner hub fork. For Phase 4, points at real Base mainnet RPC
- For each `Fill` event: fetches resolved order details, calls `FillRegistry.recordFill()` from permissioned relayer EOA, AND writes the fill document to MongoDB Atlas `fills` collection
- Subscribes to `ChallengerNFT.Transfer` events on 0G Galileo (real testnet RPC), calls `OwnerRegistry.attestOwner()` on Base, writes to MongoDB `owner_attestations` collection
- Skips multi-output orders with warning log
- Batches fills (50 records or 60s) and uploads to 0G Galileo Storage Log via `@0gfoundation/0g-ts-sdk`, anchors root hash on Base
- Idempotent on duplicate calls (safe to restart)

**Defines MongoDB schema** (TypeScript interfaces in shared `@reckon-protocol/types` package):
- `fills`, `challenges`, `slashes`, `reputation_updates`, `owner_attestations`, `fill_batches`

Foundry test targets for Phase 1: ≥ 80% line coverage on each contract.

**Builder B (~30 hours):**

Day 2-3: Set up OpenClaw agent project. Repo skeleton: `agent/`, `keeper-skills/` (will be added by A later), `dashboard/`, `ccip-gateway/` (will be A's), `inft-tools/`, `axl-broadcast/`

Day 3-5: **iNFT brain blob writer** (Builder B's contribution to the iNFT pairing seam):
- AES-256-GCM encryption with PBKDF2 (matches ERC-7857 reference)
- Brain blob schema: `{axl_ed25519_secret, ebbo_threshold_prefs, kh_api_key, model_config, performance_history}`
- Upload to 0G Galileo Storage via `@0gfoundation/0g-ts-sdk`
- Returns metadata URI for `ChallengerNFT.mint()` consumption

Day 5-6: Write the **EBBO computation off-chain** (deterministic, in TypeScript). Mirrors A's on-chain version. Wire `@0glabs/0g-serving-broker` for the two LLM use cases:
1. **Suspicion triage**: structured prompt, `Qwen3-32B`, returns 0-1 score
2. **NL slash explanation**: prompt template, generates dashboard string

Provision 3 provider sub-accounts for parallel inference.

Day 6-7: Build OpenClaw agent loop:
- Listen for `FillRecorded` events on Anvil-forked Base mainnet (via Hetzner hub during AXL testing)
- Read own iNFT (token ID via env var) from 0G Galileo
- Suspicion triage via 0G Compute → if low, skip; if high, compute EBBO deterministically
- Compare to fill outcome
- Decide: challenge if `slashable_amount > gas_cost + bond_risk_adjusted`

Day 7: Dashboard skeleton (Next.js, will be filled out in Phase 3). Connects to MongoDB with read-only credentials.

End of Week 1 milestone: A's contracts deploy on Anvil-forked Base mainnet via `BootstrapAnvilFork.s.sol`. A's indexer subscribes to real `PriorityOrderReactor`'s Fill events on Anvil fork, calls `recordFill`, writes to MongoDB. B's agent listens for FillRecorded, runs suspicion triage via 0G Compute, computes EBBO deterministically against real pool state, would-decide-to-challenge. Solvers and challengers can register subnames.

### Phase 2 — Challenge mechanism + AXL mesh + ENS reputation + 0G Storage (Week 2)

**Builder A (~33 hours):**

Day 8-9: Write `Challenger.sol`:
- `submit(orderHash, challengerBondAmount, beneficiary, agentTokenId, permit, signature)`
- Verify ENS subname ownership, deadline, no self-challenge, bond size, agentTokenId ownership via `OwnerRegistry`
- Pull challenger USDC bond via Permit2
- Call `EBBOOracle.computeBenchmark(...)`
- On success: call `RoyaltyDistributor.distribute(slashAmount, agentTokenId, swapper)`. On failure: challenger loses bond
- Emit indexed events; relayer writes to MongoDB `challenges` and `slashes` collections

Day 10: Write `OwnerRegistry.sol` (~50 LoC). Permissioned attester EOA writes; anyone reads.

Day 11: Write `RoyaltyDistributor.sol` (~150 LoC). 60/30/10 split with cross-chain owner read via `OwnerRegistry`. Stale freshness queues payout.

Day 12: Write `ENSReputationWriter.sol`. Batches reputation updates, settles to ENS resolver text records via KeeperHub schedule workflow.

Day 12-13: **KeeperHub workflow PoC** (Builder A's task now):
- Webhook-triggered workflow that calls `Challenger.submit(...)` with retry logic
- Schedule-triggered workflow (24h) that calls `ENSReputationWriter.flushReputation()`
- Confirm Turnkey signing works on Base Sepolia / Anvil fork
- Use the **KeeperHub Runs panel** as the primary debugging surface

Day 14: End-to-end Foundry test against Anvil-forked Base mainnet (real `PriorityOrderReactor` → ReckonValidator → indexer → FillRegistry → Challenger → SolverBondVault slash → RoyaltyDistributor → ENSReputationWriter → mock ENS resolver). Target 90%+ coverage.

**Builder B (~32 hours):**

Day 8-9: Complete OpenClaw challenger agent loop:
- Listen for `FillRecorded` on Anvil-forked Base mainnet (via Hetzner hub during AXL testing)
- Read own iNFT, decrypt brain via AES-256-GCM
- Suspicion triage via 0G Compute → EBBO computation
- Trigger KeeperHub webhook workflow (built by A in Phase 2 Day 12-13) to submit challenge

Day 10-11: **3-node AXL mesh setup** for challenger deduplication:
- Verify Hetzner hub + Fly.io US + Fly.io EU all connect via Yggdrasil
- **Fork AXL `examples/gossipsub`** — swap message format to `{orderHash, agentTokenId, claimedAt, deadline}`. Define backoff (30s) and timeout (60s)
- Verify cross-region peer connectivity over Yggdrasil
- Verify all 3 spoke agents subscribe to `FillRecorded` events from the Hetzner-hosted Anvil fork

Day 12: **0G Galileo Storage KV integration** — agent swarm uses 0G Storage KV as the shared "claim state" map. Single protocol-wide `streamId` for `claim_state`. AXL gossip first, KV durable backup.

Day 13: **0G Storage Log integration** — implement batching service inside the indexer (coordinates with Builder A). Every 50 fills or 60s, upload batch file via `indexer.upload()`, capture root hash, emit `FillBatchAnchored` event. Use `@0gfoundation/0g-ts-sdk`. (Note: this is a coordination point — A's indexer triggers it, B implements the 0G Storage upload logic.)

Day 14: **Dashboard MongoDB integration**. Wire dashboard to read from MongoDB Atlas via read-only credentials. Show real-time fill feed + recent challenges.

End of Week 2 milestone: full happy path works end-to-end on Anvil-forked Base mainnet. A swap with bad price gets challenged automatically — agent runs suspicion triage on 0G Compute, EBBO math against real Uniswap pool state, AXL GossipSub coordinates 3-node swarm, KeeperHub webhook (built by A) submits challenge, RoyaltyDistributor splits via OwnerRegistry-attested owner, swapper restitution, ENS text record updates, audit trail batched to 0G Storage Log, MongoDB has live event data. Dashboard shows it all.

### Phase 3 — iNFT layer + adversarial testing + KeeperHub skill pack + CCIP-Read gateway (Week 3)

**Builder A (~30 hours):**

Day 15-17: **Deploy `ChallengerNFT.sol` on 0G Galileo**, forking `github.com/0gfoundation/0g-agent-nft`:
- Each minted token represents one challenger agent
- Token's metadata URI points to encrypted blob on 0G Galileo Storage (B's brain blob writer produces these)
- Standard ERC-7857 transfer mechanics with mock oracle for demo
- `Transfer` events consumed by indexer/relayer to update `OwnerRegistry` on Base + MongoDB
- `updateBrain(tokenId, newURI)` — only callable by current owner

Day 17-18: **`@reckon-protocol/keeperhub-skills` skill pack** (~300 LoC, Builder A's contribution to KeeperHub Focus Area #2):
1. `challenger-submit-webhook` — webhook trigger → call `Challenger.submit()` with retry/gas estimation
2. `reputation-flush-schedule` — daily schedule → call `ENSReputationWriter.flushReputation()`
3. `fill-audit-query` — manual trigger → query 0G Storage Log batch by root hash
4. `paid-ebbo-oracle-listing` — paid workflow listing for `EBBOOracle.computeBenchmark()` ($0.005/call, x402+MPP dual-protocol)
5. `discord-slash-notification` — webhook on slash → format message → post to Discord

Open-source on GitHub, publish to npm.

Day 19: **CCIP-Read gateway** (Builder A — ENS end-to-end ownership):
- ENSIP-10 `resolve()` callback service
- Read-only MongoDB connection
- Returns reputation values from `reputation_updates` collection
- Signs response per CCIP-Read protocol
- Reference: Coinbase `cb.id` gateway

Day 20: Adversarial Foundry tests (Anvil-forked Base mainnet for realistic state):
- Insufficient bond, deadline expired, challenger without subname, self-challenge edge cases
- EBBO oracle equal-weighted geometric mean dampens against manipulated pool data
- iNFT transferred mid-challenge: royalty queued via `OwnerRegistry` freshness
- Burst load: N=20 simultaneous challenges in 60s, no `kh_` rate-limit violations
- Multi-output order rejection

Day 21: Write **mechanism design analysis** doc (~500 words). Polish contracts. NatSpec on every public function. Run `slither` and `mythril`.

**Builder B (~28 hours):**

Day 15-16: **iNFT-aware agent runtime polish:**
- Boot sequence: read iNFT → decrypt brain blob → init AXL keypair / EBBO prefs / `kh_` key
- Performance history written back to brain on graceful shutdown
- Edge case handling: brain blob corrupted, owner key rotation

Day 17-18: **`@reckon-protocol/axl-claim-broadcast` helper package** (~150 LoC). Wraps the GossipSub fork pattern. Mirrors the KeeperHub skill pack pattern for Gensyn — strengthens the meta-pitch.

Day 19-20: **Dashboard polish:**
- Real-time feed from MongoDB
- Charts of solver reputation over time
- Challenger leaderboard sorted by iNFT bounty earnings
- iNFT marketplace view (active iNFTs, recent transfers, projected yield)
- Packet-capture demo prep for AXL TLS+Yggdrasil layers
- KeeperHub Runs panel embedded in debug pane
- All solvers display by ENS name

Day 20-21: **4-hour attack smoke test** on Anvil-forked Base mainnet. Two demo solvers, one honest, one griefer. Run challenger agent for 4 hours. Document results for demo video.

End of Week 3 milestone: protocol is adversarially tested. ChallengerNFT minted on 0G Galileo. KeeperHub skill pack and AXL helper published. CCIP-Read gateway serves live reputation. Dashboard is polished and reads from MongoDB.

### Phase 4 — Mainnet deploy + demo + polish (Week 4)

**Builder A (~22 hours):**

Day 22-23: Run `BootstrapAnvilFork.s.sol`'s mainnet sibling `DeployBaseMainnet.s.sol` against **real Base mainnet**. Deploys all 7 Base contracts. Verify on Etherscan. Update SDK with mainnet addresses.

Day 23: **Deploy `ChallengerNFT` on 0G Galileo**. Mint 2 demo challenger iNFTs.

Day 24: Deploy **ENS mainnet subname registrar**. Register 2-3 demo solver subnames, 1-2 challenger subnames.

Day 24: **Configure indexer for real Base mainnet** (one config line change from Anvil to mainnet RPC). Verify indexer connects to real `PriorityOrderReactor`. MongoDB starts receiving real mainnet event data.

Day 24-25: Recruit at least one external solver (Bunni, Arrakis, smaller MEV searchers). Backup plan: run two of our own solvers (one honest, one griefer).

Day 25-26: **Mainnet smoke test.** Deliberately trigger a low-quality fill, demonstrate slashing, watch cross-chain royalty payout via `OwnerRegistry`. Should be uneventful — we've been running against this exact reactor's bytecode for 3 weeks.

Day 26: **Final ENS demo flourish — `resolve.reckon.fi`** — tiny standalone web tool that takes any solver address, resolves to ENS name, displays reputation via CCIP-Read. ~2-3 hours.

Day 26-27: **AI-generated workflow demo clip.** Use KeeperHub's `ai_generate_workflow` tool on camera — 30 seconds of footage.

Day 27: KeeperHub feedback file — honest, specific, actionable about agent integration UX. Bounty pays $500.

**Builder B (~18 hours):**

Day 22-23: **Demo video script + recording.** Strict 2-minute target:
- 0:00-0:15: The problem — solver fills with no objective accountability
- 0:15-0:35: Solution architecture — show the hybrid topology, `.eth` subname identity
- 0:35-1:00: Live bad fill demo — 5-second packet capture showing TLS + Yggdrasil layers between two AXL nodes, KeeperHub webhook submits challenge, slash executes, ENS text record drops on-chain
- 1:00-1:25: iNFT moment — show challenger iNFT on 0G Galileo explorer, transfer to second wallet on screen, relayer attests new owner, next bounty redirects
- 1:25-1:45: Third-party app resolving `bunni.solvers.reckon.eth` and reading reputation via CCIP-Read
- 1:45-2:00: What's next

Day 24-25: Write final README. Cover: motivation, architecture (with hybrid topology diagram), contract addresses, ENS namespace structure, iNFT mechanics, MongoDB schema, KeeperHub skill pack, AXL helper, security considerations, known limitations, FAQ. Include FAQ pre-empting judge questions: "Why view-only validator?" "Why off-chain indexer?" "Why MongoDB instead of subgraph?" "Why is ChallengerNFT on testnet?" "Why ENS instead of ERC-8004?" "Why relayer-attested cross-chain?" "Why Anvil fork during dev?"

**Dependencies section in README must note:**
- UniswapX (`github.com/Uniswap/UniswapX`) is GPL-3.0; Reckon stays at the interface boundary
- Permit2 canonical address `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- ERC-7857 reference at `github.com/0gfoundation/0g-agent-nft`
- MongoDB Atlas free tier M0 cluster

Day 26: **Sponsor README sections** — partner-specific docs explaining how each integration works (Builder B authors the AXL/0G/Compute sections; Builder A authors the ENS/KeeperHub sections).

Day 27: Final QA pass on dashboard, agent runtime, AXL mesh stability.

Day 28: Final submission. ETHGlobal portal, all GitHub repos public, demo video uploaded, contract addresses verified, dashboard live, ENS subnames registered, iNFTs minted on 0G Galileo, KeeperHub feedback submitted, paid EBBO oracle listing live on x402scan + mppscan.

End of Week 4 milestone: shipped, demoable, with the Base mainnet integration real and the 0G Galileo testnet integration honest. At least one external participant. Two open-source helper packages published.

### Bonus items if you have spare bandwidth

In rough priority order:
1. **`OrderQuoter` integration** in dashboard (Builder A, ~1 hour)
2. **Permissionless `recordFill`** via fill-receipt proofs (Builder A, ~8-10 hours)
3. **REE integration** for deterministic dispute replay (Builder B, ~6 hours)
4. **iNFT marketplace stub** (Builder B, ~4 hours)
5. **Cross-chain challenges** — extend to UniswapX cross-chain fills
6. **Insurance fund layer**
7. **`@reckon-protocol/sdk`** — TypeScript SDK letting anyone build a challenger from scratch

### Scoping note for in-person 72-hour format

If this is in-person 72h instead of online 4 weeks, cut as follows:
- Keep Phases 0, 1, 2 in full (~36 hours)
- **Cut iNFT layer entirely.** Use ERC-721 with metadata pointing to 0G Galileo Storage. Frame as "iNFT-pattern" — saves ~14 hours
- **Cut OwnerRegistry** — without iNFTs, owner is just `msg.sender`
- Skip `RoyaltyDistributor` complexity — make it a simple 60/30/10 to fixed addresses
- Skip Phase 3's mechanism-design doc (5 bullets in README instead)
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
- [ ] **Confirm ERC-7857 reference implementation deploys cleanly on 0G Galileo** at `github.com/0gfoundation/0g-agent-nft`. Mock oracle path works
- [ ] **Confirm `reckon.eth` is available on ENS mainnet.** If not, fallback in order
- [ ] **Confirm Durin or Namestone is usable for L2 subname registrar**
- [ ] **Set up MongoDB Atlas free tier cluster.** Configure read-write user (relayer) and read-only user (consumers). Document connection strings
- [ ] Generate a `kh_`-prefixed organisation API key at app.keeperhub.com. Test MCP transport. Confirm 60 req/min cap is comfortable for our 3-agent setup
- [ ] **Confirm `gensyn-ai/axl` builds from source** with Go 1.25.5+ on Hetzner and both Fly.io regions. Pin commit SHA in CI. Generate Ed25519 identity keys. Pre-compute peer TLS addresses
- [ ] **Pin Permit2 canonical address** `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- [ ] **Look up current top-3 USDC/WETH pools on Base mainnet by TVL**
- [ ] Read the entire UniswapX docs section on `additionalValidationContract` — confirm `view`-only constraint and `Fill` event spec
- [ ] Read the ERC-7857 spec and the `0g-agent-nft` reference implementation
- [ ] Read CCIP-Read (ENSIP-10) spec and at least one reference gateway (Coinbase `cb.id`)
- [ ] Read KeeperHub `ai-tools/mcp-server.md`, `ai-tools/agentic-wallet.md`, `workflows/paid-workflows.md`
- [ ] Read AXL's tech page and `gensyn-ai/axl` README

If any checkbox can't be confirmed in Day 1, raise the flag immediately and re-scope.

---

## Risks I am still uncertain about

Honest list, ranked by severity. **Risk landscape vs v0.6: subgraph-related risks dropped; new minor risk on MongoDB Atlas as third-party uptime dependency.**

**1. Indexer/relayer reliability (HIGH severity, MEDIUM probability).** The relayer is the hinge of the entire system: if it goes down, fills aren't recorded, challenges can't be opened, iNFT transfers don't propagate to `OwnerRegistry`, MongoDB stops getting fresh data. Mitigation: run two redundant indexer instances with leader election; document `make redeploy-indexer` script; instrument with health checks and alerts; idempotent operations safe for leader switching.

**2. AXL pre-release version churn (MEDIUM severity, MEDIUM probability).** AXL has zero tagged releases. Pin commit SHA in CI; lock the commit; retest on bumps.

**3. Anvil fork RPC rate-limiting / availability (MEDIUM severity, LOW-MEDIUM probability).** Have a backup RPC endpoint configured. Public RPCs may not expose fork-mode methods reliably.

**4. AXL public hub bootstrap dependency (MEDIUM severity, LOW probability).** Hetzner hub also hosts the long-running shared Anvil fork. Mitigation: hub config minimal; `make redeploy-hub` script automates rebuild in <10 min.

**5. ENS L2 subname registrar availability (MEDIUM severity, LOW-MEDIUM probability).** Fallback: deploy our own minimal registrar (~6 hours).

**6. CCIP-Read gateway integration complexity (MEDIUM severity, MEDIUM probability).** ENSIP-10 has subtle signature requirements. Reference: Coinbase `cb.id` gateway.

**7. 0G Compute per-provider serial concurrency (MEDIUM severity, MEDIUM probability).** 3 sub-accounts gives N=3 parallelism. Cache aggressively + spin up additional sub-accounts if needed.

**8. iNFT oracle (mock vs real) for production claim (LOW-MEDIUM severity, LOW probability).** Ship with mock oracle from `0g-agent-nft` reference. Documented in README.

**9. Recruiting external solver (MEDIUM severity, HIGH probability).** Backup plan with two of our own solvers.

**10. KeeperHub gas multiplier compatibility (LOW severity, LOW probability).** Verify in Phase 1.

**11. Multi-output order edge case (LOW severity, MEDIUM probability).** Reject in v1; relayer skips with warning. Documented limitation.

**12. AXL conference Wi-Fi stability (LOW severity, LOW probability).** Yggdrasil's NAT/firewall traversal handles it.

**13. Anvil fork state ephemerality (LOW severity, MEDIUM probability).** `BootstrapAnvilFork.s.sol` re-deploys everything in ~5 min on a fresh fork.

**14. MongoDB Atlas as third-party uptime dependency (LOW severity, LOW probability).** If Atlas has an outage during demo, dashboard and CCIP-Read gateway lose live data. On-chain state is unaffected. Atlas free tier has reasonable uptime (multi-region replica sets even on M0). Mitigation: pre-record key demo moments; have a fallback display path that reads directly from RPC if needed.

---

## What this submission wins, realistically

Honest expected-value breakdown by sponsor:

- **ENS Integration prize ($1,250 1st):** medium-high probability of placing 1st-3rd. Solver subnames + bond keying + reputation in text records is exactly what the bounty asks for. Expected: $750-$1,250
- **ENS Creative prize ($1,250 1st):** medium probability. CCIP-Read gateway + `resolve.reckon.fi` external demo + subnames-as-access-tokens hits multiple creative angles. Expected: $750-$1,250
- **0G Track B ($7,500 split across 5 winners at $1,500):** medium-high probability of winning one slot. iNFT challenger agents with persistent memory + cross-chain royalty splits + AXL coordination via 0G Storage memory. Testnet doesn't hurt — bounty doesn't require mainnet. Expected: $1,500-$3,000
- **Gensyn ($5,000 ranked pool):** medium probability of placing. AXL load-bearing with e2e Yggdrasil encryption as a real security property. 3-node mesh + GossipSub fork + `@reckon-protocol/axl-claim-broadcast` helper. Expected: $1,000-$2,500
- **KeeperHub ($4,500 ranked pool + $500 feedback):** high probability of placing. Skill pack + paid workflow listing + Discord notification + AI-generated workflow demo clip covers all focus areas. Expected: $1,500-$3,000
- **ETHGlobal Finalist pool:** independent of sponsors. Expected: $0-$5,000

**Aggregate expected prize value:** $5,500-$22,000 with central tendency around **$12,000-$15,000**.

---

## Changelog from v0.6

### Builder rebalance toward partner ownership
- **Builder A now owns ENS end-to-end** (contracts AND CCIP-Read gateway AND `resolve.reckon.fi` demo tool — was split with B in v0.6)
- **Builder A now owns KeeperHub end-to-end** (workflow PoC, skill pack, FEEDBACK.md, AI workflow demo clip — was all on B in v0.6)
- **Builder A owns the indexer/relayer** (was B in v0.6). Indexer is fundamentally about contract events and contract calls; A is better positioned to write the bridge between two ends they wrote
- **Builder A owns demo video recording and MongoDB Atlas setup**
- **Builder A owns Hetzner hub VPS ops + bootstrap and deploy scripts**
- **Builder B owns Gensyn AXL end-to-end** (build from source, mesh networking, GossipSub fork, axl-claim-broadcast helper)
- **Builder B owns OpenClaw agent runtime, 0G Compute, 0G Storage Log + KV, dashboard, Fly.io spoke ops**
- **0G ChallengerNFT contract → A; iNFT brain blob writer → B** — explicit pairing seam at the iNFT integration
- **Result**: A: ENS + KeeperHub + indexer + most contracts. B: Gensyn + agent runtime + 0G off-chain + dashboard. Each builder owns at least one full sponsor end-to-end. A has 129 hours, B has 114 hours over 4 weeks — slightly skewed toward A given the additional ownership

### Subgraph dropped, MongoDB Atlas added
- **Subgraph removed entirely** from architecture. Replaces with MongoDB Atlas free tier (M0)
- New **FR-13: MongoDB Atlas as read store**
- Indexer writes events to MongoDB as it processes them
- Dashboard and CCIP-Read gateway query MongoDB directly with read-only credentials
- **No HTTP API on the relayer** — saves ~1 hour vs the alternative
- Phase 0 adds MongoDB Atlas setup (~30 min, Builder A)
- Phase 3 Day 19 changes from "Subgraph + CCIP-Read gateway" to "CCIP-Read gateway"
- New Risk #14: MongoDB Atlas as third-party uptime dependency (LOW severity)
- 0G Storage Log keeps its role as permanent off-chain audit trail independent of MongoDB

### Net work change vs v0.6
- ~roughly -3 hours total
- Subgraph removal saves ~6-8 hours of Builder B time
- MongoDB integration adds ~2 hours (relayer write paths + initial setup)
- Builder rebalance is hours-neutral within each builder's budget but redistributes ownership

### EV change
- Roughly neutral
- Slight upside on developer velocity (simpler architecture)
- Slight risk uplift from MongoDB as third-party dependency (mitigated)
- Same partner placement expectations
