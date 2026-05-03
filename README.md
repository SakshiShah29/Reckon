<p align="center">
  <img src="./assets/banner.png" alt="Reckon Banner" width="100%" />
</p>

<h1 align="center">Reckon</h1>
<p align="center"><i>Cryptoeconomic Validation Layer for DeFi Solvers</i></p>

<p align="center">
  Reckon makes every DeFi solver fill cryptographically challengeable, with automatic slashing on objective EBBO violations &mdash; no DAO vote required. Solvers register as virtual ENS subnames under <code>solvers.reckonprotocol.eth</code> (served via ENSIP-10 wildcard + CCIP-Read) and post bonds proportional to their on-chain reputation. Challenger agents &mdash; minted as iNFTs (ERC-7857) on 0G Galileo with persistent memory on 0G Storage &mdash; monitor fills, run suspicion triage via 0G Compute, compute an equal-weighted geometric-mean benchmark from 3 canonical Uniswap pools, and auto-submit challenges when a fill breaches the swapper's tolerance. Slashing is immediate: 60% restitution to the swapper, 30% to the iNFT owner, 10% to protocol. Agents coordinate over a Gensyn AXL encrypted mesh for first-claim-wins dedup, submit challenges via KeeperHub webhook workflows, and log every decision to 0G Storage for a permanent audit trail.
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/Built%20on-UniswapX-FF007A?style=for-the-badge&logo=uniswap&logoColor=white" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Identity-ENS-5284FF?style=for-the-badge" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Network-Base-0052FF?style=for-the-badge&logo=coinbase&logoColor=white" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Agents-0G%20iNFTs-00D4AA?style=for-the-badge" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Mesh-Gensyn%20AXL-8B5CF6?style=for-the-badge" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Execution-KeeperHub-F59E0B?style=for-the-badge" /></a>
</p>

<p align="center">
  <a href="#the-problem">Problem</a> &bull;
  <a href="#how-reckon-works">How It Works</a> &bull;
  <a href="#system-flow">System Flow</a> &bull;
  <a href="#smart-contracts">Contracts</a> &bull;
  <a href="#integrations">Integrations</a> &bull;
  <a href="#tech-stack">Tech Stack</a> &bull;
  <a href="#quick-start">Quick Start</a>
</p>

---

## The Problem

Concentrated DeFi solver markets (UniswapX, CoW Protocol, 1inch Fusion) route billions in swap volume through off-chain solvers &mdash; but accountability for fill quality is nearly nonexistent:

| Gap | Why It Matters |
|-----|---------------|
| **No objective post-fill validation** | Solvers fill orders at whatever price they choose. Swappers have no way to prove they got a bad deal after the fact &mdash; there's no on-chain benchmark to compare against. |
| **DAO-discretionary slashing** | CowSwap's solver slashing requires a human governance vote. Hours-to-days delay, political dynamics, no deterministic outcome. Most bad fills go unpunished. |
| **Solver identity is opaque** | Solvers are raw addresses. No discoverable reputation, no track record, no way for swappers to choose solvers based on historical performance. |
| **No challenger infrastructure** | Even if you could prove a bad fill, there's no mechanism to submit a challenge, post a bond, and receive restitution automatically. |

The result: swappers trust the auction blindly, solvers face zero consequences for suboptimal execution, and the entire solver market operates on reputation-by-rumor.

**No existing protocol ships objective same-chain post-fill challenges with automatic slashing tied to ENS-resolvable identity, with iNFT-owned challenger agents.**

---

## How Reckon Works

Reckon is a UniswapX-compatible passive validator on Base that makes solver execution quality cryptographically challengeable:

> *Swappers tag their UniswapX orders with Reckon's validator and an EBBO tolerance. Solvers register as virtual ENS subnames and post bonds. After every fill, challenger agents &mdash; iNFTs on 0G Galileo with encrypted brains on 0G Storage &mdash; compute a multi-pool benchmark, coordinate over Gensyn AXL for dedup, and auto-submit challenges via KeeperHub when a fill breaches the tolerance. Slashing is automatic and immediate.*

### The Lifecycle

