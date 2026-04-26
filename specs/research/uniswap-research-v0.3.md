# Uniswap Research Notes for Reckon v0.3

**Sources:** `https://developers.uniswap.org/docs/uniswap-ai/llms.txt`, `developers.uniswap.org/contracts/uniswapx/{overview,deployments}`, and the canonical `Uniswap/UniswapX` repo (`src/interfaces/IValidationCallback.sol`, `src/base/ReactorStructs.sol`).
**Date compiled:** 2026-04-26
**Purpose:** Validate the Uniswap-stack assumptions baked into `reckon-spec-v0.3.md`. Note: per spec, Uniswap is **stack-only, not a bounty target** — so this research is about *technical correctness*, not bounty fit.

The spec depends on Uniswap in two load-bearing places:
1. **`ReckonValidator` plugged into UniswapX as `additionalValidationContract`** (FR-2, FR-3, Phase 1 Day 2-3).
2. **v3/v4 pools as inputs to the EBBO oracle** (FR-4, Phase 1 Day 5-6).

Most of the stack assumptions are right. **One is wrong in a way that will block FR-3 at compile time.** Read §1 first.

---

## 1. 🚨 CRITICAL — `IValidationCallback.validate()` is `view`. FR-3 cannot do what the spec says it does.

The actual interface, copy-pasted from `Uniswap/UniswapX/src/interfaces/IValidationCallback.sol`:

```solidity
interface IValidationCallback {
    /// @notice Called by the reactor for custom validation of an order.
    ///         Will revert if validation fails
    /// @param filler The filler of the order
    /// @param resolvedOrder The resolved order to fill
    function validate(address filler, ResolvedOrder calldata resolvedOrder) external view;
}
```

`external view`. Not `external`. Not `nonpayable`. **View.**

A `view` function:
- cannot write storage,
- cannot emit events,
- cannot call non-view functions on other contracts.

**What the spec says (FR-3, Phase 1 Day 2-3) the validator does:**
> "When the UniswapX reactor calls `ReckonValidator.validate(filler, resolvedOrder)`, we resolve `filler` to its ENS namehash via reverse-lookup..."
> "Record a `FillRecord{orderHash, fillerNamehash, fillBlock, ...}` in our `FillRegistry` contract"
> "Append the same fill to **0G Storage Log** for off-chain agent indexing"
> "Emit a `FillRecorded` event indexed by fillerNamehash, swapper, and orderHash"

**None of these are possible inside `validate()`.** Recording state, emitting events, and calling `FillRegistry.recordFill()` (which writes a mapping) all require state-modifying execution. The contract will revert / fail to compile if we try.

The ENS reverse-lookup itself is fine (read-only), so the *gating* part of FR-3 ("revert if filler has no subname") works as written. The *recording* part does not.

### What we have to do instead

Three viable patterns; pick one and update the spec:

**Pattern A — Watcher on reactor `Fill` event (simplest, recommended).**
UniswapX reactors emit a `Fill(bytes32 orderHash, address filler, address swapper, uint256 nonce)` event when an order settles successfully. Our off-chain indexer subscribes to this event, calls `FillRegistry.recordFill(...)` from a permissioned relayer EOA, which is the contract that emits `FillRecorded` and appends to 0G Storage. The validator stays purely view (gating-only).
- Pros: no changes to UniswapX, contract stays simple, matches the existing reactor behavior.
- Cons: introduces a trusted relayer for `recordFill`. Mitigation: anyone can call `recordFill` if they prove the `Fill` event happened (Merkle proof of receipt) — but this is over-engineering for hackathon.

**Pattern B — Wrap the reactor with a thin "RecordingReactor" that calls the real reactor and records the fill in one tx.**
Custom reactor that calls into `ExclusiveDutchOrderReactor.execute(...)` (or the Priority variant on Base/Unichain) and, on success, writes `FillRecord` and emits.
- Pros: fully on-chain, no relayer.
- Cons: doubles the gas. Solvers may not want to use a wrapped reactor unless we change the swap UI to point at our wrapper, which breaks the spec's "1-line change" claim in FR-2.

**Pattern C — Validator records via a self-call to an "indirect" recording entrypoint.**
Doesn't actually work; `view` is enforced by EVM.

**Recommended:** Pattern A. Update FR-3 accordingly.

### Spec changes required for §1

- **FR-2/FR-3 split: gating vs recording.**
  - `ReckonValidator.validate()` (view, gating only): resolve filler → ENS namehash, decode `eboTolerance` from `additionalValidationData`, **revert if filler has no subname**. That's it.
  - `FillRegistry.recordFill()` is called by an off-chain relayer that subscribes to the reactor's on-chain fill event. The relayer is a permissioned address held by Reckon (or, longer term, anyone who can prove a fill receipt).
