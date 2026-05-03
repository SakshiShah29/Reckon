# ENS in Reckon

Reckon is a cryptoeconomic validation layer for DeFi solvers. Every solver and every challenger participates through an **ENS subname** under [`reckonprotocol.eth`](https://app.ens.domains/reckonprotocol.eth) — and that subname is the load-bearing identifier the protocol uses for slashing, bonding, gating, attribution, and reputation. This document maps how ENS is wired into the protocol and addresses the two ENS qualification criteria directly.

---

## At a glance

| What | Where it lives | Notes |
|---|---|---|
| Parent name | `reckonprotocol.eth` on Ethereum mainnet | Owned by the Reckon deployer wallet |
| Virtual subnames | `*.solvers.reckonprotocol.eth`, `*.challengers.reckonprotocol.eth` | Don't exist on-chain; served via CCIP-Read |
| On-chain wildcard resolver | [`packages/contracts/src/ens/ReckonWildcardResolver.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/ens/ReckonWildcardResolver.sol) | ENSIP-10 + EIP-3668; deployed to Ethereum mainnet |
| CCIP-Read gateway | [`ccip-gateway/`](https://github.com/SakshiShah29/Reckon/tree/main/ccip-gateway/) | Node.js + Express; signs responses with EIP-712 |
| On-chain namehash registries | [`SolverRegistry.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/SolverRegistry.sol), [`ChallengerRegistry.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/ChallengerRegistry.sol) | Base mainnet; relayer-attested mirror |
| Bond / fill keying | [`SolverBondVault.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/SolverBondVault.sol), [`FillRegistry.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/FillRegistry.sol) | Storage keyed by `bytes32 namehash`, never by `address` |
| Validator gating | [`ReckonValidator.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/ReckonValidator.sol) | UniswapX `additionalValidationContract` reverts if filler has no subname |
| Registration UI | [`dashboard/src/app/register/page.tsx`](https://github.com/SakshiShah29/Reckon/blob/main/dashboard/src/app/register/page.tsx) | Live, end-to-end; writes Mongo + on-chain via the relayer |
| Constants (single source of truth) | [`packages/types/src/constants.ts`](https://github.com/SakshiShah29/Reckon/blob/main/packages/types/src/constants.ts) | `ENS_PARENT_NAME`, `SOLVERS_PARENT`, `CHALLENGERS_PARENT` |

---

## Criterion 1 — ENS clearly improves the product. Demo is functional, no hard-coded values.

ENS is not a label slapped on top of an address-keyed system. **The contracts literally cannot operate without ENS namehashes** — every storage slot that holds a solver bond, every fill record, every reputation text record, and every validator gate uses `bytes32 node` (the ENSIP-1 namehash of the subname) as the key. Removing ENS would require rewriting the contracts.

### Where ENS does load-bearing work

1. **Bond storage is keyed by namehash, not by address.** [`SolverBondVault.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/SolverBondVault.sol) holds USDC keyed by `mapping(bytes32 node => uint256 bondedAmount)`. A solver's address is never the key — the namehash of `<label>.solvers.reckonprotocol.eth` is. This means a solver's *identity* (their subname) carries the bond, not their *signing key* (which can rotate). Address rotation, EOA → smart-account migration, and multi-EOA solver setups all keep the bond intact because the namehash is stable.

2. **The validator gates fills on ENS subname existence.** Reckon's UniswapX integration is a view-only `additionalValidationContract` (per the UniswapX spec). On every fill, [`ReckonValidator.validate()`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/ReckonValidator.sol) calls `solverRegistry.isRegistered(filler)` — and `SolverRegistry`'s registration is the on-chain mirror of the ENS subname. **Solvers without an ENS subname under `solvers.reckonprotocol.eth` cannot fill orders that reference the Reckon validator.** This is the literal mechanism that converts the protocol from address-permissioned to ENS-permissioned.

3. **Reputation lives at ENS text records — solver-only.** When a solver gets slashed, the relayer's [`writeReputationDelta`](https://github.com/SakshiShah29/Reckon/blob/main/indexer/src/challenge-listener.ts) appends an immutable event to MongoDB's `reputation_events` and upserts the aggregate (`reputationScore`, `totalFills`, `slashCount`, `lastSlashTimestamp`) into `reputation_updates` keyed by the solver's namehash. The same call then flushes the new score to `SolverRegistry.setText(node, "reckon.reputation", "...")` on Base. External apps reading `bunni.solvers.reckonprotocol.eth`'s `reckon.reputation` text record via viem / ethers / wagmi get the live aggregate through CCIP-Read; the on-chain text record is the durable mirror that `SolverBondVault.requiredBond` consumes. Challenger subnames under `challengers.reckonprotocol.eth` deliberately carry **no** reputation text records — challengers are identified by namehash for auth and bounty routing, but they don't accrue solver-style scores ([gateway enforces this guard](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/db.ts)).

4. **Fill records carry the namehash, not the address.** [`FillRegistry.recordFill()`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/FillRegistry.sol) writes the filler's namehash into the `FillRecord` struct, and the slashing path in [`Challenger.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/Challenger.sol) routes the slash to the namehash-keyed bond. Even if the filler swapped wallets between fill and challenge, the slash hits the right party — because ENS identity, not EOA address, is the protocol's notion of "who".

### "No hard-coded values" — what the live demo actually does

- **Subname registration is end-user driven.** Anyone can visit the [registration page](https://github.com/SakshiShah29/Reckon/blob/main/dashboard/src/app/register/page.tsx), type a label (e.g. `bunni`), pick role (solver / challenger), and the dashboard's [`/api/register` route](https://github.com/SakshiShah29/Reckon/blob/main/dashboard/src/app/api/register/route.ts) forwards to the relayer's [`registrar.ts`](https://github.com/SakshiShah29/Reckon/blob/main/indexer/src/registrar.ts) which (a) inserts into MongoDB and (b) calls `SolverRegistry.register(namehash(...), owner)` on Base. After confirmation, the subname is live globally — **`<label>.solvers.reckonprotocol.eth` resolves via standard ENS** without any client knowing it's "virtual".
- **The wildcard resolver is real and deployed to Ethereum mainnet.** The deploy script ([`script/DeployENSResolver.s.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/script/DeployENSResolver.s.sol)) is parameterized by `OWNER` / `GATEWAY_SIGNER` / `GATEWAY_URL` env vars — no hard-coded addresses. Set `reckonprotocol.eth`'s resolver to the deployed contract via `app.ens.domains` once, and every ENS-aware client can resolve any subname.
- **The CCIP-Read gateway returns real Mongo data.** [`ccip-gateway/src/routes/ccip.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/routes/ccip.ts) decodes the standard `text(node, key)` and `addr(node)` selectors per [`utils/ens.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/utils/ens.ts), looks up the record in MongoDB, and signs an EIP-712 response using the same typehash the resolver verifies on-chain ([`signer.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/signer.ts)). The wallet on the gateway, the namehash in the request, and the value returned are all dynamic.
- **End-to-end resolution is exercised in CI** by [`ccip-gateway/scripts/e2e-resolve.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/scripts/e2e-resolve.ts), which performs a full viem `getEnsText` call against the live mainnet resolver and asserts the round-trip works.
- **Forge tests verify the EIP-712 signature path** with real (test-generated) keys: [`ReckonWildcardResolver.t.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/test/ReckonWildcardResolver.t.sol) signs `(result, expires, sender, requestHash, resultHash)` with `vm.sign`, calls `resolveWithProof`, and asserts the contract recovers the right signer. No fixed signatures.

### What you'd see in the demo

1. Pull up [`bunni.solvers.reckonprotocol.eth`](https://app.ens.domains/bunni.solvers.reckonprotocol.eth) in any ENS client → resolves to the registered owner address and current reputation text via CCIP-Read.
2. Submit a UniswapX order with a solver that *doesn't* have a subname → fill reverts at `ReckonValidator.validate` with `NotRegistered`.
3. Trigger a slash via `Challenger.submit` → relayer updates Mongo → the next text record fetch returns the new reputation. Externally observable, not protocol-internal.

---

## Criterion 2 — Obvious improvement to agent identity / discoverability. Not cosmetic.

Reckon has three classes of agent that all derive their identity from ENS:


### Solvers

A solver agent's identity *is* its subname. The validator only knows about solvers via `solverRegistry.namehashOf(filler)`, the bond vault only knows about them via `bondedAmount[namehash]`, and the dashboard solver leaderboard ([`solver-leaderboard.tsx`](https://github.com/SakshiShah29/Reckon/blob/main/dashboard/src/components/solver-leaderboard.tsx)) displays them by ENS subname rather than truncated `0x...` addresses. The solver's bootstrap path ([`solver/src/bootstrap.ts`](https://github.com/SakshiShah29/Reckon/blob/main/solver/src/bootstrap.ts)) uses `viem`'s `namehash(fullName)` to derive its on-chain identity; it does not start without one.

### Challengers (iNFT-owned)

Challenger agents are minted as ERC-7857 iNFTs ([`ChallengerNFT.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/inft/ChallengerNFT.sol)), and the human owner of that iNFT registers a subname under `challengers.reckonprotocol.eth`. When a challenge succeeds, 30% of the slash routes via [`RoyaltyDistributor.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/RoyaltyDistributor.sol) to the iNFT owner — and the on-chain check `msg.sender` must own a registered challenger subname (per [`Challenger.sol`'s preflight](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/Challenger.sol)) before the slash even runs. ENS is the auth boundary; each challenger agent's bootstrap reads its subname from the iNFT brain blob ([`agent/sentinel/src/bootstrap.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/bootstrap.ts), [`agent/warden/src/bootstrap.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/bootstrap.ts)).

### Solvers and challengers share one resolver but live in two namespaces

`solvers.reckonprotocol.eth` and `challengers.reckonprotocol.eth` are **separate namehash spaces**, which lets the protocol enforce role separation purely through namehash inequality. The self-challenge guard in `Challenger._preflight` is one line:

```solidity
require(challengerNode != r.fillerNamehash, SelfChallengeForbidden());
```

That works *because* ENS gives us two disjoint subname trees with stable namehashes — no per-role address sets, no flag bits, no lookup tables.

### Discoverability — third-party apps can resolve Reckon agents without knowing about Reckon

This is the most important point and the one easiest to demo:

> **A third-party DeFi UI that has never heard of Reckon can call `viem.getEnsText({ name: 'bunni.solvers.reckonprotocol.eth', key: 'reckon.reputation' })` and get the live reputation back, signed and verifiable, without integrating any Reckon SDK or RPC.**

The text record keys Reckon publishes are documented constants in [`packages/types/src/constants.ts`](https://github.com/SakshiShah29/Reckon/blob/main/packages/types/src/constants.ts) and are served **only for subnames under `solvers.reckonprotocol.eth`** (the gateway intentionally returns empty strings for these keys on challenger subnames):

- `reckon.reputation` — current decayed reputation in `[0, 1e18]`
- `reckon.totalFills` — lifetime fill count
- `reckon.slashCount` — lifetime slash count
- `reckon.lastSlash` — unix seconds of most recent slash

This is the discoverability win. An aggregator can build a "honest solvers" leaderboard, a wallet can warn users when they're about to route through a solver with a recent slash, a block explorer can label fillers with their Reckon subname — all by hitting standard ENS, no extra infrastructure. The CCIP-Read response contains the gateway's EIP-712 signature, so the consuming app can verify Reckon (the entity controlling the signer key registered in `ReckonWildcardResolver.signer`) really did vouch for the value.

### Why ENS specifically, not "any decentralized identifier"

ENS is the only identity layer where:

1. The namehash is a 32-byte value usable as a `mapping` key in Solidity without indirection.
2. Resolution is supported zero-config in viem, ethers, wagmi, RainbowKit, Etherscan, every wallet — so "discoverable" actually means *every existing tool already does it*.
3. The wildcard + CCIP-Read combo means we don't have to mint thousands of NFT-backed subnames or pay gas for every text record update. Subnames are virtual until they need to be on-chain, and `setText` is batched daily via KeeperHub.

---

## Architecture map

```
                         ┌────────────────────────────────────┐
                         │  Ethereum Mainnet                  │
                         │  reckonprotocol.eth                │
                         │  resolver = ReckonWildcardResolver │ ◄── set once via app.ens.domains
                         └─────────────┬──────────────────────┘
                                       │  ENSIP-10 wildcard,
                                       │  EIP-3668 OffchainLookup
                                       ▼
                         ┌────────────────────────────────────┐
                         │  ccip-gateway/  (Node.js)          │
                         │  - decodes text/addr selectors     │
                         │  - reads MongoDB                   │
                         │  - signs EIP-712 response          │
                         └─────────────┬──────────────────────┘
                                       │
                                       ▼
                                 MongoDB Atlas
                                       ▲
                                       │ writes
                                       │
   ┌───────────────────┐  ┌────────────┴───────────────┐  ┌────────────────────┐
   │ Dashboard         │  │ Relayer                    │  │ KeeperHub schedule │
   │ /register UI      ├─►│ indexer/src/registrar.ts   │  │ (daily flush)      │
   └───────────────────┘  │  - inserts Mongo           │  │  - rewrites        │
                          │  - calls SolverRegistry    │  │    reckon.reputation│
                          │    .register() on Base     │  │    text on-chain    │
                          └────────────┬───────────────┘  └─────────┬──────────┘
                                       │                            │
                                       ▼                            ▼
                          ┌──────────────────────────────────────────────────┐
                          │  Base Mainnet                                    │
                          │                                                  │
                          │  SolverRegistry / ChallengerRegistry             │
                          │   ├─ register(namehash, owner)                   │
                          │   └─ setText(namehash, "reckon.reputation", "…") │
                          │                                                  │
                          │  SolverBondVault                                 │
                          │   └─ bondedAmount[namehash]                      │
                          │                                                  │
                          │  ReckonValidator (UniswapX boundary)             │
                          │   └─ revert if !isRegistered(filler)             │
                          │                                                  │
                          │  Challenger / RoyaltyDistributor                 │
                          │   └─ slash → namehash-keyed bond                 │
                          └──────────────────────────────────────────────────┘
```

---

## Live links

- ENS parent: https://app.ens.domains/reckonprotocol.eth
- Example virtual subname: `bunni.solvers.reckonprotocol.eth` (resolve via any ENS client)
- Public dashboard with live ENS-resolved leaderboard: see [`dashboard/`](https://github.com/SakshiShah29/Reckon/tree/main/dashboard/)

## File and folder index

### Solidity (Ethereum mainnet)

- [`packages/contracts/src/ens/ReckonWildcardResolver.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/ens/ReckonWildcardResolver.sol) — ENSIP-10 + EIP-3668 wildcard resolver
- [`packages/contracts/src/ens/IExtendedResolver.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/ens/IExtendedResolver.sol) — ENSIP-10 interface
- [`packages/contracts/script/DeployENSResolver.s.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/script/DeployENSResolver.s.sol) — parameterized deploy
- [`packages/contracts/test/ReckonWildcardResolver.t.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/test/ReckonWildcardResolver.t.sol) — EIP-712 signature path tests

### Solidity (Base mainnet — namehash-keyed contracts)

- [`packages/contracts/src/SolverRegistry.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/SolverRegistry.sol) — production `IReckonRegistrar`, on-chain mirror of MongoDB
- [`packages/contracts/src/ChallengerRegistry.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/ChallengerRegistry.sol) — minimal namehash list for challengers
- [`packages/contracts/src/SolverBondVault.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/SolverBondVault.sol) — bonds keyed by `bytes32 namehash`
- [`packages/contracts/src/FillRegistry.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/FillRegistry.sol) — `FillRecord.fillerNamehash`
- [`packages/contracts/src/ReckonValidator.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/ReckonValidator.sol) — UniswapX gate via `solverRegistry.isRegistered`
- [`packages/contracts/src/Challenger.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/Challenger.sol) — preflight uses namehash equality for self-challenge guard
- [`packages/contracts/src/interfaces/IReckonRegistrar.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/interfaces/IReckonRegistrar.sol) — interface every namehash-aware contract takes in its constructor

### CCIP-Read gateway (Node.js, off-chain)

- [`ccip-gateway/src/server.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/server.ts) — Express app entrypoint
- [`ccip-gateway/src/routes/ccip.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/routes/ccip.ts) — `GET /:sender/:data.json` per EIP-3668
- [`ccip-gateway/src/utils/ens.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/utils/ens.ts) — decoder for `text` / `addr` / `addr(coinType)` selectors
- [`ccip-gateway/src/signer.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/signer.ts) — EIP-712 response signing (typehash mirrors `MESSAGE_TYPEHASH` in the resolver)
- [`ccip-gateway/src/db.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/db.ts) — MongoDB lookup by namehash
- [`ccip-gateway/scripts/seed-subnames.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/scripts/seed-subnames.ts) — dev seeding helper
- [`ccip-gateway/scripts/e2e-resolve.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/scripts/e2e-resolve.ts) — end-to-end viem `getEnsText` round-trip against the deployed resolver
- [`ccip-gateway/scripts/test-gateway.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/scripts/test-gateway.ts) — local gateway smoke tests

### Relayer (off-chain — writes Mongo + on-chain registries)

- [`indexer/src/registrar.ts`](https://github.com/SakshiShah29/Reckon/blob/main/indexer/src/registrar.ts) — handles dashboard registration requests; dual-writes Mongo + `SolverRegistry.register` / `ChallengerRegistry.register`

### Dashboard (registration UI + leaderboard)

- [`dashboard/src/app/register/page.tsx`](https://github.com/SakshiShah29/Reckon/blob/main/dashboard/src/app/register/page.tsx) — end-user subname registration flow (label validation, wallet connect, USDC bond deposit)
- [`dashboard/src/app/api/register/route.ts`](https://github.com/SakshiShah29/Reckon/blob/main/dashboard/src/app/api/register/route.ts) — relayer proxy
- [`dashboard/src/components/solver-leaderboard.tsx`](https://github.com/SakshiShah29/Reckon/blob/main/dashboard/src/components/solver-leaderboard.tsx), [`dashboard/src/components/protocol-solvers.tsx`](https://github.com/SakshiShah29/Reckon/blob/main/dashboard/src/components/protocol-solvers.tsx) — display solvers by ENS subname

### Shared constants

- [`packages/types/src/constants.ts`](https://github.com/SakshiShah29/Reckon/blob/main/packages/types/src/constants.ts) — `ENS_PARENT_NAME`, `SOLVERS_PARENT`, `CHALLENGERS_PARENT`, text record key constants

### Agent bootstrap (reads ENS identity at startup)

- [`solver/src/bootstrap.ts`](https://github.com/SakshiShah29/Reckon/blob/main/solver/src/bootstrap.ts) — solver derives namehash from its subname before publishing fills
- [`agent/sentinel/src/bootstrap.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/bootstrap.ts) — Sentinel challenger agent loads iNFT brain → resolves its `challengers.reckonprotocol.eth` subname → joins the AXL mesh under that identity
- [`agent/warden/src/bootstrap.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/bootstrap.ts) — Warden challenger agent, same pattern with its own subname

### Reference implementation we built against

- [`ensdomains/offchain-resolver`](https://github.com/ensdomains/offchain-resolver) — ENS Labs' canonical CCIP-Read example. The `MESSAGE_TYPEHASH` in [`ReckonWildcardResolver.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/ens/ReckonWildcardResolver.sol) and the gateway signer in [`ccip-gateway/src/signer.ts`](https://github.com/SakshiShah29/Reckon/blob/main/ccip-gateway/src/signer.ts) are pinned to the same struct shape so they cannot drift.
