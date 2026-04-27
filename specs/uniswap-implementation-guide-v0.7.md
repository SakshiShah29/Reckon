# Uniswap Implementation Guide for Reckon v0.7

**Source:** `https://developers.uniswap.org/docs/uniswap-ai/llms.txt` (index) plus the linked pages: UniswapX architecture/deployments, v4 deployments, v4 pool-data SDK guide, Permit2 signature-transfer concept, Trading API integration guide.
**Date compiled:** 2026-04-27
**Scope:** Per the v0.7 bounty strategy, **Uniswap is stack-only — not a bounty target.** This guide is about *technical correctness of the stack we depend on*, not about scoring placement. There is no FEEDBACK.md, no API integration novelty, no skill pack to ship.

Reckon's Uniswap surface (per spec FR-2/FR-3, FR-4):

1. **`ReckonValidator` plugged into UniswapX as `additionalValidationContract`** on Base mainnet (FR-2, FR-3, Phase 1 Day 2).
2. **`PriorityOrderReactor` Fill events** consumed by Reckon's off-chain indexer (FR-3, Phase 1 Day 5-7) — the `view`-only validator can't record state, so the indexer is the recording path.
3. **v3 + v4 pool reads** (`slot0` / `StateView.getSlot0`) feeding `EBBOOracle.computeBenchmark()` (FR-4, Phase 1 Day 5-6).
4. **Permit2** for solver and challenger USDC bond pulls (FR-1, FR-5).

Out of scope: Trading API integration, Universal Router, Smart Wallet, The Compact, Liquidity Launchpad, custom-interface-links, subgraphs, governance.

---

## 0. Pin the addresses

All addresses below are real Base mainnet (chain 8453) addresses, queryable from the Anvil-fork during dev (FR-2 dev model). No testnet substitutes — UniswapX has zero testnet deployments anywhere.

### 0.1 UniswapX

| Chain | Reactor | Address |
|---|---|---|
| **Base (8453)** | **PriorityOrderReactor** | `0x000000001Ec5656dcdB24D90DFa42742738De729` |
| Unichain (130) | PriorityOrderReactor | `0x00000006021a6Bce796be7ba509BBBA71e956e37` |
| Arbitrum (42161) | DutchV3OrderReactor | `0xB274d5F4b833b61B340b654d600A864fB604a87c` |
| Mainnet (1) | V2DutchOrderReactor | `0x00000011f84b9aa48e5f8aa8b9897600006289be` |
| Mainnet (1) | V1ExclusiveDutchOrderReactor | `0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4` |

**Reckon target:** PriorityOrderReactor on Base. Pin in `@reckon-protocol/types/addresses.ts`. Confirm via Anvil-fork on Day 1 of Phase 0 — the bytecode at that address is the integration target for every test in the project.

### 0.2 Permit2 (canonical, all chains)

```
0x000000000022D473030F116dDEE9F6B43aC78BA3
```

Already pinned in spec (FR-5, pre-build checklist). Use the **SignatureTransfer** path — single-use signed `PermitTransferFrom`, no long-lived allowances. See §4.

### 0.3 Uniswap v4 contracts on Base mainnet

| Contract | Address | Reckon usage |
|---|---|---|
| **PoolManager** | `0x498581ff718922c3f8e6a244956af099b2652b2b` | Singleton holding all v4 pool state |
| **StateView** | `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71` | **Off-chain view layer.** `getSlot0(poolId)` returns `(sqrtPriceX96, tick, ...)`. Read by `EBBOOracle.computeBenchmark()`. |
| PositionManager | `0x7c5f5a4bbd8fd63184577525326123b519429bdc` | Not used (no LP work in Reckon) |

**Note for the spec:** the v0.7 spec text in FR-4 says `StateLibrary.getSlot0(poolManager, poolId)`. Per docs, the canonical pattern is to call **`StateView.getSlot0(poolId)`** on the StateView contract — `StateLibrary` is the underlying Solidity library; `StateView` is the deployed view contract that exposes it. Functionally equivalent for our oracle's purposes; pin the deployed StateView address as the call target.

### 0.4 Uniswap v3 pools

v3 pools are addressed individually (no singleton). For each canonical USDC/WETH pair on Base we need:

- The pool contract address (top-3 by TVL, looked up Day 1 of Phase 0 per spec).
- Read pattern: `IUniswapV3Pool(pool).slot0()` returns `(sqrtPriceX96, tick, observationIndex, observationCardinality, observationCardinalityNext, feeProtocol, unlocked)`. We use `sqrtPriceX96` only.