| Phase | What Happens | Trust Model |
|-------|-------------|-------------|
| **A. Solver Registration** | Solver registers a virtual subname under `solvers.reckonprotocol.eth` via the dashboard registration UI. The subname is stored in MongoDB and served via CCIP-Read &mdash; it does not exist on any chain. The relayer mirrors registration to `SolverRegistry` on Base. Solver posts USDC bond into `SolverBondVault` (scaled by reputation: 1000 USDC at rep 0.0, decays to 100 USDC at rep 1.0). | Virtual ENS subname = load-bearing identity |
| **B. Order Tagging** | Swapper sets `additionalValidationContract = ReckonValidator` and encodes EBBO tolerance (basis points) in `additionalValidationData`. One-line change to order construction. | Opt-in per order; no UniswapX fork needed |
| **C. Fill & Validation** | UniswapX reactor calls `ReckonValidator.validate()` (view-only). Validator gates on solver registration in `SolverRegistry`, decodes tolerance, returns silently. Never blocks a valid fill. | View-only &mdash; gates but never records |
| **D. Fill Recording** | Off-chain relayer subscribes to reactor `Fill` events, calls `FillRegistry.recordFill()` from a permissioned EOA, writes to MongoDB Atlas. Batches fills to 0G Storage Log every 50 records or 600s. | Permissioned relayer (hackathon scope) |
| **E. Challenger Analysis** | iNFT challenger agents detect `FillRecorded` events (via KeeperHub fill listener workflow). Run suspicion triage via 0G Compute. If suspicious, compute EBBO benchmark via KeeperHub read workflow against 3 canonical Uniswap pools. | Objective math &mdash; no discretion |
| **F. Claim Coordination** | Agent broadcasts claim over Gensyn AXL encrypted P2P mesh. Other agents back off for 30s. Durable claim state persisted to 0G Storage KV. First-claim-wins with deterministic tiebreaker (earlier timestamp, lower tokenId). | AXL Yggdrasil e2e encryption &mdash; tamper-proof |
| **G. Challenge Submission** | Winning agent pre-signs a Permit2 bond permit and submits challenge via KeeperHub webhook workflow. KeeperHub's wallet calls `Challenger.submit()` as a delegate. Contract verifies ENS subname, iNFT ownership via `OwnerRegistry`, computes benchmark on-chain. | On-chain verification; KeeperHub handles gas + retry |
| **H. Slashing** | If `actualOutput < benchmarkOutput * (1 - tolerance)`: slash executes. 60% to swapper, 30% to iNFT owner (via `RoyaltyDistributor`), 10% to protocol. Challenger bond returned. Solver reputation decremented. | Automatic &mdash; no DAO vote, no delay |
| **I. Reputation Update** | Clean fills increment solver reputation. Relayer flushes reputation updates to `SolverRegistry.setText()` on Base and MongoDB. CCIP-Read gateway serves live values from MongoDB. | On-chain durable truth + live CCIP-Read |

### Key Features

- **Objective EBBO Benchmark** &mdash; Equal-weighted geometric mean across 3 canonical Uniswap v3/v4 pools. No single pool can move the benchmark by more than `1/sqrt(3)`. Computed on-chain in ~50-80k gas.
- **ENS-Native Identity** &mdash; Solvers and challengers are virtual subnames under `reckonprotocol.eth`, served via ENSIP-10 wildcard resolver + CCIP-Read gateway on Ethereum mainnet. Reputation stored in text records (`reckon.reputation`, `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`). Discoverable by any ENS-aware client without knowing about Reckon.
- **iNFT Challenger Agents** &mdash; ERC-7857 iNFTs on 0G Galileo with encrypted brains (AES-256-GCM) on 0G Storage. Ownership is tradeable; earnings follow ownership atomically.
- **AXL Encrypted Mesh** &mdash; Gensyn AXL with Yggdrasil e2e encryption for tamper-proof claim coordination. Each agent runs alongside its own AXL node; agents communicate via `POST /send` and `GET /recv` HTTP API.
- **KeeperHub Execution** &mdash; Challenge submission, EBBO benchmark reads, and fill event monitoring via KeeperHub webhook workflows with Turnkey-signed transactions, gas estimation, retry, and execution log polling.
- **Delegation Pattern** &mdash; `Challenger.sol` supports delegate execution (`agentDelegate` mapping) so KeeperHub's wallet can submit challenges on behalf of agent owners while Permit2 bonds are always pulled from the owner's pre-signed permit.
- **Permanent Audit Trail** &mdash; Every fill batched to 0G Storage Log with Merkle root anchored on-chain. Independent of MongoDB.
- **CCIP-Read Live Reputation** &mdash; ENSIP-10 wildcard resolver on Ethereum mainnet serves live reputation from MongoDB via signed off-chain gateway. Any ENS client resolves `bunni.solvers.reckonprotocol.eth` with zero Reckon-specific integration.

---

## System Flow

