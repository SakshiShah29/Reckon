# Reckon Deployment Order

Arrows (→) indicate "depends on" — a component can only deploy after everything it points to is live.

---

## Layer 0: Infrastructure (no dependencies)

Deploy these first, in any order — they depend on nothing.

| # | Component | Chain / Host | What it is |
|---|---|---|---|
| 0a | **MongoDB Atlas** | Cloud (M0 free tier) | Two users: `relayer` (read-write), `consumer` (read-only). Stores virtual subnames, fill records, reputation, owner attestations, agent runs |
| 0b | **3 VPS instances** | Hetzner + 2x Fly.io | Bare servers for AXL mesh + agent runtime. No code yet |
| 0c | **Galileo wallets funded** | 0G Galileo (16602) | Drip from faucet over 3 days (0.1 0G/day cap). Needed for Storage uploads + Compute deposits + ChallengerNFT deploy |

---

## Layer 1: Base Contracts — No Cross-References

These contracts only need external addresses (USDC, Permit2) or an owner/relayer EOA. No Reckon contract depends on another yet.

| # | Component | Chain | Constructor needs | Purpose |
|---|---|---|---|---|
| 1a | **OwnerRegistry** | Base | `owner`, `attester` (relayer EOA) | Cross-chain iNFT ownership cache |
| 1b | **SolverRegistry** | Base | `owner`, `relayer` EOA | On-chain namehash list for solvers, implements `IReckonRegistrar` |
| 1c | **ChallengerRegistry** | Base | `owner`, `relayer` EOA | On-chain namehash list for challengers, implements `IReckonNamehashLookup` |
| 1d | **EBBOOracle** | Base | `owner` | Multi-pool geometric mean benchmark. Pool list proposed here (48h timelock before commit) |

---

## Layer 2: Base Contracts — Depend on Layer 1

| # | Component | Chain | Constructor needs | Purpose |
|---|---|---|---|---|
| 2a | **SolverBondVault** | Base | `owner`, USDC, **SolverRegistry** (1b) | Holds solver USDC bonds, reads reputation text for bond sizing |
| 2b | **FillRegistry** | Base | `owner`, **SolverRegistry** (1b), **SolverBondVault** (2a), `recorder` EOA | Records fills, locks solver bonds, anchors 0G batch roots |
| 2c | **ReckonValidator** | Base | **SolverRegistry** (1b) | View-only UniswapX validation callback — gates fills on solver registration |

---

## Layer 3: Base Contracts — Depend on Layer 2

| # | Component | Chain | Constructor needs | Purpose |
|---|---|---|---|---|
| 3a | **RoyaltyDistributor** | Base | `owner`, USDC, **OwnerRegistry** (1a), **FillRegistry** (2b), `treasury` | Splits slash proceeds 60/30/10 |
| 3b | **Challenger** | Base | `owner`, **FillRegistry** (2b), **EBBOOracle** (1d), **SolverBondVault** (2a), **OwnerRegistry** (1a), **SolverRegistry** (1b), **ChallengerRegistry** (1c), Permit2, USDC, `treasury` | The orchestrator contract — preflight, benchmark, slash or fail |

---

## Layer 4: Post-Deploy Wiring (one-shot setters)

These are single-use setter calls that link contracts to each other. Must happen after all contracts exist.

| # | Call | Why |
|---|---|---|
| 4a | `SolverBondVault.setFillRegistry(FillRegistry)` | So FillRegistry can call `lockOnFill` / `unlockOnFill` |
| 4b | `SolverBondVault.setRoyaltyDistributor(RoyaltyDistributor)` | So RoyaltyDistributor can call `slash` |
| 4c | `SolverBondVault.setChallenger(Challenger)` | So Challenger can call `slash` / `lock` / `unlock` |
| 4d | `FillRegistry.setChallenger(Challenger)` | So Challenger can call `markSlashed` |
| 4e | `RoyaltyDistributor.setSolverBondVault(SolverBondVault)` | So distributor can read bond state |
| 4f | `EBBOOracle.commitPoolList(USDC, WETH)` | Commit the pool list proposed in 1d (must wait 48h on mainnet; instant on Anvil via `vm.warp`) |

---

## Layer 5: 0G Galileo — ChallengerNFT

Independent of Base contracts. Can deploy in parallel with Layers 1-4.

| # | Component | Chain | What happens |
|---|---|---|---|
| 5a | **MockVerifier** | 0G Galileo (16602) | TEE/ZKP mock oracle for demo |
| 5b | **ChallengerNFT** (impl + ERC1967Proxy) | 0G Galileo (16602) | ERC-7857 iNFT. `initialize("Reckon Challenger", "RECK", storageInfo, MockVerifier, admin)` |

---

## Layer 6: Off-Chain — CCIP-Read Gateway

Depends on: MongoDB (0a). ENS wildcard resolver already deployed.