The v3 SDK docs don't enumerate the math; the spec already commits to `FullMath.mulDiv(sqrtPriceX96 * sqrtPriceX96, 1e18, 1 << 192)` in FR-4. That math is correct (squared sqrtPrice, scaled to 1e18) and standard.

---

## 1. The `view`-only validator constraint — already resolved in v0.7

The original v0.3 spec assumed `validate()` could record state. **It cannot — the interface is `external view`.** The v0.7 spec correctly resolves this with the off-chain indexer/relayer pattern (FR-3): validator gates, indexer records.

This guide locks in the implementation specifics. Pin the actual interface in our codebase rather than re-deriving it from the spec text:

```solidity
// from Uniswap/UniswapX/src/interfaces/IValidationCallback.sol
interface IValidationCallback {
    function validate(address filler, ResolvedOrder calldata resolvedOrder) external view;
}
```

What `view` rules out — and how Reckon side-steps each:

| Operation | Allowed in view? | Reckon's path |
|---|---|---|
| Read storage on this contract | Yes | ENS namehash lookup against `solvers.reckon.eth` registrar |
| Read storage on other contracts (via `view`/`pure` calls) | Yes | ENS resolver reads, `OwnerRegistry` reads |
| Write storage | No | Indexer calls `FillRegistry.recordFill()` from a permissioned EOA after observing the reactor's `Fill` event |
| Emit events | No | `FillRecorded` is emitted from `FillRegistry`, not `ReckonValidator` |
| Call non-view functions | No | None attempted from `validate()` |
| Revert (with reason) | Yes | This is the gating mechanism — revert if filler has no subname |

`validate()`'s entire job:

1. Resolve `filler` to its ENS namehash via reverse-lookup on the `solvers.reckon.eth` registrar. **Read-only.**
2. Revert if no subname is registered for the filler.
3. `abi.decode(resolvedOrder.info.additionalValidationData, (uint16))` — sanity check that the swapper-encoded `eboTolerance` parses cleanly. Revert on bad input.
4. Return silently. **Never block a valid fill** — that violates UniswapX's social contract.

Gas budget per NFR-1: ≤ 30k. Realistic — an ENS reverse-lookup is one storage read; abi.decode is gas-free. Comfortable margin.

---

## 2. ResolvedOrder — what `validate()` actually receives

From `Uniswap/UniswapX/src/base/ReactorStructs.sol`:

```solidity
struct OrderInfo {
    IReactor reactor;
    address swapper;
    uint256 nonce;
    uint256 deadline;
    IValidationCallback additionalValidationContract;   // ← Reckon's slot
    bytes additionalValidationData;                      // ← carries eboTolerance
}

struct InputToken {
    ERC20 token;
    uint256 amount;
    uint256 maxAmount;   // for Dutch auctions
}

struct OutputToken {
    address token;
    uint256 amount;
    address recipient;
}

struct ResolvedOrder {
    OrderInfo info;
    InputToken input;
    OutputToken[] outputs;   // ← array, multi-output orders are real
    bytes sig;
    bytes32 hash;
}
```

Reckon's extraction map (used in indexer when handling `Fill` events, since `validate()` itself doesn't need amounts — it only gates on identity):

| Spec field | Source |
|---|---|
| `inputAmount` | `resolvedOrder.input.amount` |
| `outputAmount` | `resolvedOrder.outputs[0].amount` (multi-output rejected, see §2.1) |
| `swapper` | `resolvedOrder.info.swapper` |
| `eboTolerance` (uint16, basis points) | `abi.decode(resolvedOrder.info.additionalValidationData, (uint16))` |
| `tokenIn` | `address(resolvedOrder.input.token)` |
| `tokenOut` | `resolvedOrder.outputs[0].token` |
| `recipient` (for restitution) | `resolvedOrder.outputs[0].recipient` |

### 2.1 Multi-output orders — reject in v1

`outputs` is an array. The spec rejects `outputs.length != 1` in v1 (FR-3, NFR-3). Two enforcement points:

- **`ReckonValidator.validate()`** can revert on `resolvedOrder.outputs.length != 1` (view-allowed, just a length read). Doing it here means the **fill never happens** in the first place.
- **Indexer** also skips multi-output `Fill` events with a warning log. Belt-and-suspenders; if a pre-Reckon multi-output order somehow reaches the indexer, we don't crash.

Recommendation: **enforce in the validator**, not just the indexer. The validator runs at submission time — failing fast prevents a malformed fill from settling and creating a phantom record. Update FR-3 to pin this.