```
                                    RECKON

 PHASE A: SOLVER REGISTRATION
 ────────────────────────────────────────────────────────────────
  Solver
    |  register("bunni") via dashboard UI → relayer
    v
  MongoDB Atlas
    |  insert into `subnames` collection
    |  label: "bunni", namespace: "solvers", owner: 0x...
    v
  SolverRegistry (Base)
    |  register(namehash, owner) from relayer EOA
    v
  SolverBondVault
    |  bondSolver(namehash, amount) via Permit2 SignatureTransfer
    |  requiredBond = baseBond * decay(reputation)
    |  1000 USDC at rep 0.0 → 100 USDC at rep 1.0
    |
    --> emit SolverRegistered(namehash, solver, bondAmount)


 PHASE B-C: ORDER TAGGING & FILL
 ────────────────────────────────────────────────────────────────
  Swapper
    |  set additionalValidationContract = ReckonValidator
    |  set additionalValidationData = abi.encode(uint16(toleranceBps))
    v
  UniswapX PriorityOrderReactor (0x000...De729)
    |  solver fills the order
    |  calls ReckonValidator.validate(filler, resolvedOrder)  [view]
    |    ✓ filler registered in SolverRegistry
    |    ✓ eboTolerance decodes cleanly
    |    ✓ outputs.length == 1
    |  emit Fill(orderHash, filler, swapper, nonce)


 PHASE D: FILL RECORDING
 ────────────────────────────────────────────────────────────────
  Reckon Relayer (off-chain)
    |  subscribes to Fill events on Base
    |
    |-(1)-> FillRegistry.recordFill(orderHash, filler, amounts, ...)
    |        emit FillRecorded(orderHash, fillerNamehash, swapper, fillBlock)
    |
    |-(2)-> MongoDB Atlas: insert into `fills` collection
    |
    |-(3)-> Every 50 fills or 600s:
    |        batch → 0G Storage Log upload → Merkle root
    |        emit FillBatchAnchored(rootHash, firstOrderHash, lastOrderHash)


 PHASE E: CHALLENGER ANALYSIS (2 iNFT agents on AXL mesh)
 ────────────────────────────────────────────────────────────────
  Challenger Agent (iNFT on 0G Galileo)
    |  boot: decrypt brain blob from 0G Storage (AES-256-GCM + PBKDF2)
    |  initialize: AXL Ed25519 keypair, EBBO prefs, KeeperHub kh_ key
    |
    |-(1)-> Detect FillRecorded event (via KeeperHub fill listener workflow)
    |
    |-(2)-> 0G Compute: suspicion triage
    |        "Score 0..1: how suspicious is this fill?"
    |        If < threshold → skip (save compute)
    |
    |-(3)-> EBBO computation via KeeperHub read workflow:
    |        EBBOOracle.computeBenchmark(tokenIn, tokenOut) on-chain
    |        expectedOutput = benchmark * (1 - eboTolerance)
    |
    |-(4)-> If actualOutput < expectedOutput:
    |        → SLASHABLE. Proceed to claim.


 PHASE F: CLAIM COORDINATION (Gensyn AXL mesh)
 ────────────────────────────────────────────────────────────────
  Sentinel (winner)                Warden (peer)
    |                                    |
    |  POST /send signed claim to        |
    |  peer via AXL HTTP API             |
    |  {orderHash, tokenId, claimedAt,   |
    |   deadline, Ed25519 signature}     |
    |                                    |
    |  ── Yggdrasil e2e encrypted ──>    |  GET /recv, verify claim
    |                                    |  verify Ed25519 sig
    |  wait 30s backoff                  |  back off (earlier claimedAt wins)
    |                                    |
    |  verify 0G Storage KV:             |
    |    kvClient.getValue(streamId,     |
    |    orderHash) → no competing claim |
    |                                    |
    |  write own claim to KV via Batcher |
    |  read-after-write verification     |
    |                                    |
    --> proceed to challenge submission


 PHASE G: CHALLENGE SUBMISSION (via KeeperHub)
 ────────────────────────────────────────────────────────────────
  Winning Agent
    |  pre-sign Permit2 EIP-712 bond permit
    |  POST webhook → KeeperHub workflow
    v
  KeeperHub Workflow
    |  [Webhook Trigger] → payload validated
    |  [Web3 Write] → Challenger.submit(orderHash, bond, ...)
    |    KeeperHub wallet (0xC204...bf8) as delegate
    |    Turnkey-signed, Base, gas estimation
    v
  Challenger.sol (on-chain)
    |  verify msg.sender is authorized delegate
    |  verify challenger's ENS subname (challengers.reckonprotocol.eth)
    |  verify iNFT ownership via OwnerRegistry.ownerOf(tokenId)
    |  pull challenger bond from owner's Permit2 permit
    |  benchmark = EBBOOracle.computeBenchmark(tokenIn, tokenOut)
    |  expectedOutput = benchmark * (1 - eboTolerance)
    |
    |  IF actualOutput < expectedOutput:
    |    → CHALLENGE SUCCEEDS → slash
    |  ELSE:
    |    → CHALLENGE FAILS → challenger loses bond


 PHASE H: SLASHING
 ────────────────────────────────────────────────────────────────
  Challenger.sol
    |  slashAmount = min(solverBond, expectedOutput - actualOutput)
    v
  RoyaltyDistributor.sol
    |  60% → swapper (restitution)
    |  30% → OwnerRegistry.ownerOf(agentTokenId) (iNFT owner)
    |  10% → protocol treasury
    |
    |  challenger bond returned in full
    |  solver reputation decremented
    |  slash appended to next 0G Storage Log batch
    |
    --> emit Slashed(orderHash, solver, amount, distribution)


 PHASE I: REPUTATION FEEDBACK
 ────────────────────────────────────────────────────────────────
  Relayer (on challenge events)
    |
    |  writeReputationDelta():
    |    append to MongoDB `reputation_events`
    |    upsert MongoDB `reputation_updates`
    |    call SolverRegistry.setText(node, "reckon.reputation", "0.84")
    |
    --> On-chain text records updated via SolverRegistry
    --> CCIP-Read gateway serves live values from MongoDB


 TRUST BOUNDARY SUMMARY
 ────────────────────────────────────────────────────────────────
  WHAT'S OBJECTIVE                    WHAT'S TRUSTED (hackathon scope)
  ──────────────────────              ──────────────────────────────
  EBBO benchmark (on-chain math)      Relayer records fills honestly
  Slashing logic (deterministic)      Relayer attests iNFT ownership
  ENS subname gating (on-chain)       CCIP-Read gateway signs honestly
  AXL e2e encryption (Yggdrasil)      Mock iNFT oracle (not TEE/ZKP)
  0G Storage audit trail (Merkle)     MongoDB availability
  Permit2 bond mechanics              KeeperHub gas estimation
```

---

## System Participants