- **Phase 1 Day 2-3 must split into two days:** validator (~3h) and indexer/relayer (~6h).
- **Architecture diagram update:** add a "Reckon Indexer / Relayer" off-chain box that listens to the reactor's `Fill` event and calls `FillRegistry.recordFill`.
- **NFR-3 (failure modes):** add "If the relayer is offline, fills are not recorded and challenges cannot be opened. Mitigation: redundant relayers, plus a manual `recordFill(orderHash, proof)` path for late entries."
- **Demo video script (Phase 4 Day 22-23):** the "validate is called" beat is now "validator gates → reactor settles → indexer records → challenger sees event."

---

## 2. ResolvedOrder and OrderInfo — what we actually have access to inside validate()

From `src/base/ReactorStructs.sol`:

- **`ResolvedOrder`**: `{ OrderInfo info, InputToken input, OutputToken[] outputs, bytes sig, bytes32 hash }`
- **`OrderInfo`**: `{ IReactor reactor, address swapper, uint256 nonce, uint256 deadline, IValidationCallback additionalValidationContract, bytes additionalValidationData }`
- **`InputToken`**: `{ ERC20 token, uint256 amount, uint256 maxAmount }` (max for Dutch auctions)
- **`OutputToken`**: `{ address token, uint256 amount, address recipient }`
- **`SignedOrder`**: external-facing wrapper, parsed by reactor into `ResolvedOrder`.