### 2.2 The swapper-side surface (FR-2)

Per Trading API integration guide, the API exposes a `POST /order` endpoint that creates a UniswapX order. The docs do **not** explicitly cover how `additionalValidationContract` gets injected at order construction — it's an `OrderInfo` field, set client-side before signing.

For the demo flow, two paths:

- **Direct construction** (likely): the swapper UI builds the `OrderInfo` struct and sets `additionalValidationContract = ReckonValidator`, `additionalValidationData = abi.encode(uint16(eboToleranceBps))`. Signs with EIP-712. Submits via Trading API or directly to the reactor.
- **Trading API** (uncertain): if the API doesn't expose the field, we sidestep the API and submit signed orders directly. Spec already commits to "no UniswapX fork needed, no UI modification needed beyond setting two existing fields." Phase 0 verification task: confirm the field is settable through whatever swapper flow we demo with.

**Phase 0 to-do (Builder A):** check `POST /order` request body schema for `additionalValidationContract` field. If absent, demo path is direct EIP-712 signing + direct reactor submission (a small viem helper, ~50 LoC).

---

## 3. EBBO oracle — reading v3 and v4 pool prices (FR-4)

### 3.1 v3 read pattern

For each canonical v3 pool in our pool list:

```solidity
// pseudocode for EBBOOracle.computeBenchmark(tokenIn, tokenOut)
(uint160 sqrtPriceX96, , , , , , ) = IUniswapV3Pool(pool).slot0();
// price ratio scaled to 1e18, token1/token0
uint256 priceX18 = FullMath.mulDiv(
    uint256(sqrtPriceX96) * sqrtPriceX96,
    1e18,
    1 << 192
);
// invert if pool's token0 != tokenIn
```

`slot0()` returns the standard 7-field tuple; we only need the first (`sqrtPriceX96`). Token0/token1 ordering must be normalized — the spec already pins this in FR-4.

### 3.2 v4 read pattern

For v4 pools, state lives in the singleton PoolManager but is read through the **StateView** contract:

```solidity
// pseudocode
PoolId poolId = Pool.getPoolId(currency0, currency1, fee, tickSpacing, hooks);
(uint160 sqrtPriceX96, int24 tick, /* lpFee */ ) = IStateView(STATE_VIEW).getSlot0(poolId);
```

Off-chain (TypeScript, for indexer/agent suspicion-triage paths):

```typescript
import { Pool } from '@uniswap/v4-sdk';

const poolId = Pool.getPoolId(currency0, currency1, fee, tickSpacing, hooks);
const [slot0, liquidity] = await Promise.all([
  stateViewContract.getSlot0(poolId, { blockTag: blockNum }),
  stateViewContract.getLiquidity(poolId, { blockTag: blockNum }),
]);
```

For Base mainnet:

```typescript
const STATE_VIEW_BASE = '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71';
const POOL_MANAGER_BASE = '0x498581ff718922c3f8e6a244956af099b2652b2b';
```

### 3.3 PoolKey/PoolId notes

`PoolId` is a `bytes32` derived from `keccak256(abi.encode(currency0, currency1, fee, tickSpacing, hooks))` (the standard PoolKey hash). The SDK's `Pool.getPoolId()` is the canonical helper. For our 3 canonical pools per pair, **pre-compute and hardcode** the PoolIds at deploy time — they're deterministic from the PoolKey, never change.

### 3.4 Equal-weighted geometric mean

Already pinned in FR-4. Manipulation-resistance bound `1/sqrt(N)` for N=3 holds when weights are equal (NFR-2). No changes here — just call out that the v3 and v4 prices both arrive in the same `1e18`-scaled `token1/token0` form, so they're directly comparable for the geometric mean. Where a pool stores `tokenIn` as `token1` rather than `token0`, the inversion happens **before** entering the geometric-mean computation.

### 3.5 Reading at a specific block

Both v3's `slot0()` and v4's StateView calls are block-scoped naturally (RPC `eth_call` with `blockTag`). When the indexer processes a `Fill` event and the agent computes the EBBO benchmark, **read pool state at `Fill.blockNumber`**, not at the head of chain. Otherwise an honest fill executed at block N can be falsely flagged if prices moved between block N and the agent's compute time. This is implicit in the spec but worth pinning explicitly in FR-4: `EBBOOracle.computeBenchmark(...)` called from `Challenger.submit()` reads at `block.number`, but the off-chain agent's pre-flight check should pin to `fillBlock`.

---

## 4. Permit2 SignatureTransfer for bonds (FR-1, FR-5)