| Actor | Role |
|-------|------|
| **Swapper** | Creates UniswapX orders tagged with `ReckonValidator` and an EBBO tolerance. Receives 60% restitution on successful challenges |
| **Solver** | Registers `<name>.solvers.reckonprotocol.eth` virtual subname, posts USDC bond scaled by reputation, fills UniswapX orders. Bond is at risk if fills breach EBBO tolerance |
| **Demo Solver** | Reference UniswapX solver (`solver/`) that auto-registers ENS subname + auto-bonds on startup. Fills USDC↔WETH orders through the PriorityOrderReactor |
| **Challenger Agent (iNFT)** | ERC-7857 iNFT on 0G Galileo. Boots from encrypted brain blob on 0G Storage. Monitors fills via KeeperHub, runs suspicion triage via 0G Compute, computes EBBO benchmark, coordinates claims over AXL mesh, submits challenges via KeeperHub. Two agents deployed: Sentinel (#0) and Warden (#2) |
| **Reckon Relayer** | Off-chain service. Subscribes to UniswapX Fill events and iNFT Transfer events. Records fills on-chain and in MongoDB. Attests iNFT ownership cross-chain. Batches audit trail to 0G Storage Log. Handles subname registration |
| **ReckonValidator** | View-only UniswapX `additionalValidationContract`. Gates fills on solver registration in `SolverRegistry`. Never blocks valid fills |
| **EBBOOracle** | On-chain benchmark computation. Reads 3 canonical Uniswap v3/v4 pools, returns equal-weighted geometric mean |
| **KeeperHub** | Execution layer. Three webhook workflows: fill event monitoring, EBBO benchmark reads, and challenge submission with Turnkey signing and gas estimation |
| **CCIP-Read Gateway** | Off-chain ENSIP-10 resolver. Queries MongoDB, signs EIP-712 responses per EIP-3668. Serves live reputation for all `*.reckonprotocol.eth` subnames |

---

## Smart Contracts

### Base (9 contracts)

| Contract | Purpose |
|----------|---------|
| **ReckonValidator.sol** | View-only UniswapX `additionalValidationContract` &mdash; gates fills on `SolverRegistry` registration, tolerance decoding, multi-output rejection |
| **FillRegistry.sol** | Fill recording by permissioned relayer. Emits `FillRecorded` and `FillBatchAnchored` events |
| **EBBOOracle.sol** | Benchmark computation &mdash; reads `slot0` / `StateView.getSlot0` from 3 canonical pools, returns equal-weighted geometric mean in 1e18 precision |
| **SolverBondVault.sol** | USDC bond storage keyed by ENS namehash. Dynamic bond requirement: `baseBond * decay(reputation)` |
| **Challenger.sol** | Challenge submission &mdash; ENS + iNFT ownership verification, delegate execution support for KeeperHub, Permit2 bond pull, on-chain EBBO comparison, automatic slashing |
| **RoyaltyDistributor.sol** | 60/30/10 slash distribution &mdash; swapper restitution, iNFT owner bounty (via `OwnerRegistry`), protocol cut |
| **OwnerRegistry.sol** | Relayer-attested cross-chain iNFT ownership cache with freshness timestamps |
| **SolverRegistry.sol** | On-chain namehash registry for solvers. Relayer-attested mirror of MongoDB. Supports `setText()` for reputation records |
| **ChallengerRegistry.sol** | On-chain namehash registry for challengers. Relayer-attested |

### Ethereum Mainnet (1 contract)

| Contract | Purpose |
|----------|---------|
| **ReckonWildcardResolver.sol** | ENSIP-10 + EIP-3668 wildcard resolver. All subname queries under `reckonprotocol.eth` revert with `OffchainLookup`, redirecting clients to the CCIP-Read gateway. Deployed on Ethereum mainnet |

### 0G Galileo Testnet (2 contracts)

| Contract | Address | Purpose |
|----------|---------|---------|
| **ChallengerNFT.sol** (proxy) | [`0x98b6D75380FC3Cb3483D88f6178A128e848582a0`](https://chainscan-galileo.0g.ai/address/0x98b6D75380FC3Cb3483D88f6178A128e848582a0) | ERC-7857 iNFT &mdash; forked from `0g-agent-nft`. Encrypted brain blob on 0G Storage. Mock oracle for demo |
| **MockVerifier.sol** | [`0x46F62F768aB7bE35C3131fa5bE7a8c8CD1328A4b`](https://chainscan-galileo.0g.ai/address/0x46F62F768aB7bE35C3131fa5bE7a8c8CD1328A4b) | Transfer validity proof verifier for ERC-7857 |

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| Validator is `view`-only | UniswapX's `IValidationCallback.validate()` interface is `external view`. Cannot write storage or emit events. Relayer records fills separately |
| ENS namehash keying | `SolverBondVault`, `FillRegistry`, and registries key by namehash, not address. Identity is the ENS subname, not the wallet |
| Virtual subnames via CCIP-Read | Subnames exist only in MongoDB, served by CCIP-Read gateway. No per-subname gas costs. Standard ENS clients resolve them transparently |
| Equal-weighted geometric mean | Preserves clean `1/sqrt(N)` manipulation-resistance bound. TVL weighting is undefined for concentrated liquidity |
| Relayer-attested `OwnerRegistry` | Cross-chain iNFT ownership without LayerZero/Wormhole. Honest hackathon scoping; bridge is the production path |
| MongoDB over subgraph | Simpler architecture, fewer moving parts. Dashboard and CCIP-Read gateway query directly with read-only credentials |
| Permit2 SignatureTransfer | Single-use signed permits for bond pulls. No long-lived allowances |
| KeeperHub delegate pattern | `Challenger.sol` supports delegate execution so KeeperHub's wallet submits transactions while bonds are pulled from the agent owner's Permit2 permit |
| Two-layer claim coordination | AXL is fast (sub-second P2P); 0G Storage KV is durable. Combined: fast common case + correct under network partition |
| Separate solver/challenger namespaces | `solvers.reckonprotocol.eth` and `challengers.reckonprotocol.eth` are disjoint namehash spaces, enabling self-challenge prevention via a single namehash inequality check |

---

## Integrations

| Integration | Role in Reckon | How It's Used |
|-------------|---------------|---------------|
| **ENS** | Canonical identity layer | Virtual subnames under `reckonprotocol.eth` via ENSIP-10 wildcard resolver + CCIP-Read on Ethereum mainnet. Reputation in text records (`reckon.reputation`, `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`). All contracts key by namehash. Any ENS client resolves solver reputation with zero Reckon integration |
| **0G** | iNFT platform + storage + compute | `ChallengerNFT` (ERC-7857) on Galileo. AES-256-GCM brain blobs on Storage. `claim_state` on Storage KV. Suspicion triage + NL slash explanations via Compute Router API (Qwen 2.5 7B, GLM-5-FP8). Fill batch archival on Storage Log |
| **Gensyn AXL** | Encrypted challenger mesh | 2-node P2P mesh with Yggdrasil e2e encryption. `POST /send` + `GET /recv` HTTP API for claim broadcasting. Ed25519 signed claims with deterministic tiebreaker. Partition-tolerant via 0G KV fallback |
| **KeeperHub** | Execution + reliability layer | Three webhook workflows: fill event monitoring, EBBO benchmark reads, challenge submission with delegate execution. KeeperHub wallet set as `agentDelegate` on `Challenger.sol`. Execution log polling for tx hash retrieval |
| **UniswapX** | Core swap infrastructure | `ReckonValidator` as `additionalValidationContract` on `PriorityOrderReactor`. Fill events drive the entire challenge pipeline. v3/v4 pools as EBBO oracle inputs |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Smart Contracts** | Solidity 0.8.26 + Foundry | 10 contracts on Base, 1 on Ethereum mainnet, 2 on 0G Galileo |
| **UniswapX** | PriorityOrderReactor on Base | `additionalValidationContract` integration, Fill event source |
| **Uniswap Pools** | v3 + v4 on Base | EBBO oracle inputs (3 canonical pools per pair) |
| **Identity** | ENS (mainnet wildcard resolver + CCIP-Read) | Virtual subnames, reputation text records, wildcard resolution |
| **iNFTs** | ERC-7857 on 0G Galileo | Challenger agent ownership + encrypted brain storage |
| **Storage** | 0G Storage Log + KV | Batched fill audit trail (Log), claim coordination state (KV) |
| **AI Compute** | 0G Compute Router API | Suspicion triage + natural-language slash explanations |
| **Mesh Networking** | Gensyn AXL (Yggdrasil + TLS) | First-claim-wins dedup across challenger agents |
| **Execution** | KeeperHub + Turnkey | Webhook workflows for fill monitoring, EBBO reads, challenge submission |
| **Bonds** | Permit2 SignatureTransfer | Single-use signed permits for solver + challenger USDC bonds |
| **Relayer** | TypeScript + viem + Bun | Fill recording, iNFT ownership attestation, 0G Storage batching, subname registration |
| **Read Store** | MongoDB Atlas (free M0) | Events, reputation, subnames, attestations &mdash; source of truth for virtual ENS subnames |
| **CCIP-Read** | ENSIP-10 + EIP-3668 gateway | Live reputation from MongoDB, EIP-712 signed per CCIP-Read protocol |
| **Demo Solver** | TypeScript + viem + Hono | Reference UniswapX solver with auto-registration + auto-bonding |
| **Frontend** | Next.js | Dashboard &mdash; per-solver track record, fill feed, challenge history, 0G data surface |
| **Network** | Base + Ethereum mainnet + 0G Galileo | Primary chain + ENS anchor + iNFT chain |

---

## Deployed Contracts

### Base Sepolia

**Reckon contracts:**

| Contract | Address |
|----------|---------|
| ReckonValidator | [`0xf10453657F61E76BFEE00088F6bB5273396c2F61`](https://sepolia.basescan.org/address/0xf10453657F61E76BFEE00088F6bB5273396c2F61) |
| FillRegistry | [`0xb2f6cDEe56CcA45c9D7AeFe6E268C013C23a0C1D`](https://sepolia.basescan.org/address/0xb2f6cDEe56CcA45c9D7AeFe6E268C013C23a0C1D) |
| EBBOOracle | [`0xd6DC5aBc7c4f4078d161959A0b030CEf6B1c1AA6`](https://sepolia.basescan.org/address/0xd6DC5aBc7c4f4078d161959A0b030CEf6B1c1AA6) |
| SolverBondVault | [`0x8195ba15E335A4205c2bA2d928dC8BCd563CC783`](https://sepolia.basescan.org/address/0x8195ba15E335A4205c2bA2d928dC8BCd563CC783) |
| Challenger | [`0xc249d4BDF82e3ba86C5Ddc16f58A031994b8E6cE`](https://sepolia.basescan.org/address/0xc249d4BDF82e3ba86C5Ddc16f58A031994b8E6cE) |
| RoyaltyDistributor | [`0x0f3D395EF5c68DBEEd6e66801a12461f876b26e5`](https://sepolia.basescan.org/address/0x0f3D395EF5c68DBEEd6e66801a12461f876b26e5) |
| OwnerRegistry | [`0x9d6f172f5cE50b16602a7C6d3836Cd6540D1E6AC`](https://sepolia.basescan.org/address/0x9d6f172f5cE50b16602a7C6d3836Cd6540D1E6AC) |
| SolverRegistry | [`0x08ed027C8E3a8f7A877333F1A940bd91f6bB3DBD`](https://sepolia.basescan.org/address/0x08ed027C8E3a8f7A877333F1A940bd91f6bB3DBD) |
| ChallengerRegistry | [`0x34D283590D58B56d0c92e6b3e2c4cD7C9E432678`](https://sepolia.basescan.org/address/0x34D283590D58B56d0c92e6b3e2c4cD7C9E432678) |

**External contracts (Uniswap):**

| Contract | Address |
|----------|---------|
| UniswapX PriorityOrderReactor | [`0x000000001Ec5656dcdB24D90DFa42742738De729`](https://basescan.org/address/0x000000001Ec5656dcdB24D90DFa42742738De729) |
| Permit2 | [`0x000000000022D473030F116dDEE9F6B43aC78BA3`](https://basescan.org/address/0x000000000022D473030F116dDEE9F6B43aC78BA3) |

### 0G Galileo Testnet (chain 16602)

| Contract | Address |
|----------|---------|
| ChallengerNFT (proxy) | [`0x98b6D75380FC3Cb3483D88f6178A128e848582a0`](https://chainscan-galileo.0g.ai/address/0x98b6D75380FC3Cb3483D88f6178A128e848582a0) |
| ChallengerNFT (impl) | [`0x9681338391D4C4Cf6F411cC91bE6ee0478fF195D`](https://chainscan-galileo.0g.ai/address/0x9681338391D4C4Cf6F411cC91bE6ee0478fF195D) |
| MockVerifier | [`0x46F62F768aB7bE35C3131fa5bE7a8c8CD1328A4b`](https://chainscan-galileo.0g.ai/address/0x46F62F768aB7bE35C3131fa5bE7a8c8CD1328A4b) |

**Minted iNFTs:**

| Token ID | Name | Tx |
|----------|------|-----|
| #0 | Sentinel | [`0xa3a6...`](https://chainscan-galileo.0g.ai/tx/0xa3a660d2e51ee39b51f30bdb0aeb4a49c4bdf27b23bab5c24bc5ba455da6b0da) |
| #2 | Warden | [`0x3c9d...`](https://chainscan-galileo.0g.ai/tx/0x3c9dc5c0baff57aba2d0e54f09fd4b83f26b77f78e3aba43a55a5e9f2a0d5a93) |

### Ethereum Mainnet

| Contract / Name | Address |
|-----------------|---------|
| ReckonWildcardResolver | [`0xb7c8876a5c1e94c33a8163e8f9b639554195ef43`](https://etherscan.io/address/0xb7c8876a5c1e94c33a8163e8f9b639554195ef43) |
| [`reckonprotocol.eth`](https://app.ens.domains/reckonprotocol.eth) | Parent name &mdash; anchor for wildcard subname resolution |
| `*.solvers.reckonprotocol.eth` | Virtual solver subnames (served via CCIP-Read) |
| `*.challengers.reckonprotocol.eth` | Virtual challenger subnames (served via CCIP-Read) |

---

## Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (stable &mdash; run `foundryup`)
- Node.js >= 18
- Base mainnet RPC endpoint (Alchemy or QuickNode)
- [0G Galileo](https://faucet.0g.ai) funded wallet
- [KeeperHub](https://app.keeperhub.com) `kh_`-prefixed API key

### 1. Clone, Install & Build

```bash
git clone https://github.com/SakshiShah29/Reckon.git
cd Reckon
npm install
npm run build
```

This installs all workspace dependencies and builds all packages (`packages/types` first, then all workspaces in parallel).

### 2. Build & Test Contracts

```bash
cd packages/contracts
forge build
forge test
```

Tests run against an Anvil fork of Base mainnet via `vm.createSelectFork()` &mdash; real UniswapX reactor, real Uniswap pools, real liquidity.

### 3. Configure Environment

```bash
cp .env.example .env
```

| Variable | How to Get It |
|----------|---------------|
| `BASE_MAINNET_RPC` | Alchemy or QuickNode Base mainnet endpoint |
| `PRIVATE_KEY` | Deployer/relayer wallet private key (0x-prefixed) |
| `MONGODB_URI_RW` | MongoDB Atlas read-write connection string (relayer) |
| `MONGODB_URI_RO` | MongoDB Atlas read-only connection string (dashboard/gateway) |
| `ZG_RPC_URL` | `https://evmrpc-testnet.0g.ai` |
| `ZG_INDEXER_URL` | `https://indexer-storage-testnet-turbo.0g.ai` |
| `ZG_AGENT_PRIVATE_KEY` | 0G Galileo wallet private key |
| `KH_API_KEY` | KeeperHub `kh_`-prefixed organisation API key |
| `KH_WEBHOOK_URL` | KeeperHub challenge submission webhook URL |
| `KH_FILL_WEBHOOK_URL` | KeeperHub fill listener webhook URL |
| `KH_EBBO_WEBHOOK_URL` | KeeperHub EBBO benchmark read webhook URL |

### 4. Run the Relayer

```bash
npm start -w indexer
```

### 5. Run the Demo Solver

```bash
npm start -w solver
```

The solver auto-registers its ENS subname and auto-bonds USDC on startup.

### 6. Run Challenger Agents

```bash
# Copy and fill in agent env vars (ZG_*, KH_*, AXL config, iNFT token ID)
cp agent/sentinel/.env.example agent/sentinel/.env
cp agent/warden/.env.example agent/warden/.env

# Sentinel agent
npm start -w agent

# Warden agent (separate terminal / machine)
cd agent/warden && npm start
```

### 7. Run the CCIP-Read Gateway

```bash
npm start -w ccip-gateway
```

### 8. Launch Dashboard

```bash
npm run dev -w dashboard
# http://localhost:3000
```

---

## End-to-End Flow

```
 1.  Solver registers bunni.solvers.reckonprotocol.eth  → virtual subname in MongoDB + SolverRegistry on Base
 2.  Solver bonds 1000 USDC into SolverBondVault        → keyed by ENS namehash
 3.  Swapper tags order with ReckonValidator + 50bp      → tolerance encoded in order
 4.  Solver fills the order on UniswapX                  → ReckonValidator.validate() gates
 5.  Relayer detects Fill event                          → records in FillRegistry + MongoDB
 6.  Relayer batches fills to 0G Storage Log             → Merkle root anchored on Base
 7.  Challenger agent detects FillRecorded               → via KeeperHub fill listener workflow
 8.  Agent runs suspicion triage via 0G Compute          → scores fill 0.0-1.0
 9.  Agent reads EBBO benchmark via KeeperHub            → EBBOOracle.computeBenchmark() on-chain
10.  Agent broadcasts claim on AXL mesh                  → first-claim-wins via POST /send + GET /recv
11.  Agent verifies claim durability on 0G KV            → read-after-write verification
12.  Agent submits challenge via KeeperHub webhook       → KeeperHub wallet as delegate, Permit2 bond
13.  Challenger.sol verifies and slashes                 → 60% swapper / 30% iNFT owner / 10% protocol
14.  Solver reputation decremented                       → SolverRegistry.setText() + MongoDB + CCIP-Read
15.  Slash logged to 0G Storage + MongoDB                → permanent audit trail
```

---

## Project Structure

```
reckon/
├── packages/
│   ├── contracts/                              # Solidity contracts
│   │   ├── src/
│   │   │   ├── ReckonValidator.sol             # View-only UniswapX validation hook
│   │   │   ├── FillRegistry.sol               # Fill recording + batch anchoring
│   │   │   ├── EBBOOracle.sol                 # Multi-pool geometric mean benchmark
│   │   │   ├── SolverBondVault.sol            # USDC bond vault, namehash-keyed
│   │   │   ├── Challenger.sol                 # Challenge submission + slashing + delegation
│   │   │   ├── RoyaltyDistributor.sol         # 60/30/10 slash distribution
│   │   │   ├── OwnerRegistry.sol              # Cross-chain iNFT ownership cache
│   │   │   ├── SolverRegistry.sol             # On-chain solver namehash registry + text records
│   │   │   ├── ChallengerRegistry.sol         # On-chain challenger namehash registry
│   │   │   ├── ens/
│   │   │   │   ├── ReckonWildcardResolver.sol  # ENSIP-10 + EIP-3668 wildcard resolver
│   │   │   │   └── IExtendedResolver.sol       # ENSIP-10 interface
│   │   │   ├── inft/
│   │   │   │   ├── ChallengerNFT.sol          # ERC-7857 iNFT (0G Galileo)
│   │   │   │   └── MockVerifier.sol           # Transfer validity proof verifier
│   │   │   └── interfaces/
│   │   │       ├── IReckonRegistrar.sol        # Registrar interface
│   │   │       ├── IReckonNamehashLookup.sol   # Namehash lookup interface
│   │   │       └── IRoyaltyDistributor.sol     # Royalty distributor interface
│   │   ├── test/                               # Foundry tests (Anvil-forked Base)
│   │   │   ├── E2E.t.sol                      # End-to-end + delegation tests
│   │   │   ├── ReckonWildcardResolver.t.sol   # EIP-712 signature path tests
│   │   │   └── ...                            # Per-contract unit tests
│   │   ├── script/
│   │   │   ├── DeployBase.s.sol               # Base mainnet deploy
│   │   │   ├── DeployENSResolver.s.sol        # Ethereum mainnet ENS resolver deploy
│   │   │   ├── DeployZGGalileo.s.sol          # 0G Galileo iNFT deploy
│   │   │   └── SetDelegate.s.sol              # KeeperHub wallet delegate setup
│   │   └── lib/
│   │       └── 0g-agent-nft/                  # 0G's reference ERC-7857 implementation
│   └── types/                                  # Shared TypeScript types + constants
│       └── src/
│           ├── constants.ts                   # ENS names, 0G endpoints, AXL config
│           └── brain-blob.ts                  # BrainBlob TypeScript type
├── agent/                                      # Challenger agents
│   ├── sentinel/                              # Sentinel agent (iNFT #0)
│   │   └── src/
│   │       ├── index.ts                       # Orchestrator — wires KeeperHub + AXL
│   │       ├── boot.ts                        # iNFT brain decryption + init
│   │       ├── bootstrap.ts                   # ENS subname + registration
│   │       ├── listener.ts                    # Fill event listener
│   │       ├── triage.ts                      # 0G Compute suspicion scoring
│   │       ├── ebbo.ts                        # KeeperHub EBBO benchmark reads
│   │       ├── coordinate.ts                  # AXL broadcast + 0G KV coordination
│   │       ├── decide.ts                      # Cost-benefit challenge decision
│   │       ├── submit.ts                      # KeeperHub webhook challenge submission
│   │       └── challenge.ts                   # Challenge pipeline orchestration
│   └── warden/                                # Warden agent (iNFT #2) — same structure
├── solver/                                     # Demo UniswapX solver
│   └── src/
│       ├── index.ts                           # Hono HTTP server (POST /fill, GET /health)
│       ├── filler.ts                          # PriorityOrderReactor.execute()
│       ├── validate.ts                        # Order decoding + validation
│       └── bootstrap.ts                       # Auto-registration + bond deposit
├── indexer/                                    # Off-chain relayer
│   └── src/
│       ├── index.ts                           # Relayer entry point
│       ├── fill-listener.ts                   # Subscribe to UniswapX Fill events
│       ├── fill-recorder.ts                   # Write to FillRegistry + MongoDB
│       ├── challenge-listener.ts              # Listen for challenges, write reputation
│       ├── owner-attester.ts                  # Cross-chain iNFT ownership attestation
│       ├── storage-batcher.ts                 # 0G Storage Log batching
│       ├── registrar.ts                       # Subname registration handler
│       ├── bond-unlocker.ts                   # Bond unlock management
│       └── db.ts                              # MongoDB connection
├── ccip-gateway/                               # CCIP-Read gateway server
│   ├── src/
│   │   ├── server.ts                          # Express app entrypoint
│   │   ├── routes/ccip.ts                     # GET /:sender/:data.json per EIP-3668
│   │   ├── signer.ts                          # EIP-712 response signing
│   │   ├── db.ts                              # MongoDB lookup by namehash
│   │   └── utils/ens.ts                       # text/addr selector decoder
│   ├── scripts/
│   │   ├── e2e-resolve.ts                     # End-to-end viem getEnsText round-trip
│   │   ├── seed-subnames.ts                   # Dev seeding helper
│   │   └── test-gateway.ts                    # Local smoke tests
│   └── test/                                   # Gateway test suite
├── inft-tools/                                 # iNFT brain blob tooling
│   └── src/
│       ├── encrypt.ts                         # AES-256-GCM seal/unseal
│       ├── upload.ts                          # Brain blob upload to 0G Storage
│       ├── provision.ts                       # npx reckon-provision CLI (mint + upload)
│       └── setup-env.ts                       # Existing-token env setup
├── multi-agent/                                # Multi-agent deployment configs
│   ├── configs/                               # AXL node configurations
│   ├── envs/                                  # Per-agent environment files
│   ├── keys/                                  # Ed25519 identity keys
│   └── scripts/                               # Deployment scripts
├── axl/                                        # Gensyn AXL (built from source)
├── dashboard/                                  # Next.js frontend
│   └── src/
│       ├── app/
│       │   ├── dashboard/                     # Main dashboard view
│       │   ├── register/                      # Solver/challenger registration UI
│       │   ├── swap/                          # Swap interface
│       │   ├── zero-g/                        # 0G data surface
│       │   ├── protocol/                      # Protocol overview
│       │   ├── adjudication/                  # Challenge adjudication view
│       │   └── api/                           # API routes (fills, challenges, stats, etc.)
│       └── components/
│           ├── solver-leaderboard.tsx          # ENS subname leaderboard
│           ├── fill-feed.tsx                  # Real-time fill feed
│           ├── challenge-feed.tsx             # Challenge history
│           ├── ebbo-oracle.tsx                # EBBO oracle visualization
│           └── ...                            # Stats, charts, protocol views
├── assets/
│   ├── logo.png
│   └── banner.png
├── specs/                                      # Design specifications
├── 0G.md                                       # 0G partner integration documentation
├── ENS.md                                      # ENS partner integration documentation
├── GENSYN.md                                   # Gensyn partner integration documentation
├── KEEPERHUB.md                                # KeeperHub partner integration documentation
└── README.md
```

---

## Future Work

- **Permissionless fill recording** via fill-receipt proofs (removing relayer trust assumption)
- **Production iNFT oracle** via TEE/ZKP (replacing mock oracle)
- **Trustless cross-chain ownership** via LayerZero/Wormhole (replacing `OwnerRegistry` relay)
- **Multi-output order support** (currently rejected in v1)
- **Multi-chain deployment** (Ethereum mainnet, Arbitrum, Unichain)
- **TVL-weighted or adaptive benchmark** with formal manipulation-resistance proofs

---

## Team

Built for [ETHGlobal](https://ethglobal.com) &mdash; 2 builders, 4-week online format.

---

## License

MIT License &mdash; see [LICENSE](./LICENSE) for details.

---

<p align="center">
  <img src="./assets/logo.png" alt="Reckon Logo" width="80" />
</p>

<p align="center">
  <i>We settle solver fills by math, not by vote.</i><br/>
  <i>Powered by <a href="https://uniswap.org">UniswapX</a> &bull; Identity via <a href="https://ens.domains">ENS</a> &bull; Agents on <a href="https://0g.ai">0G</a> &bull; Mesh via <a href="https://gensyn.ai">Gensyn AXL</a> &bull; Execution via <a href="https://keeperhub.com">KeeperHub</a> &bull; Deployed on <a href="https://base.org">Base</a></i>
</p>