The spec assumes we can extract `inputAmount`, `outputAmount`, `swapper`, and `eboTolerance` (from `additionalValidationData`). That all maps cleanly:
- `inputAmount` = `resolvedOrder.input.amount`
- `outputAmount` = sum of `resolvedOrder.outputs[i].amount` (note: it's an array — multiple outputs are possible; spec implicitly assumes single-output)
- `swapper` = `resolvedOrder.info.swapper`
- `eboTolerance` = `abi.decode(resolvedOrder.info.additionalValidationData, (uint16))`

**Spec changes required:**
- FR-3 / Phase 1 Day 2-3: pin that `outputAmount` is the **sum across `outputs[]`**, not a scalar. Multi-output orders exist and shouldn't break us (or we explicitly reject them — `require(outputs.length == 1)` is a defensible v1 limitation).
- Note in NFR-3: "Multi-output orders rejected in v1; documented limitation."

---

## 3. No UniswapX testnet deployments — fork-our-own is mandatory, not optional

Confirmed from the official deployments page. Live deployments only:

| Chain | Reactor type | Address |
|---|---|---|
| **Ethereum mainnet** | V2 Dutch Order Reactor | `0x00000011f84b9aa48e5f8aa8b9897600006289be` |
| Ethereum mainnet | V1 Exclusive Dutch Order Reactor | `0x6000da47483062A0D734Ba3dc7576Ce6A0B645C4` |
| **Arbitrum** | DutchV3OrderReactor | `0xB274d5F4b833b61B340b654d600A864fB604a87c` |
| **Base** | **PriorityOrderReactor** | `0x000000001Ec5656dcdB24D90DFa42742738De729` |
| **Unichain** | **PriorityOrderReactor** | `0x00000006021a6Bce796be7ba509BBBA71e956e37` |
| Permit2 (all chains) | — | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| OrderQuoter (Base/Unichain/Arbitrum) | — | `0x88440407634f89873c5d9439987ac4be9725fea8` |

**No Sepolia, no Base Sepolia, no Unichain Sepolia, no Arbitrum Sepolia.**

Spec's Risk #2 already calls this out (*"deploy our own UniswapX fork using the audited contracts from `github.com/Uniswap/UniswapX`"*). The risk should be **upgraded from MEDIUM probability to certain** — there is no scenario where we don't fork.

**Spec changes required:**
- Risk #2: change probability from MEDIUM → certain. Allocate the 4 hours, don't condition on it.
- Phase 0 Day 1 task list: add explicit fork-deploy step for the dev chain. License is **GPL-3.0** (not MIT) — relevant if any of our wrapper code links to UniswapX source; we either match GPL-3.0 or stay at the interface boundary.

---

## 4. Reactor type differs by chain — Base/Unichain run PriorityOrder, not Dutch

This isn't called out anywhere in the spec. The spec talks about Dutch auction semantics throughout (e.g., `InputToken.maxAmount` for Dutch decay). On **Base and Unichain — our likely deployment targets — production UniswapX uses `PriorityOrderReactor`**, which is a *priority-fee-based* auction, not a time-decay Dutch auction.

What this means for Reckon:
- The `validate()` interface is identical → our gating contract works unchanged.
- The `ResolvedOrder` struct is the same → output extraction works.
- **Order economics differ** — PriorityOrder pricing has a `priorityFee` term that doesn't exist in Dutch orders. Our EBBO comparison (FR-5) is `actualOutput < expectedOutput * (1 - eboTolerance)`. This still works because we compare *the actual settled output* to *the benchmark*. We don't need to know which auction shape produced the price.
- **Risk:** if we test against a Dutch reactor fork on Base Sepolia but mainnet runs Priority on Base, our integration smoke test isn't exercising the real reactor. Deploy a Priority fork too.

**Spec changes required:**
- Phase 0 Day 1: clarify which reactor we fork. **Default: PriorityOrderReactor (matches Base + Unichain mainnet).** Dutch as fallback if PriorityOrder is harder to fork.
- FR-1 / FR-2: drop any implicit assumption of Dutch decay. The validator and registry are auction-agnostic.

---

## 5. EBBO oracle inputs — v3 and v4 pool reads aren't documented anywhere on the site

The Uniswap llms.txt and overview pages don't detail `slot0` reads, `sqrtPriceX96`, or how to compute spot prices from raw pool storage. Spec FR-4 says:
> "Reads spot prices from a hardcoded list of 3 canonical pools per pair (e.g., for USDC/WETH: Uniswap v4 0.05%, v3 0.05%, v3 0.30%) and returns the geometric mean weighted by per-pool TVL"

**This is fine to do** — `slot0` is a public function on every v3 pool, and the v4 PoolManager exposes `getSlot0(poolId)`. But the spec's "via direct slot reads" framing in Phase 1 Day 5-6 is wrong:

- **v3:** `IUniswapV3Pool(pool).slot0()` returns `(sqrtPriceX96, tick, ...)` — public function, not raw `sload`.
- **v4:** v4's singleton `PoolManager` exposes pool state via library helpers (`StateLibrary.getSlot0`). Direct storage slot reads on v4 require knowing the singleton's storage layout for a given `poolId` — feasible but error-prone. Use the library.

TVL weighting also needs care: TVL on v3/v4 concentrated-liquidity pools depends on tick range, not just `liquidity()`. If we say "TVL-weighted geometric mean," we should pin **what we actually measure** — full-range liquidity in a price band around current tick? Total liquidity in the active tick? Sum of token0+token1 reserves? The spec says "per-pool TVL" without defining it.

**Spec changes required:**
- FR-4 / Phase 1 Day 5-6: replace "direct slot reads" with "`IUniswapV3Pool.slot0()` for v3 pools; `StateLibrary.getSlot0(poolManager, poolId)` for v4 pools."
- FR-4: pin TVL definition. Recommended: "TVL = liquidity in active tick × current price, summed over both tokens, valued in `tokenOut`." Or, simpler and more honest: **drop TVL weighting and use equal weighting**. The geometric mean's manipulation resistance comes from the *number* of pools, not the weights.
- NFR-2: the "1/sqrt(N)" claim assumes equal weights. If we keep TVL weighting, the bound becomes weight-dependent and the claim weakens. Either prove a tighter bound or simplify to equal weights.

---

## 6. Permit2, OrderQuoter, audits — minor pins

- **Permit2 is canonical** at `0x000000000022D473030F116dDEE9F6B43aC78BA3` on all chains we care about. Spec's Phase 1 Day 2-3 (*"pull challenger USDC bond into contract via `permit2` or `transferFrom`"*) is fine — pin the address.
- **OrderQuoter** at `0x88440407634f89873c5d9439987ac4be9725fea8` (Base/Unichain/Arbitrum) **simulates a fill without executing**. Useful to surface in our README as a tool the *swapper* can use to sanity-check before signing — but not load-bearing for Reckon. Optional bonus (~1 hour): include in the dashboard's "preview an order" tool.
- **Audits & license:** V1 audited by ABDK, V1.1 by ABDK + OpenZeppelin, V2 by Spearbit. License **GPL-3.0**. Spec doesn't mention either — both belong in the README's "Dependencies" section (GPL is sticky).

**Spec changes required:**
- Pre-build checklist: pin Permit2 address.
- Phase 4 README: list UniswapX upstream as GPL-3.0; note our integration is at the interface boundary so Reckon contracts can stay under any license we pick.

---

## 7. What the spec gets right (no change needed)

- **`additionalValidationContract` framing in FR-2** — correct field, correct semantics, "1-line change to swap UI" claim is accurate (just set the address + encode bytes for `additionalValidationData`).
- **Cross-chain UniswapX as out-of-scope** — correct call. Cross-chain UniswapX has its own attestation/bridge timing that doesn't fit our 30-minute window.
- **Uniswap as "stack only, not bounty target"** — correct strategic call given the validation interface is well-defined and the bounty fit (Trading API integration) doesn't help our actual product.

---

## 8. Spec text that's wrong or weak — line-level fixes

| Spec location | Current text | Issue | Fix |
|---|---|---|---|
| FR-3 | "the UniswapX reactor calls `ReckonValidator.validate(filler, resolvedOrder)`, we resolve `filler` to its ENS namehash..." then "Record a `FillRecord`... Append... Emit `FillRecorded`" | `validate()` is `view`; cannot record/emit | Split: validate() does ENS gating + tolerance decode (view-pure); recording happens in a separate `FillRegistry.recordFill()` called by an off-chain indexer that watches the reactor's on-chain `Fill` event |
| FR-3 | (no mention of multi-output orders) | `ResolvedOrder.outputs` is an array | Sum `outputs[].amount`, or reject `outputs.length != 1` in v1 |
| FR-4 / Phase 1 Day 5-6 | "via direct slot reads" | v3 has `slot0()`; v4 needs `StateLibrary.getSlot0` | Replace "direct slot reads" with the library calls. `IUniswapV3Pool.slot0()` for v3, `StateLibrary.getSlot0(poolManager, poolId)` for v4 |
| FR-4 | "geometric mean weighted by per-pool TVL" | "TVL" undefined for concentrated-liquidity pools | Pin definition or switch to equal-weighted geometric mean |
| NFR-2 | "1/sqrt(N) where N = number of canonical pools" | Bound holds only for equal weights | Either pin weights = 1/N or rewrite the bound |
| Risk #2 | "If UniswapX team has not deployed on Unichain testnet (likely as of April 2026), we deploy a fork ourselves..." | "Likely" → "certain"; no UniswapX testnet exists anywhere | "UniswapX has no testnet deployments on any chain. Forking from `github.com/Uniswap/UniswapX` (GPL-3.0) is required for development. Allocate 4 hours Day 1." |
| Phase 0 Day 1 | "UniswapX is mainnet on Ethereum and Arbitrum; for testnet we deploy our own local-flavor reactor + permit2 fixture" | Permit2 is the same canonical contract on every chain — no need to "fixture" it; just deploy it from canonical bytecode. Also missing: which reactor variant we fork | "Deploy a fork of `PriorityOrderReactor` (matches Base/Unichain mainnet) on Base Sepolia. Permit2 is canonical at 0x000000000022D473030F116dDEE9F6B43aC78BA3 on Base Sepolia already — no fixture needed." |
| Phase 1 Day 2-3 | (no mention of GPL-3.0) | License sticky for any code that links UniswapX | Stay at the interface boundary (just import the interface). Reckon contracts under our chosen license. |
| Architecture diagram | "UniswapX Reactor → ReckonValidator" → "FillRegistry" | Skips the indexer | Insert "Reckon Indexer (off-chain)" between reactor `Fill` event and `FillRegistry.recordFill`; keep validator as a view-only gating box hanging off the reactor |

---

## 9. Bonus uplift — none needed

Since Uniswap is stack-only (no bounty), there's no incentive to add Uniswap-facing surface area. The only nice-to-have is using `OrderQuoter` in the dashboard for swapper-side previews — strictly optional, not on the critical path.

---

## Summary — concrete spec edits, prioritized

1. **(Critical, must-fix)** FR-3 + Phase 1 Day 2-3: split validation (view-only gating) from recording (off-chain indexer → `FillRegistry.recordFill`). The spec's current FR-3 won't compile.
2. **(Architecture)** Add "Reckon Indexer / Relayer" off-chain component to the architecture diagram. Add it to NFR-3 failure modes.
3. **(Factual, must-fix)** UniswapX has **no testnet deployments anywhere**. Risk #2 probability → certain. Always allocate the 4h fork-deploy.
4. **(Factual)** Default forked reactor = **PriorityOrderReactor** (matches Base/Unichain mainnet), not Dutch.
5. **(Factual)** Replace "direct slot reads" with `IUniswapV3Pool.slot0()` (v3) / `StateLibrary.getSlot0` (v4).
6. **(Factual)** Define TVL weighting or drop it for equal weights. Either way, fix the NFR-2 `1/sqrt(N)` bound to match the chosen weighting.
7. **(Robustness)** Handle `ResolvedOrder.outputs` as an array; either sum or reject multi-output in v1.
8. **(Pin)** Permit2 address `0x000000000022D473030F116dDEE9F6B43aC78BA3` everywhere we pull bonds via signature transfer.
9. **(License)** Note UniswapX upstream is GPL-3.0; Reckon stays at the interface boundary. Add to README dependencies section.
10. **(Optional)** Use `OrderQuoter` in the dashboard for swapper previews.