Both solver bonding (FR-1) and challenger bonding (FR-5) use Permit2 SignatureTransfer — single-use, signed, no long-lived allowances.

### 4.1 The struct shape

```solidity
struct PermitTransferFrom {
    TokenPermissions permitted;
    uint256 nonce;
    uint256 deadline;
}

struct TokenPermissions {
    address token;        // USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    uint256 amount;
}
```

Reckon's contracts (`SolverBondVault`, `Challenger`) call:

```solidity
function permitTransferFrom(
    PermitTransferFrom memory permit,
    SignatureTransferDetails calldata transferDetails,
    address owner,
    bytes calldata signature
) external;
```

Where `transferDetails = { to: address(this), requestedAmount: bond }` and `signature` is EOA, EIP-2098 compact, or EIP-1271 contract signature.

### 4.2 Why this matters for Reckon's bond model

The KeeperHub agentic wallet has hard caps (100 USDC per transfer, 200 USDC daily). Reckon's `baseBond = 1000 USDC` (FR-1) cannot move through the agentic wallet — already pinned in spec and in `keeperhub-implementation-guide-v0.7.md` §0. **Permit2 SignatureTransfer is the alternative path:** the solver/challenger signs a permit off-chain, our contract pulls the bond directly from their EOA in one transaction, no allowance lingers.

### 4.3 No Universal Router needed

Universal Router is a routing aggregator for v2/v3/v4 swaps. **Reckon does not swap.** We only pull stablecoin bonds; we don't trade through the Universal Router. The spec correctly omits it.

---

## 5. The Anvil-fork dev model — pinned to Base mainnet

UniswapX has **zero testnet deployments anywhere** (per spec, confirmed in deployments page — only Mainnet, Arbitrum, Base, Unichain are listed; no Sepolia variants). The implication is already baked into v0.7's dev model:

- `anvil --fork-url <BASE_MAINNET_RPC>` runs a local fork that has the **real PriorityOrderReactor at `0x000000001Ec5656dcdB24D90DFa42742738De729`** with all its real bytecode, plus real Uniswap v3/v4 pools with real liquidity for the EBBO oracle.
- Foundry's `vm.createSelectFork()` brings the same fork into test files.
- Hetzner-hosted long-running fork serves as the shared dev environment for AXL spokes during integration testing.

Phase 0 verification (already in spec):
1. RPC endpoint supports fork-mode methods (Alchemy and QuickNode both do).
2. `vm.createSelectFork()` works in a hello-world Foundry test.
3. Reading `PriorityOrderReactor` state on the fork returns expected non-zero values — confirms the fork is healthy and the address is correct.

---

## 6. Trading API and custom-interface-links — out of scope, but worth noting

Two surfaces a judge *might* ask about that we explicitly do not target:

- **Trading API** (`/quote`, `/swap`, `/order`, `/swaps`, `/orders`, `/check_approval`). For Reckon's demo, the swapper either uses an existing Uniswap UI that exposes `additionalValidationContract` (unconfirmed) or signs orders directly via a small custom helper. We don't ship Trading API integration code.
- **Custom interface links / deep links.** Listed in the docs index. Not used by Reckon. If a judge asks "could swappers opt into Reckon protection through a deep link?" the answer is "yes, via a constructed link with the validator and tolerance pre-filled, but it's not built in v1."

These are honest omissions consistent with v0.7's "Uniswap stack-only, not bounty target" framing.

---

## 7. End-to-end checklist by phase

### Phase 0 Day 1 (Builder A):

- [ ] Pin Base mainnet UniswapX `PriorityOrderReactor` address in `@reckon-protocol/types/addresses.ts`: `0x000000001Ec5656dcdB24D90DFa42742738De729`
- [ ] Pin Permit2 canonical: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- [ ] Pin v4 PoolManager + StateView for Base
- [ ] Confirm Base mainnet RPC supports fork-mode (`vm.createSelectFork()` hello-world Foundry test)
- [ ] Read `PriorityOrderReactor` state via Anvil fork — non-zero returns confirm the fork
- [ ] Look up top-3 USDC/WETH pools by TVL on Base mainnet (per spec); record both v3 pool addresses and v4 PoolKeys

### Phase 1 Day 2 (Builder A):

- [ ] Import `IValidationCallback` interface from `Uniswap/UniswapX/src/interfaces/`
- [ ] Write `ReckonValidator.validate()` as `external view`:
  - ENS namehash lookup (revert on missing subname)
  - `outputs.length == 1` enforcement (revert otherwise)
  - `abi.decode(additionalValidationData, (uint16))` sanity check