| # | Component | Host | What it does |
|---|---|---|---|
| 6a | **CCIP-Read Gateway** | Node.js service | Reads virtual subnames from MongoDB, signs responses with the key the `ReckonWildcardResolver` trusts. Serves `*.solvers.reckon.eth` and `*.challengers.reckon.eth` |

---

## Layer 7: Off-Chain — Relayer

Depends on: MongoDB (0a), all Base contracts (Layers 1-4), ChallengerNFT (5b).

| # | Component | Host | What it does |
|---|---|---|---|
| 7a | **Relayer** | VPS / cloud | Subscribes to `Fill` events on PriorityOrderReactor (Base), `Transfer` events on ChallengerNFT (0G Galileo). Calls `FillRegistry.recordFill`, `OwnerRegistry.attestOwner`, `SolverBondVault.unlockOnFill`, `SolverRegistry.setText`. Batches fills to 0G Storage Log |

The relayer cannot start until:
- Base contracts are deployed and wired (it calls `recordFill`, `attestOwner`, `register`, `setText`, `unlockOnFill`)
- ChallengerNFT is deployed on Galileo (it subscribes to `Transfer` events)
- MongoDB is reachable (it writes to multiple collections)

---

## Layer 8: Agent Infrastructure — AXL Mesh

Depends on: 3 VPSes (0b).

| # | Component | Host | What happens |
|---|---|---|---|
| 8a | **AXL node (hub)** | Hetzner | `go build -o node ./cmd/node/` from pinned SHA. Ed25519 keypair generated. Listens on `tls://0.0.0.0:9001`, HTTP API at `localhost:9002` |
| 8b | **AXL node (spoke US)** | Fly.io US | Same binary, peers to hub. No listen |
| 8c | **AXL node (spoke EU)** | Fly.io EU | Same binary, peers to hub. No listen |

Verify: `curl http://127.0.0.1:9002/topology` on hub shows `Peers: 2`.

---

## Layer 9: Agent Runtime — Brain Blobs + Orchestrator

Depends on: AXL mesh (Layer 8), ChallengerNFT minted (5b), 0G Storage + Compute funded, Base contracts live, relayer live.

| # | Component | Host | What happens |
|---|---|---|---|
| 9a | **Brain blob upload** | Builder B local | Generate Ed25519 keypair + EBBO prefs + `kh_` API key per agent. AES-256-GCM encrypt. Upload to 0G Storage Log. Capture Merkle root |
| 9b | **Mint iNFTs** | 0G Galileo tx | `ChallengerNFT.mint(owner, root, sealedKey)` — one per agent identity. Links brain blob root to token |
| 9c | **Orchestrator boot (x3)** | Each VPS | Reads iNFT from Galileo → downloads brain from 0G Storage → decrypts → writes AXL key to `private.pem` → starts AXL node → subscribes to `FillRecorded` events → runs SKILL.md loop |

---

## Layer 10: Dashboard + KeeperHub

Depends on: MongoDB (0a), Base contracts (for address references), relayer (for live data).

| # | Component | Host | What it does |
|---|---|---|---|
| 10a | **Dashboard** | Vercel / static host | Solver registration UI, fill explorer, agent runs panel, reputation display |
| 10b | **KeeperHub skill pack** | KeeperHub platform | Published skills for fill audit queries and slash explanations. Schedule workflow for daily reputation flush |

---

## Dependency Graph (simplified)

```
MongoDB (0a)          Galileo wallets (0c)       VPSes (0b)
    │                       │                       │
    ├──► CCIP Gateway (6a)  │                       │
    │                       ▼                       │
    │              MockVerifier (5a)                 │
    │                       │                       │
    │              ChallengerNFT (5b)                │
    │                       │                       ▼
    │                       │               AXL mesh (8a-c)
    │                       │                       │
    ▼                       │                       │
Base Layer 1 (1a-d)         │                       │
    │                       │                       │
    ▼                       │                       │
Base Layer 2 (2a-c)         │                       │
    │                       │                       │
    ▼                       │                       │
Base Layer 3 (3a-b)         │                       │
    │                       │                       │
    ▼                       │                       │
Wiring (4a-f)               │                       │
    │                       │                       │
    ├───────────┬───────────┘                       │
    ▼           ▼                                   │
  Relayer (7a)                                      │
    │                                               │
    ├───────────────────────────────────────────────┘
    ▼
Brain blobs + mint iNFTs (9a-b)
    │
    ▼
Orchestrator boot (9c)
    │
    ▼
Dashboard + KeeperHub (10a-b)
```

---

## What can run in parallel

- **Layers 0a-0c** all in parallel (infra setup)
- **Layers 1-4** (Base contracts) and **Layer 5** (0G Galileo ChallengerNFT) are independent — deploy simultaneously
- **Layer 6** (CCIP gateway) only needs MongoDB — can start as soon as 0a is done
- **Layer 8** (AXL mesh) only needs VPSes — can start as soon as 0b is done
- **Layer 7** (relayer) is the convergence point — needs both Base contracts and Galileo ChallengerNFT
- **Layer 9** (agent runtime) is the final convergence — needs everything