- [ ] Foundry test against Anvil-fork: pass valid order, fail invalid (no subname, multi-output, malformed validation data)

### Phase 1 Day 5-7 (Builder A):

- [ ] Indexer subscribes to `PriorityOrderReactor.Fill(orderHash, filler, swapper, nonce)` events on Anvil-fork
- [ ] Decode event payload, fetch resolved order details, call `FillRegistry.recordFill()` from permissioned relayer EOA
- [ ] Skip multi-output orders with warning log
- [ ] Idempotent on duplicates

### Phase 1 Day 5-6 (concurrent, Builder A):

- [ ] `EBBOOracle.computeBenchmark(tokenIn, tokenOut)`:
  - Read v3 `slot0()` for hardcoded canonical pools
  - Read v4 `StateView.getSlot0(poolId)` for hardcoded PoolIds
  - Normalize token0/token1 ordering per pool
  - Compute equal-weighted geometric mean
- [ ] Multisig + timelock for pool list upgrade (per FR-4)

### Phase 1 (Builder A, throughout):

- [ ] `SolverBondVault.bondSolver(...)` and `Challenger.submit(...)` both use Permit2 `permitTransferFrom` against canonical address

### Phase 4 Day 22-23 (Builder A):

- [ ] Switch indexer config from Anvil-fork RPC to real Base mainnet RPC. One-line change.
- [ ] Verify `Fill` events arrive from real `PriorityOrderReactor` on mainnet.

---

## 8. Spec deltas this guide locks in

These are commitments the spec should reference back to:

1. **`IValidationCallback` is `external view`.** Validator gates only; recording happens off-chain via indexer subscribed to `Fill` events. (Already in v0.7; preserve.)
2. **PriorityOrderReactor on Base = `0x000000001Ec5656dcdB24D90DFa42742738De729`.** Pin at deploy time; never derive.
3. **Multi-output enforcement at the validator**, not just the indexer. Belt-and-suspenders. Update FR-3.
4. **EBBO benchmark reads pool state at `fillBlock`**, not at head, in the agent's pre-flight check. On-chain `EBBOOracle.computeBenchmark()` from `Challenger.submit()` reads at `block.number` (the challenge block), which is acceptable inside the 30-min window.
5. **v4 pool reads use StateView, not StateLibrary directly.** StateView is the deployed view contract; StateLibrary is the underlying lib. Pin StateView Base address `0xa3c0c9b65bad0b08107aa264b0f3db444b867a71`.
6. **Pre-compute PoolIds for canonical v4 pools at deploy time.** Deterministic from PoolKey, never change.
7. **Permit2 SignatureTransfer**, not AllowanceTransfer. Single-use, no lingering allowance.
8. **No Universal Router.** Reckon does not swap.
9. **No Trading API integration code shipped.** Demo flow either uses an existing UI exposing `additionalValidationContract` or a small direct-signing helper. Phase 0 task: confirm.
10. **UniswapX has zero testnet deployments** — Anvil-fork of Base mainnet is the only viable dev environment.

---

## 9. Open items the docs don't resolve

- **Trading API `additionalValidationContract` exposure.** The integration guide documents `POST /order` for UniswapX orders but does not specify whether `additionalValidationContract` and `additionalValidationData` are settable through the request body. Phase 0 verification task: read the API reference in detail or test directly. Fallback: direct EIP-712 signing + direct reactor submission via viem (~50 LoC helper).
- **Multi-output reactor behavior under Reckon validator revert.** If our `validate()` reverts on multi-output, does the reactor surface a clean error to the swapper? Untested. Mitigation: revert reason string is descriptive.
- **`additionalValidationData` size limits.** We encode `uint16` (32 bytes after abi.encode). No documented upper bound, but well within any reasonable limit. Future-proof: leave room for `(uint16 toleranceBps, uint8 version)` in case we extend.
- **PriorityOrderReactor-specific quirks vs other reactors.** Our integration is reactor-agnostic at the validator level (the interface is shared), but `Fill` event semantics may differ between PriorityOrderReactor (Base/Unichain) and DutchOrderReactors (Mainnet/Arbitrum). Spec scopes to Base only; if we ever extend to Mainnet, re-verify the Fill event signature.
- **Anvil-fork RPC fork-mode method coverage.** Public RPCs vary in which fork-mode RPC methods they expose. Spec already names Alchemy and QuickNode as confirmed. If we hit a method gap during dev, the fix is either swap providers or self-host a Geth/Reth in archive mode.

If any of these resolve differently in practice, update this guide in place — not a new file.
