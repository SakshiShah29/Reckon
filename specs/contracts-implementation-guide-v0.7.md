# Reckon Contracts — Step-by-Step Implementation Guide (v0.10)

**Audience:** Builder A (and Builder B during pairing-seam work). Aligns with `specs/reckon-spec-v0.10.md` and the partner-integration guides under `specs/research/partner-implementation-guide/`.

**v0.9 → v0.10 delta (post-§5 only — §0–§5 already implemented and unchanged):**
- Pure terminology refactor: the off-chain service that subscribes to chain events, writes MongoDB, and calls Base contracts is now uniformly called the **relayer** (was variously "indexer" or "indexer/relayer" in v0.9). No architectural change. All §6+ prose, milestone gates, and open items renamed accordingly.
- One carve-out: the 0G Storage SDK exposes a client called `indexer` (`@0gfoundation/0g-ts-sdk`). When the relayer calls `indexer.upload()` to anchor a batch, the SDK method name is preserved.
- Sibling package renamed `packages/indexer/` → `packages/relayer/`.

**v0.7 → v0.9 delta (kept for history):**
- ENS path moved from on-chain L2 subname registrar (Durin/Namestone/in-house) to **virtual subnames in MongoDB + `ReckonWildcardResolver` on Ethereum mainnet + CCIP-Read gateway**. The on-chain Base side becomes two thin namehash lists: `SolverRegistry` (implements `IReckonRegistrar` so `SolverBondVault` keeps working unchanged) and `ChallengerRegistry` (minimal surface for `Challenger`).
- `ENSReputationWriter` deleted. Reputation deltas accumulate in MongoDB; a KeeperHub schedule workflow triggers the relayer to push new reputation text values into `SolverRegistry` (the on-chain mirror that `SolverBondVault.requiredBond` reads).
- `FillRecord` now carries `tokenIn` / `tokenOut` from the start (was deferred in v0.7's open items).
- `Challenger` self-challenge guard simplified to a namehash equality check (per v0.9 NFR-2).
- `Challenger` no longer calls an on-chain reputation writer; the relayer reacts to `ChallengeSucceeded` / `ChallengeFailed` events and writes deltas to MongoDB.

**Framework:** Foundry. Solidity `0.8.26` (matches UniswapX + v4). Forge tests run against an Anvil fork of Base mainnet via `vm.createSelectFork()`.

**Monorepo location:** `packages/contracts/` (this guide assumes a workspace layout with sibling `packages/relayer/`, `packages/agent/`, `packages/dashboard/`, etc. — only `contracts/` is in scope here).

**Working principle:** every step is small, ends with a tangible green test, and ends with a commit. The commit messages below are tentative — adjust if the diff drifts. Run `forge test` after each step; if a step has no new test, the prior suite must still be green.

---

## 0. [done] Setup

### Step 0.1 [done] — Initialize monorepo + contracts package
- At repo root, create `packages/contracts/`.
- Inside it run `forge init --no-git --no-commit .`
- Delete the default `src/Counter.sol`, `script/Counter.s.sol`, `test/Counter.t.sol`.
- Add a top-level `package.json` with `"workspaces": ["packages/*"]` so Bun/pnpm can resolve sibling packages later.
- Add `.gitignore` entries: `cache/`, `out/`, `broadcast/`, `node_modules/`, `.env`, `lib/`.

**Test:** `cd packages/contracts && forge --version && forge build` exits 0 with no contracts.

**Commit:** `chore(contracts): scaffold foundry package in monorepo`

### Step 0.2 [done] — Configure `foundry.toml`
- Set `solc = "0.8.26"`, `optimizer = true`, `optimizer_runs = 1_000_000`, `via_ir = false` (turn on later only if stack-too-deep hits).
- Add `[rpc_endpoints]` block with `base = "${BASE_MAINNET_RPC}"` and `zg_galileo = "https://evmrpc-testnet.0g.ai"`.
- Add `[profile.default.fuzz] runs = 256` and `[profile.ci.fuzz] runs = 1024`.
- Add `[etherscan] base = { key = "${BASESCAN_API_KEY}", chain = 8453 }`.
- Create `.env.example` documenting `BASE_MAINNET_RPC`, `BASESCAN_API_KEY`, `ZG_GALILEO_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`.

**Test:** `forge config | grep solc_version` shows `0.8.26`.

**Commit:** `chore(contracts): pin solc 0.8.26 and rpc endpoints`

### Step 0.3 [done] — Install dependencies
Run inside `packages/contracts/`:
- `forge install foundry-rs/forge-std --no-commit`
- `forge install OpenZeppelin/openzeppelin-contracts --no-commit` (v5.x)
- `forge install Uniswap/permit2 --no-commit`
- `forge install Uniswap/v3-core --no-commit` (for `IUniswapV3Pool`, `FullMath`, `TickMath`)
- `forge install Uniswap/v4-core --no-commit` (for `StateLibrary`, `IPoolManager`, `PoolId`)
- `forge install Uniswap/UniswapX --no-commit` (interface only — note GPL-3.0; we only import interface files, not implementation)

Add a `remappings.txt`:
```
forge-std/=lib/forge-std/src/
@openzeppelin/=lib/openzeppelin-contracts/contracts/
permit2/=lib/permit2/src/
v3-core/=lib/v3-core/contracts/
v4-core/=lib/v4-core/src/
uniswapx/=lib/UniswapX/src/
```

**Test:** `forge build` compiles a stub `src/Reckon.sol` containing only `import "uniswapx/interfaces/IValidationCallback.sol";` with an empty contract.

**Commit:** `chore(contracts): install forge-std, OZ, permit2, v3/v4-core, UniswapX`

### Step 0.4 — Add CI
Create `.github/workflows/contracts.yml`:
- Triggers on push + PR touching `packages/contracts/**`.
- Steps: checkout → install Foundry → `forge fmt --check` → `forge build --sizes` → `FOUNDRY_PROFILE=ci forge test --fork-url ${{ secrets.BASE_MAINNET_RPC }} -vvv`.
- Add `BASE_MAINNET_RPC` to repo secrets (Builder A).

**Test:** open a draft PR, watch CI go green.

**Commit:** `ci: lint, build, fork-test contracts on PR`

### Step 0.5 [done] — Fork sanity test
Create `test/ForkSanity.t.sol`:
```solidity
function test_ForkSeesPriorityOrderReactor() public {
    vm.createSelectFork(vm.rpcUrl("base"));
    address reactor = 0x000000001Ec5656dcdB24D90DFa42742738De729;
    assertGt(reactor.code.length, 0, "reactor bytecode missing");
}
```
Also assert codesize on Permit2 (`0x000000000022D473030F116dDEE9F6B43aC78BA3`) and on v4 PoolManager (`0x498581ff718922c3f8e6a244956af099b2652b2b`).

**Test:** `forge test --fork-url $BASE_MAINNET_RPC --match-test test_ForkSeesPriorityOrderReactor` passes.

**Commit:** `test: fork sanity — reactor, permit2, v4 manager bytecode present`

### Step 0.6 [done] — Address book
Create `src/lib/Addresses.sol` (a `library` of `address constant`s) for: `PRIORITY_ORDER_REACTOR`, `PERMIT2`, `V4_POOL_MANAGER`, `V4_STATE_VIEW`, `USDC_BASE` (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), `WETH_BASE` (`0x4200000000000000000000000000000000000006`). Exported as one library so we don't repeat magic addresses.

**Test:** add unit test asserting each constant has nonzero codesize on the fork.

**Commit:** `feat(contracts): central address book for base mainnet anchors`

---

## 1. [done] Shared interfaces and errors

### Step 1.1 [done] — Errors and events module
Create `src/lib/ReckonErrors.sol` and `src/lib/ReckonEvents.sol` — flat files of custom errors and events used cross-contract. Start with placeholders (`error NotRegistered();`, `error ChallengeWindowClosed();`, `event FillRecorded(...)`, etc.). Keeps cross-contract event signatures consistent.

**Test:** `forge build` compiles.

**Commit:** `feat(contracts): shared errors and events modules`

### Step 1.2 [done] — Reckon registrar interface
Create `src/interfaces/IReckonRegistrar.sol`:
```solidity
interface IReckonRegistrar {
    function namehashOf(address owner) external view returns (bytes32);
    function ownerOfNamehash(bytes32 node) external view returns (address);
    function isRegistered(address owner) external view returns (bool);
    function setText(bytes32 node, string calldata key, string calldata value) external;
    function getText(bytes32 node, string calldata key) external view returns (string memory);
}
```
`namehashOf(address)` is the registrar-local reverse lookup the ENS guide pins (`ownedSubnameOf`); we expose it under a Reckon-controlled name to insulate the validator from ENS internals.

**Test:** build only.

**Commit:** `feat(contracts): IReckonRegistrar interface for solver/challenger lookup`

### Step 1.3 [done] — v0.9 interface refactor (prep for §6)
Two changes land together as a single prep commit before §6.1. Both are non-breaking for §0–§5 because the dropped/extended surfaces aren't consumed by any contract we've shipped.

**1. Drop `isSameOwner` from `IReckonRegistrar` and `MockReckonRegistrar`.** v0.9's self-challenge guard is a pure namehash inequality check (`challengerNode != fillerNamehash`), made trivial by the fact that solver and challenger subnames live under disjoint parent nodes (`solvers.reckon.eth` vs `challengers.reckon.eth`) and so can never collide. The cross-registry owner comparison `isSameOwner` was solving a problem we no longer have. It has no on-chain caller (`SolverBondVault` doesn't use it; nothing else does), so the drop is purely additive removal:
- Remove `isSameOwner` from `src/interfaces/IReckonRegistrar.sol`.
- Remove `isSameOwner` from `test/mocks/MockReckonRegistrar.sol`.
- Remove the three `isSameOwner` tests from `test/mocks/MockReckonRegistrar.t.sol`.

**2. Split into `IReckonNamehashLookup` (lookup-only) and `IReckonRegistrar extends IReckonNamehashLookup` (lookup + text).** ChallengerRegistry (§6.2) doesn't need text records — challenger reputation isn't on-chain. Splitting the interface lets `ChallengerRegistry` implement only the smaller surface, and lets `Challenger.sol` accept `IReckonNamehashLookup` for the challenger registry parameter while keeping `IReckonRegistrar` for the solver registry.

```solidity
// src/interfaces/IReckonNamehashLookup.sol
interface IReckonNamehashLookup {
    function namehashOf(address owner) external view returns (bytes32);
    function ownerOfNamehash(bytes32 node) external view returns (address);
    function isRegistered(address owner) external view returns (bool);
}

// src/interfaces/IReckonRegistrar.sol
interface IReckonRegistrar is IReckonNamehashLookup {
    function setText(bytes32 node, string calldata key, string calldata value) external;
    function getText(bytes32 node, string calldata key) external view returns (string memory);
}
```

`SolverBondVault` (§4.2) imports `IReckonRegistrar` because it reads text records — no change needed; the type still resolves. `MockReckonRegistrar` continues to implement `IReckonRegistrar`, picking up the lookup methods through inheritance.

**Test:** existing §3.1 mock tests still pass minus the three `isSameOwner` cases; existing §4 SolverBondVault tests still pass unchanged.

**Commit:** `refactor(contracts): split IReckonRegistrar, drop isSameOwner`

---

## 2. [done] OwnerRegistry (Base)

Smallest contract — relayer-attested cross-chain ownerOf cache. Build first because `RoyaltyDistributor` and `Challenger` both depend on it.

### Step 2.1 [done] — `OwnerRegistry` skeleton with attester role
- `address public attester;`
- `address public owner;` (admin who can rotate attester)
- `struct Attestation { address owner; uint64 attestedAt; }`
- `mapping(uint256 tokenId => Attestation) internal _attestations;`
- `event AttesterRotated(address indexed prev, address indexed next);`
- `event OwnerAttested(uint256 indexed tokenId, address indexed owner, uint64 attestedAt);`
- Constructor `(address _owner, address _attester)`.
- `rotateAttester(address)` onlyOwner.

**Test:** `OwnerRegistry.t.sol::test_constructor_sets_roles`, `test_rotateAttester_only_owner`.

**Commit:** `feat(OwnerRegistry): skeleton with attester role`

### Step 2.2 [done] — `attestOwner` + `ownerOf` + `freshnessOf`
- `attestOwner(uint256 tokenId, address newOwner)` — `require(msg.sender == attester)`, write attestation, emit event.
- `ownerOf(uint256) view returns (address)` — returns last attested owner; reverts if never attested.
- `freshnessOf(uint256) view returns (uint64)` — returns `block.timestamp - attestedAt`.
- `isStale(uint256, uint64 maxAgeSeconds) view returns (bool)`.

**Test:**
- `test_attestOwner_only_attester`
- `test_attestOwner_writes_and_emits`
- `test_ownerOf_reverts_if_never_attested`
- `test_isStale_after_24h` (use `vm.warp`).

**Commit:** `feat(OwnerRegistry): attestOwner/ownerOf with freshness tracking`

---

## 3. [done] Subname registrar — test mock now, production deferred

Downstream contracts (`SolverBondVault`, `ReckonValidator`, `Challenger`, `ENSReputationWriter`) all take an `IReckonRegistrar` in their constructor. Their unit tests need *some* implementation of that interface. The production registrar — Durin/Namestone or, failing that, an in-house build — is **deferred until Phase 0 verifies which path is usable** (per spec Risk #5 and the ENS implementation guide). We do not block contract work on that decision.

Instead, we ship a tiny in-test mock and move on.

### Step 3.1 [done] — `MockReckonRegistrar` test fixture
Create `test/mocks/MockReckonRegistrar.sol`. It lives under `test/`, never deploys to a chain. Surface:
- `enum Role { None, Solver, Challenger }`.
- `mint(address user, bytes32 node, Role role)` — public test helper that seeds the owner⇆node mapping (no auth, no real ENS plumbing).
- `setText(bytes32 node, string key, string value)` — open in the mock; production will gate on owner OR reputation writer.
- All `IReckonRegistrar` getters: `namehashOf`, `ownerOfNamehash`, `isRegistered`, `getText`. (Per §1.3, `isSameOwner` is gone — the v0.9 self-challenge guard uses pure namehash equality and doesn't need it.)
- Storage: `mapping(bytes32 => address) ownerOfNode`, `mapping(address => bytes32) nodeOfOwner`, `mapping(bytes32 => mapping(string => string)) texts`.

Constraints to mirror in the mock so tests reflect production semantics:
- `namehashOf(unregistered)` reverts with `ReckonErrors.NotRegistered`.
- One subname per address — second `mint` for the same address reverts.

**Test:** `test/mocks/MockReckonRegistrar.t.sol` — mint, namehash round-trip, duplicate-mint revert, text round-trip.

**Commit:** `test(contracts): MockReckonRegistrar for downstream unit tests`

### Step 3.2 — Production registrar (Phase 0 contingency, may never ship)
**Do not write this until Phase 0 verification reports back.** Two outcomes:

1. **Durin or Namestone is usable** → integrate their tooling in Phase 4 directly. The production registrar adapter is a small wrapper around their contracts that exposes the same `IReckonRegistrar` surface. Estimated 2–4 hours, scheduled in Phase 4 alongside the mainnet registrar deploy.
2. **Neither is usable** → write a minimal in-house `ReckonSubnameRegistrar` (~150 LoC) implementing the production semantics: ENSIP-1 `_namehash`, role-scoped parents (`solvers.reckon.eth`, `challengers.reckon.eth`), one subname per address, `setText` gated on owner OR `reputationWriter`. Estimated ~6 hours per spec Risk #5 mitigation.

Whichever path lands, downstream contracts don't change because they only depend on `IReckonRegistrar`. The mock from §3.1 stays in `test/` and continues to drive all unit tests.

**Test:** N/A until Phase 0 outcome is known.

**Commit:** N/A (will be added when path is chosen).

---

## 4. [done] SolverBondVault (Base)

Keyed by namehash, not by address. Holds USDC. Locks during open challenge windows.

### Step 4.1 [done] — Storage and constructor
- `IERC20 public immutable usdc;`
- `IReckonRegistrar public immutable registrar;`
- `uint256 public baseBond = 1000e6;` (USDC is 6 decimals)
- `uint256 public floorBond = 100e6;`
- `mapping(bytes32 node => uint256) public bondedAmount;`
- `mapping(bytes32 node => uint256) public lockedAmount;`
- `address public challenger;` (the only contract authorized to lock/slash; set after deploy)
- `address public owner;` (admin, can set `challenger`).

**Test:** `test_constructor`, `test_setChallenger_only_owner_once`.

**Commit:** `feat(SolverBondVault): storage, USDC and registrar bindings`

### Step 4.2 [done] — `deposit(amount)` and `requiredBond(node)`
- `deposit(uint256 amount)` — caller must be registered solver; pulls USDC via `transferFrom`; increments `bondedAmount[node]` where `node = registrar.namehashOf(msg.sender)`.
- `requiredBond(bytes32 node) view returns (uint256)` — reads `reckon.reputation` text (parsed as uint, expected 0–1e18 for [0, 1] range), linearly interpolates between `baseBond` (rep=0) and `floorBond` (rep=1e18). On parse failure, defaults to `baseBond`.
- Helper `_parseUint(string memory) internal pure returns (uint256, bool)` — guards against malformed text records.

**Test:**
- `test_deposit_pulls_usdc_and_credits_node`
- `test_deposit_reverts_for_unregistered_caller`
- `test_requiredBond_decays_linearly` (set text record via mock, assert math)
- `test_requiredBond_defaults_when_text_unset`.

**Commit:** `feat(SolverBondVault): deposit and reputation-decayed requiredBond`

### Step 4.3 [done] — `lock`, `unlock`, `slash`
- `lock(bytes32 node, uint256 amount)` — only `challenger` (or the indexer relayer; spec says lock is per fill). Decision: **lock happens automatically when `FillRegistry.recordFill` records a fill against this solver**, so make the locker `challenger` initially and call into `lockOnFill` from FillRegistry after we wire it up. For now expose `lock` callable by `challenger` only.
- `unlock(bytes32 node, uint256 amount)` — decrements `lockedAmount`.
- `slash(bytes32 node, uint256 amount, address to)` — only `challenger`; transfers USDC from vault to `to`; decrements `bondedAmount` and `lockedAmount`. Returns the actual amount slashed (capped at `bondedAmount[node]`).
- `withdrawable(bytes32) view returns (uint256)` = `bondedAmount - lockedAmount`.
- `withdraw(uint256 amount)` — solver pulls back unused bond.

**Test:**
- `test_lock_only_challenger`
- `test_slash_caps_at_bonded`
- `test_withdraw_reverts_when_locked`
- `test_withdraw_succeeds_for_unlocked_portion`.

**Commit:** `feat(SolverBondVault): lock/unlock/slash and withdraw`

### Step 4.4 [done] — Counter-based fill lock wrapper (v0.9 prep for §8)
The §4.3 `lock`/`unlock` pair is amount-based — the right shape for a live challenge that knows exactly how much bond is at risk. v0.9's FR-1 needs a different concern: while *any* challenge window is open against a solver, that solver shouldn't be able to withdraw bond. We don't know the slash amount until/unless a challenge actually fires, so amount-based locking can't express "bond is at risk because there's an open fill, even if no challenge has been submitted yet."

Add a counter on top — non-breaking, composes cleanly with the existing amount-based lock.

Storage additions:
- `mapping(bytes32 node => uint256) public openFillCount;`
- `address public fillRegistry;` (set once via `setFillRegistry`, mirrors `setChallenger` pattern; rotatable only via owner before first set).

External additions:
- `lockOnFill(bytes32 node) external` — only `fillRegistry`; increments `openFillCount[node]`.
- `unlockOnFill(bytes32 node) external` — only `fillRegistry`; decrements; reverts on underflow.
- Modify `withdraw(amount)` to additionally require `openFillCount[node] == 0`. Revert with `OpenFillsPending` if not.

Why both locks instead of replacing one with the other:
- **Counter** answers "is there *any* unresolved fill activity for this solver?" — gates `withdraw`.
- **Amount** answers "how much is being *actively contested* right now?" — drives `slash` math when a challenge succeeds.
A solver with 5 open fills and no live challenges has `openFillCount=5, lockedAmount=0` — vulnerable but not contested. The two states are genuinely different and worth modeling separately.

**Indexer responsibility:** `unlockOnFill(node)` is called once per fill *after* `challengeDeadline` passes. There's no on-chain trigger for this — it's a wall-clock deadline. The indexer maintains a sorted queue of upcoming deadlines and submits a batched `unlockOnFill` tx when each expires. Document this explicitly in `packages/indexer/SCHEDULER.md`.

**Test:**
- `test_lockOnFill_only_fillRegistry`
- `test_lockOnFill_increments_counter`
- `test_unlockOnFill_decrements`
- `test_unlockOnFill_reverts_on_underflow`
- `test_withdraw_reverts_when_openFills_present`
- `test_withdraw_succeeds_after_all_fills_unlocked`.

**Commit:** `feat(SolverBondVault): counter-based fill lock with openFillCount`

---

## 5. [done] EBBOOracle (Base) — fork-only tests

Reads real Uniswap v3 pools from the Base fork. **v4 is deferred** — Phase 0 verification found no Base v4 USDC/WETH pool with material TVL, so the v4 reader is not in MVP scope. Re-evaluate at Phase 4: if a v4 pool enters the top-3 by TVL, add a `_priceFromV4` reader and propose a new pool list via the timelock.

All tests in this section require `--fork-url`.

### Step 5.1 [done] — Pool list registry with timelock
- `struct PoolRef { address pool; }` — single field today; reserves the dispatch point so a future v4 reader can add fields without storage migration.
- `mapping(bytes32 pairKey => PoolRef[]) internal _poolsForPair;` where `pairKey = keccak256(abi.encode(token0, token1))` with sorted ordering.
- `proposePoolList(...)` writes to a pending slot with `eta = now + 48h`.
- `commitPoolList(...)` after eta.
- `cancelPoolList(...)`.
- Owner is a multisig (set in constructor, but can be a single EOA in test).

**Test:**
- `test_propose_then_commit_after_eta`
- `test_commit_reverts_before_eta`
- `test_cancel_clears_pending`.

**Commit:** `feat(EBBOOracle): timelocked pool list registry`

### Step 5.2 [done] — V3 spot price reader
Internal helper `_priceFromV3(address pool, address tokenIn, address tokenOut) view returns (uint256 price1e18)`:
- Read `slot0()` for `sqrtPriceX96`.
- Compute price via `FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, 2**192)` then scale to 1e18.
- Read pool's `token0()` and `token1()`; if `tokenIn == token1`, invert.

**Test:** fork test — pick the canonical USDC/WETH 0.05% v3 pool on Base, assert price is within ~5% of CoinGecko spot at the fork block.

**Commit:** `feat(EBBOOracle): v3 slot0 price reader with token ordering`

### Step 5.3 [done] — Geometric mean
Internal `_geomeanEqualWeighted(uint256[] memory prices1e18) pure returns (uint256)`:
- `prod = product of (price / 1e18)` — but to avoid overflow, accumulate in log-space using PRBMath (`UD60x18`) or fixed-point logarithm. Recommend importing `prb-math` (`forge install PaulRBerg/prb-math`).
- For N=3 with USDC/WETH-scale prices, naïve `nthRoot(prod, N)` overflows; use log-space: `geomean = exp((ln(p1) + ln(p2) + ln(p3)) / N)`.

**Test:**
- `test_geomean_three_equal_inputs_returns_input` (within 1 wei tolerance)
- `test_geomean_known_triple` (e.g., 1e18, 4e18, 9e18 → ~3.30e18, hand-computed).

**Commit:** `feat(EBBOOracle): equal-weighted geomean in log space`

### Step 5.4 [done] — Public `computeBenchmark`
- `computeBenchmark(address tokenIn, address tokenOut) external view returns (uint256 price1e18)`:
  - Look up pool list for the sorted pair; revert if `<3` pools registered.
  - For each pool, call `_priceFromV3`.
  - Pass results to `_geomeanEqualWeighted`.
- Add per-pool sanity guard: revert if any pool returns price=0.

**Test:** fork test — register the 3 canonical USDC/WETH Base v3 pools (verified in Phase 0):
- `0x6c561B446416E1A00E8E93E221854d6eA4171372` — 0.30% fee
- `0xd0b53D9277642d899DF5C87A3966A349A798F224` — 0.05% fee
- `0x0b1C2DCbBfA744ebD3fC17fF1A96A1E1Eb4B2d69` — 1.00% fee

Assert `computeBenchmark(USDC, WETH)` falls within 0.5% of the 0.05% pool's v3 spot (the deepest pool, treated as the reference).

**Commit:** `feat(EBBOOracle): computeBenchmark across registered pools`

### Step 5.5 [done] — Manipulation-resistance test
Fork test that uses `vm.store` or a helper that performs a one-sided swap against one pool to skew its spot, then asserts the benchmark moves by ≤ `1/sqrt(N)` of the skew (NFR-2 invariant).

**Test:** `test_manipulationResistance_singlePool_one_over_sqrt_n` passes.

**Commit:** `test(EBBOOracle): NFR-2 manipulation-resistance bound`

---

## 6. [done] SolverRegistry + ChallengerRegistry (Base) — production registrars

Build these **before** `ReckonValidator` and `FillRegistry`: both downstream contracts take `IReckonRegistrar` in their constructor and the deploy script wires the production registry instance directly. The mock from §3.1 still drives unit tests, but the production contracts need to compile and deploy first for §7, §8, §10 and the bootstrap script to land cleanly.

Replaces v0.7's `ENSReputationWriter` and the deferred Durin/in-house registrar slot from §3.2. In v0.9+, real ENS subnames live virtually in MongoDB and are served by the CCIP-Read gateway behind `ReckonWildcardResolver` on Ethereum mainnet — but on Base we still need contract-callable namehash lists so the validator, vault, and challenger can do their work without an off-chain hop. These two contracts are those lists, written by the same relayer EOA that records fills.

### Step 6.1 [done] — `SolverRegistry` (implements `IReckonRegistrar`)

Lives on Base. Implements the full `IReckonRegistrar` interface from §1.3 (lookup methods inherited from `IReckonNamehashLookup` plus `setText`/`getText`). Constructor takes `(address owner, address relayer)`.

Storage:
- `address public owner;` (admin, can rotate relayer)
- `address public relayer;` (the only EOA that may register/unregister/setText)
- `mapping(bytes32 node => address) internal _ownerOfNode;`
- `mapping(address owner => bytes32) internal _nodeOfOwner;`
- `mapping(bytes32 node => mapping(string key => string value)) internal _texts;`
- `event SolverRegistered(bytes32 indexed node, address indexed owner);`
- `event SolverUnregistered(bytes32 indexed node);`
- `event TextSet(bytes32 indexed node, string key, string value);`
- `event RelayerRotated(address indexed prev, address indexed next);`

External surface:
- `register(bytes32 node, address solverOwner) external` — only relayer; reverts if `_nodeOfOwner[solverOwner] != 0` (one subname per address) or if `_ownerOfNode[node] != address(0)`.
- `unregister(bytes32 node) external` — only relayer.
- `setText(bytes32 node, string calldata key, string calldata value) external` — only relayer. Used by the KeeperHub schedule workflow to push reputation deltas (`reckon.reputation`, `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`, `reckon.bondLocked`).
- `rotateRelayer(address) external` — only owner.

`IReckonRegistrar` view methods (must keep §4 working unchanged):
- `namehashOf(address) returns (bytes32)` — returns `_nodeOfOwner[owner]`; reverts `NotRegistered` if zero.
- `ownerOfNamehash(bytes32) returns (address)` — returns `_ownerOfNode[node]`.
- `isRegistered(address) returns (bool)` — `_nodeOfOwner[owner] != 0`.
- `getText(bytes32, string) returns (string memory)` — returns `_texts[node][key]` (empty string if unset; `SolverBondVault._parseUint` already handles the empty/malformed fallback to `baseBond`).

**Test:**
- `test_register_only_relayer`
- `test_register_rejects_duplicate_owner`
- `test_register_rejects_duplicate_node`
- `test_setText_only_relayer_round_trips`
- `test_namehashOf_reverts_for_unregistered`
- `test_rotateRelayer_only_owner`
- Integration: deploy `SolverRegistry` + `SolverBondVault`, register a solver via relayer, set `reckon.reputation` text, assert `requiredBond` decays per §4.2's curve. This is the proof that swapping the mock for the production registrar doesn't break §4.

**Commit:** `feat(SolverRegistry): production IReckonRegistrar with relayer-attested namehashes`

### Step 6.2 [done] — `ChallengerRegistry` (implements `IReckonNamehashLookup` only)

Smaller surface than `SolverRegistry` — challengers don't need text records (no on-chain reputation read against challengers). Implements `IReckonNamehashLookup` from §1.3 — **not** the full `IReckonRegistrar`. The asymmetry is intentional and matches v0.9's mechanism design (solvers carry on-chain reputation that affects bond size; challengers have binary registered/not-registered identity). `Challenger.sol` accepts `IReckonNamehashLookup` for its challenger registry parameter so the type-system reflects the smaller surface.

Constructor `(address owner, address relayer)`.

Storage:
- `address public owner;`
- `address public relayer;`
- `mapping(bytes32 node => address) internal _ownerOfNode;`
- `mapping(address owner => bytes32) internal _nodeOfOwner;`
- `event ChallengerRegistered(bytes32 indexed node, address indexed owner);`
- `event ChallengerUnregistered(bytes32 indexed node);`
- `event RelayerRotated(address indexed prev, address indexed next);`

External:
- `register(bytes32 node, address challengerOwner) external` — only relayer; one-subname-per-address invariant.
- `unregister(bytes32 node) external` — only relayer.
- `rotateRelayer(address) external` — only owner.
- `isRegistered(address owner) external view returns (bool)` — used by `Challenger._preflight` to verify the challenger's registration before any state writes. (Address-keyed mirrors `SolverRegistry`'s shape so the call site is symmetric.)
- `namehashOf(address) external view returns (bytes32)` — same semantics as `SolverRegistry`; reverts on unregistered.
- `ownerOfNamehash(bytes32) external view returns (address)`.

**Test:**
- `test_register_only_relayer`
- `test_register_rejects_duplicate`
- `test_isRegistered_true_after_register`
- `test_unregister_clears_both_directions`.

**Commit:** `feat(ChallengerRegistry): minimal namehash list for Challenger gating`

### Step 6.3 [done] — Reputation flush moves off-chain (note, no code)

Document in `docs/reputation-flow.md`:
- Relayer subscribes to `Challenger.ChallengeSucceeded` and `Challenger.ChallengeFailed` plus `FillRegistry.FillRecorded` (with `slashed=false` aging into the "clean fill" bucket after `challengeDeadline`).
- Each event mutates a MongoDB `reputation_updates` document keyed by `fillerNamehash`.
- A KeeperHub schedule workflow runs every 24 h, pages through `reputation_updates`, and for each touched node calls `SolverRegistry.setText(node, "reckon.reputation", newValueDecimalString)` plus the companion text keys (`reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`).
- `SolverBondVault.requiredBond` reads the freshly written text on the next `deposit` / quote — the on-chain decay model from §4.2 keeps working unchanged.
- The CCIP-Read gateway serves the same MongoDB values to external ENS clients (viem, ethers, wagmi) under `bunni.solvers.reckon.eth`'s text records.

No contract code lands here — this section just records that v0.7's `ENSReputationWriter` is intentionally deleted and replaced by the off-chain pipeline above.

**Test:** N/A.

**Commit:** `docs(reputation): off-chain flow replacing ENSReputationWriter`

---

## 7. [done] ReckonValidator (Base)

The only contract on the UniswapX integration boundary. Must be `external view`. Constructor takes `IReckonRegistrar`, satisfied at deploy time by the production `SolverRegistry` from §6.1; tests continue to use `MockReckonRegistrar` from §3.1.

### Step 7.1 [done] — Implement `IValidationCallback.validate`
- Constructor: `(IReckonRegistrar solverRegistry)`. Store as `IReckonRegistrar public immutable solverRegistry;`.
- `validate(address filler, ResolvedOrder calldata order) external view`:
  - `if (!solverRegistry.isRegistered(filler)) revert NotRegistered();`
  - `bytes32 fillerNode = solverRegistry.namehashOf(filler);` (computed for parity with v0.9 FR-3 wording; not currently consumed in the view, but the namehash derivation is the bit we want covered by gas tests).
  - Decode `uint16 eboTolerance = abi.decode(order.info.additionalValidationData, (uint16));` — wrapped in a `try`/library to surface a clean revert reason on malformed input.
  - Sanity check: `eboTolerance <= 10_000` (basis points cap at 100%).
  - Returns silently.

**Test:**
- `test_validate_succeeds_for_registered_filler_with_valid_data`
- `test_validate_reverts_unregistered_filler`
- `test_validate_reverts_on_malformed_validationData`
- `test_validate_reverts_on_tolerance_above_10000bps`.

**Commit:** `feat(ReckonValidator): view-only ENS gating per UniswapX spec`

### Step 7.2 [done] — Gas budget assertion
Add `test_validate_under_30k_gas` that wraps the call in `gasleft()` snapshots and asserts < 30_000 (per NFR-1).

**Test:** passes.

**Commit:** `test(ReckonValidator): assert ≤30k gas budget`

---

## 8. [done] FillRegistry (Base)

Records resolved fills as observed by the off-chain relayer subscribing to UniswapX `PriorityOrderReactor.Fill` events. `tokenIn` / `tokenOut` are baked into the record from day one (resolves the v0.7 open item — `Challenger.submit` needs them in §10.4 to call `EBBOOracle.computeBenchmark`). Depends on `SolverRegistry` from §6.1.

### Step 8.1 [done] — Storage + permissioned recorder
- `struct FillRecord { bytes32 fillerNamehash; address swapper; address tokenIn; address tokenOut; uint128 inputAmount; uint128 outputAmount; uint16 eboTolerance; uint64 fillBlock; uint64 challengeDeadline; bool slashed; }`
- `mapping(bytes32 orderHash => FillRecord) public fills;`
- `IReckonRegistrar public immutable solverRegistry;` (the production `SolverRegistry` from §6.1)
- `address public recorder;` (relayer EOA; rotatable by owner)
- `uint64 public challengeWindowBlocks = 1800;` (≈ 30 min on Base 1s blocks)
- `event FillRecorded(bytes32 indexed orderHash, bytes32 indexed fillerNamehash, address indexed swapper, uint64 fillBlock);`
- `event FillBatchAnchored(bytes32 indexed rootHash, bytes32 firstOrderHash, bytes32 lastOrderHash);`

**Test:** `test_constructor_sets_recorder_and_registry`, `test_rotateRecorder_only_owner`.

**Commit:** `feat(FillRegistry): storage, recorder role, tokenIn/tokenOut on record`

### Step 8.2 [done] — `recordFill` with multi-output rejection
- `recordFill(bytes32 orderHash, address filler, address swapper, address tokenIn, address tokenOut, uint128 inputAmount, uint128 outputAmount, uint16 eboTolerance, uint8 outputsLength, uint64 fillBlock) external`:
  - `require(msg.sender == recorder);`
  - `require(outputsLength == 1, MultiOutputUnsupported());`
  - `require(fills[orderHash].fillBlock == 0, AlreadyRecorded());` (idempotency)
  - `bytes32 node = solverRegistry.namehashOf(filler);` (reverts via `NotRegistered` if the relayer somehow forwarded a fill from an unregistered solver — defense-in-depth; the validator already gated this)
  - Compute `challengeDeadline = fillBlock + challengeWindowBlocks`.
  - Write record, emit `FillRecorded`.
  - Call `solverBondVault.lock(node, /* see counter pattern below */)`.

**Counter-based lock pattern (recommended):** maintain `mapping(bytes32 node => uint256) openFillCount` on `SolverBondVault`. While `openFillCount[node] > 0`, the full `requiredBond(node)` is treated as locked. Each `recordFill` increments; each fill aging past the deadline (or being slashed) decrements. This honors FR-1 ("bond locked while challenge windows are open against any of the solver's recent fills") without per-fill amount accounting. If §4.3's `lock`/`unlock` is already amount-based, add a thin `lockOnFill(node)` / `unlockOnFill(node)` pair on top — non-breaking.

**Test:**
- `test_recordFill_only_recorder`
- `test_recordFill_rejects_multi_output`
- `test_recordFill_rejects_duplicate_orderHash`
- `test_recordFill_locks_solver_bond`.

**Commit:** `feat(FillRegistry): recordFill with multi-output rejection and bond lock`

### Step 8.3 [done] — `anchorBatch` for 0G Storage Log
- `anchorBatch(bytes32 rootHash, bytes32 firstOrderHash, bytes32 lastOrderHash) external` — only recorder; emits `FillBatchAnchored`. Relayer calls this every 50 fills or 60 s, whichever first — after uploading the batch file via the 0G `indexer` SDK client (`indexer.upload()` from `@0gfoundation/0g-ts-sdk`) and capturing the returned root hash.

**Test:** `test_anchorBatch_emits_event`, `test_anchorBatch_only_recorder`.

**Commit:** `feat(FillRegistry): anchorBatch for 0G Storage Log roots`

### Step 8.4 [done] — Read helpers for Challenger
- `getFill(bytes32 orderHash) external view returns (FillRecord memory)`.
- `address public challenger;` plus `setChallenger(address)` (one-shot, owner-only, mirrors §4.1's pattern).
- `markSlashed(bytes32 orderHash) external` — only `challenger` contract; sets `slashed = true`. Used by Challenger to prevent double-slash and to drive the bond-unlock path (`solverBondVault.unlockOnFill(node)`).

**Test:** `test_markSlashed_only_challenger`, `test_setChallenger_one_shot`.

**Commit:** `feat(FillRegistry): getFill + markSlashed + challenger setter`

---

## 9. RoyaltyDistributor (Base)

### Step 9.1 — Storage + config per tokenId
- `OwnerRegistry public immutable ownerRegistry;`
- `IERC20 public immutable usdc;`
- `address public protocolTreasury;`
- `uint64 public stalenessThreshold = 24 hours;`
- `struct Split { uint16 swapperBps; uint16 ownerBps; uint16 protocolBps; }` (must sum to 10_000)
- `mapping(uint256 tokenId => Split) public splitOf;` (defaults to 6000/3000/1000 if unset)
- `mapping(uint256 tokenId => uint256) public queuedForOwner;` — payouts pending stale-attestation retry.
- `mapping(uint256 tokenId => uint256) public queuedForUnknown;` — fallback bucket.

**Test:** `test_constructor`, `test_defaultSplit_60_30_10`, `test_setSplit_only_owner`.

**Commit:** `feat(RoyaltyDistributor): storage with default 60/30/10 split`

### Step 9.2 — `distribute(slashAmount, tokenId, swapper)`
- Only callable by `Challenger`.
- `Split memory s = splitOf[tokenId]; if (s.swapperBps + s.ownerBps + s.protocolBps == 0) s = Split(6000, 3000, 1000);`
- `uint256 swapperAmt = slashAmount * s.swapperBps / 10_000;` etc.
- USDC transfer to swapper + protocol.
- For owner: try `ownerRegistry.ownerOf(tokenId)`; if `ownerRegistry.isStale(tokenId, stalenessThreshold)`, queue under `queuedForOwner`; else transfer.
- Emit `RoyaltyPaid(tokenId, swapper, swapperAmt, ownerAmt, protocolAmt)`.

**Test:**
- `test_distribute_pays_swapper_and_protocol_immediately`
- `test_distribute_queues_owner_when_stale`
- `test_distribute_pays_owner_when_fresh`
- `test_distribute_only_challenger`.

**Commit:** `feat(RoyaltyDistributor): distribute with staleness queueing`

### Step 9.3 — `claimQueued(tokenId)`
- Reads fresh `ownerRegistry.ownerOf(tokenId)`; if still stale, revert.
- Drains `queuedForOwner[tokenId]` to that owner.

**Test:** `test_claimQueued_after_reattest`.

**Commit:** `feat(RoyaltyDistributor): claimQueued for stale-attestation retry`

---

## 10. Challenger (Base) — the orchestrator

Largest contract. Build incrementally.

### Step 10.1 — Storage + dependencies
- Wires: `FillRegistry fills`, `EBBOOracle ebbo`, `SolverBondVault solverBondVault`, `RoyaltyDistributor royalty`, `OwnerRegistry ownerRegistry`, `IReckonRegistrar solverRegistry` (production `SolverRegistry`), `IReckonNamehashLookup challengerRegistry` (production `ChallengerRegistry` — minimal lookup surface per §1.3 / §6.2), `IPermit2 permit2`, `IERC20 usdc`.
- **No `ENSReputationWriter` wiring** — reputation deltas are derived off-chain by the relayer from the `ChallengeSucceeded` / `ChallengeFailed` events emitted here.
- `uint16 public minChallengerBondBps = 1000;` (10% of solver bond).
- `event ChallengeSubmitted(bytes32 indexed orderHash, bytes32 indexed challengerNode, uint256 agentTokenId, uint256 challengerBond);`
- `event ChallengeSucceeded(bytes32 indexed orderHash, bytes32 indexed fillerNamehash, bytes32 indexed challengerNode, uint256 slashAmount);` (extra indexed fields so the relayer's reputation-update writer can avoid a follow-up read)
- `event ChallengeFailed(bytes32 indexed orderHash, bytes32 indexed fillerNamehash, address challenger);`

**Test:** `test_constructor_wires_all_deps`.

**Commit:** `feat(Challenger): storage and dependency wiring`

### Step 10.2 — Pre-flight checks (no math yet)
Implement `_preflight(bytes32 orderHash, address challengerEoa, uint256 agentTokenId) internal returns (FillRecord memory r, bytes32 challengerNode)`:
- `r = fills.getFill(orderHash); require(r.fillBlock != 0, FillNotFound());`
- `require(!r.slashed, AlreadySlashed());`
- `require(block.number <= r.challengeDeadline, ChallengeWindowClosed());`
- `require(challengerRegistry.isRegistered(challengerEoa), ChallengerNotRegistered());` — gates by registration before any namehash work.
- `challengerNode = challengerRegistry.namehashOf(challengerEoa);`
- `require(challengerNode != r.fillerNamehash, SelfChallengeForbidden());` — namehash equality check per v0.9 NFR-2 ("Solver self-challenge prevented by requiring challenger subname namehash ≠ filler subname namehash at contract level"). Cleaner than v0.7's cross-registry `isSameOwner` because solvers and challengers now live in two different registries with disjoint namespaces (`solvers.reckon.eth` vs `challengers.reckon.eth`), so a namehash collision would already imply identity.
- `require(ownerRegistry.ownerOf(agentTokenId) == challengerEoa, NotAgentOwner());`

**Test:** unit tests cover each revert path with mocks (mock `ChallengerRegistry` mirrors §8.2's surface; can be a thin in-test fake).

**Commit:** `feat(Challenger): preflight checks (deadline, self-challenge, agent ownership)`

### Step 10.3 — Permit2 bond pull
- `_pullBond(uint256 amount, IPermit2.SignatureTransferDetails calldata transferDetails, address challengerEoa, IPermit2.PermitTransferFrom calldata permit, bytes calldata signature)` internal.
- Call `permit2.permitTransferFrom(permit, transferDetails, challengerEoa, signature);` — pulls USDC from challenger's EOA into this contract.
- Validate `transferDetails.to == address(this)` and `transferDetails.requestedAmount == amount`.

**Test:** fork test — use a funded test EOA, sign a Permit2 transfer with `MessageHashUtils` + `vm.sign`, assert USDC moves.

**Commit:** `feat(Challenger): permit2 bond pull with signature validation`

### Step 10.4 — `submit` happy path (success branch)
- Public `submit(bytes32 orderHash, uint256 challengerBond, address beneficiary, uint256 agentTokenId, IPermit2.PermitTransferFrom calldata permit, bytes calldata signature) external`:
  - `(FillRecord memory r, bytes32 challengerNode) = _preflight(orderHash, msg.sender, agentTokenId);`
  - Validate `challengerBond >= solverBondVault.bondedAmount(r.fillerNamehash) * minChallengerBondBps / 10_000`.
  - `_pullBond(challengerBond, /* permit2 details */, msg.sender, permit, signature);`
  - Compute benchmark: `uint256 benchmark = ebbo.computeBenchmark(r.tokenIn, r.tokenOut);` (`tokenIn` / `tokenOut` are now part of `FillRecord` per §7.1).
  - Compute `expectedOutput = benchmark * r.inputAmount / 1e18 * (10_000 - r.eboTolerance) / 10_000`.
  - Emit `ChallengeSubmitted(orderHash, challengerNode, agentTokenId, challengerBond)`.
  - **If `r.outputAmount < expectedOutput`:** challenge succeeds.
    - `slashAmount = min(solverBondVault.bondedAmount(r.fillerNamehash), expectedOutput - r.outputAmount)`
    - `solverBondVault.slash(r.fillerNamehash, slashAmount, address(royalty));`
    - `royalty.distribute(slashAmount, agentTokenId, r.swapper);`
    - Return challenger bond to `beneficiary`.
    - `fills.markSlashed(orderHash);`
    - Emit `ChallengeSucceeded(orderHash, r.fillerNamehash, challengerNode, slashAmount)`.

**No on-chain reputation writes.** The relayer subscribes to `ChallengeSucceeded` and writes the slash delta to MongoDB's `reputation_updates` collection; the daily KeeperHub flush workflow then pushes the new aggregate value into `SolverRegistry` text records (§6.3).

**Test:** integration test (mock EBBO oracle returning a benchmark that puts `actualOutput < expectedOutput`); assert slash + royalty distribution + `markSlashed` + `ChallengeSucceeded` event with correct indexed fields. Reputation assertions belong to relayer tests, not contract tests.

**Commit:** `feat(Challenger): submit success branch — slash, distribute, mark`

### Step 10.5 — `submit` failure branch (challenger loses bond)
Else branch when `r.outputAmount >= expectedOutput`:
- Challenger bond transfers to `protocolTreasury` (parallels the 10% protocol cut on the success branch).
- Emit `ChallengeFailed(orderHash, r.fillerNamehash, msg.sender)`.

The relayer treats `ChallengeFailed` (and aging-out fills with no challenge) as positive-reputation signals for the filler. No on-chain writeback.

**Test:** integration test asserting bond moves to treasury and `ChallengeFailed` is emitted with the correct `fillerNamehash`.

**Commit:** `feat(Challenger): submit failure branch — challenger forfeits bond`

### Step 10.6 — Gas budget assertion
`test_submit_under_280k_gas` (pre-multiplier). Use a representative fork-state setup.

**Test:** passes.

**Commit:** `test(Challenger): submit ≤280k gas`

---

## 11. ChallengerNFT (0G Galileo) — ERC-7857 fork

Lives under `src/inft/ChallengerNFT.sol`. Tested against a local Anvil (no fork — 0G Galileo bytecode is not load-bearing for unit tests; integration runs on the real Galileo testnet).

### Step 11.1 — Vendor the ERC-7857 reference
- `forge install 0gfoundation/0g-agent-nft --no-commit` (or copy minimal subset under `src/inft/vendor/` if the install bloats remappings).
- Add remapping `inft-ref/=lib/0g-agent-nft/src/`.

**Test:** build only.

**Commit:** `chore(inft): vendor 0g-agent-nft reference`

### Step 11.2 — `ChallengerNFT` skeleton extending reference
- Inherit the reference's ERC-7857 base contract.
- Constructor sets the **mock oracle** (per spec FR-10 — production oracle is future work) and the encrypted-blob URI verifier.
- Override `name()`/`symbol()` to "Reckon Challenger" / "RECK".

**Test:** `test_mintAndTransferWithMockOracle` — uses the reference's existing test patterns.

**Commit:** `feat(ChallengerNFT): extend ERC-7857 reference with mock oracle`

### Step 11.3 — `updateBrain(tokenId, newURI)`
- Only current owner can call.
- Emits `BrainUpdated(tokenId, oldURI, newURI)` — relayer indexes for MongoDB `inft_events` collection.

**Test:** `test_updateBrain_onlyOwner`, `test_updateBrain_emits`.

**Commit:** `feat(ChallengerNFT): updateBrain owner-gated URI rotation`

### Step 11.4 — Transfer event surface for relayer
Verify the reference's `Transfer` event matches the ERC-721 standard signature (`Transfer(address indexed from, address indexed to, uint256 indexed tokenId)`) — the relayer subscribes to this exact topic on Galileo to call `OwnerRegistry.attestOwner` on Base. Add a regression test asserting the event topic matches `keccak256("Transfer(address,address,uint256)")`.

**Test:** `test_transferEventTopic_isStandardERC721`.

**Commit:** `test(ChallengerNFT): pin standard Transfer topic for relayer`

---

## 12. ReckonWildcardResolver (Ethereum Mainnet)

The only Reckon contract on Ethereum mainnet. Lives at `src/ens/ReckonWildcardResolver.sol`. Implements ENSIP-10 wildcard resolution + EIP-3668 CCIP-Read for every subname under `reckon.eth` (`*.solvers.reckon.eth`, `*.challengers.reckon.eth`, and the parent records themselves). All actual lookups defer to the off-chain CCIP-Read gateway (Builder A's Node.js service), which reads MongoDB and signs responses with a key the resolver trusts. ~80 lines of Solidity.

Reference: [`ensdomains/offchain-resolver`](https://github.com/ensdomains/offchain-resolver) — the canonical ENS Labs reference implementation of an EIP-3668 + ENSIP-10 resolver paired with a TypeScript gateway. The Solidity contract under `packages/contracts/contracts/OffchainResolver.sol` is the closest available exemplar; `ReckonWildcardResolver` is essentially this contract scoped to one parent name with our own gateway URL. The ENS LLM index does not pin EIP-3668 wire details — verify the typehash and signing preimage against the reference repo before launch.

Tested on a Sepolia fork during dev (cheap signed-message round trip without burning mainnet gas); deployed to **real Ethereum mainnet** at the Phase 2 gateway-launch milestone — this is the one mainnet deployment in the whole stack.

### Step 12.1 — Skeleton + trusted SIGNER

- `src/ens/ReckonWildcardResolver.sol`.
- Implements minimal `IExtendedResolver` (ENSIP-10) interface: `function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);`.
- Storage:
  - `address public signer;` — the gateway's signing EOA. Set in constructor.
  - `address public owner;` — admin who can rotate `signer`.
  - `string[] public urls;` — gateway URLs (typically one: `["https://gateway.reckon.fi/{sender}/{data}.json"]`). Set in constructor; rotatable by owner.
- Events: `SignerRotated(address indexed prev, address indexed next)`, `UrlsRotated()`.
- ERC-165 `supportsInterface` returns true for `IExtendedResolver` (`0x9061b923`) and the EIP-3668 marker.

**Test:** `test_constructor_sets_signer_and_urls`, `test_supportsInterface_extendedResolver`, `test_rotateSigner_only_owner`.

**Commit:** `feat(ReckonWildcardResolver): skeleton with trusted signer and gateway URLs`

### Step 12.2 — `OffchainLookup` revert in `resolve`

Per EIP-3668, the resolver delegates by reverting with structured data the client follows.

```solidity
error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
    revert OffchainLookup(
        address(this),
        urls,
        data,
        this.resolveWithProof.selector,
        abi.encode(data)              // extraData replays the original query in the callback
    );
}
```

Note: `name` (DNS-encoded) is forwarded to the gateway via `data`'s context (the gateway parses it from the original `text(node, key)` / `addr(node)` call ABI). We don't pre-decode names on-chain — keeps the resolver minimal.

**Test:**
- `test_resolve_reverts_with_offchainLookup_shape` — call `resolve(name, data)` inside `vm.expectRevert(OffchainLookup.selector)`, decode the revert data, assert all five fields match expectations.
- `test_resolve_passes_data_through_unchanged_to_extraData`.

**Commit:** `feat(ReckonWildcardResolver): ENSIP-10 resolve with EIP-3668 OffchainLookup revert`

### Step 12.3 — `resolveWithProof` callback with EIP-712 verification

When the client returns the gateway's signed response, the resolver verifies the signature and returns the answer.

```solidity
function resolveWithProof(bytes calldata response, bytes calldata extraData)
    external view returns (bytes memory)
{
    (bytes memory result, uint64 expires, bytes memory sig) =
        abi.decode(response, (bytes, uint64, bytes));

    if (expires < block.timestamp) revert SignatureExpired();

    bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
        keccak256("Message(bytes sender,uint64 expires,bytes32 requestHash,bytes32 resultHash)"),
        bytes32(uint256(uint160(address(this)))),
        expires,
        keccak256(extraData),
        keccak256(result)
    )));

    address recovered = ECDSA.recover(digest, sig);
    if (recovered != signer) revert UnauthorizedSigner();

    return result;
}
```

- Use OpenZeppelin `EIP712` mixin for `_hashTypedDataV4` and `ECDSA` for `recover`.
- Domain: `EIP712("ReckonWildcardResolver", "1")` set in constructor.
- The exact preimage shape mirrors `ensdomains/offchain-resolver`'s `SignatureVerifier.sol`. Read it before writing this step — the typehash, field ordering, and `_hashTypedDataV4` domain must match the gateway's signer exactly or every callback will revert. Pin the typehash in `src/ens/ResolverTypes.sol` and re-export the same constant from the gateway's TypeScript signer so they can't drift.

**Test:**
- `test_resolveWithProof_returns_result_for_valid_signature` — sign a known `(result, expires, requestHash, resultHash)` quadruple in test using `vm.sign`, pass it in, assert returned bytes match `result`.
- `test_resolveWithProof_reverts_on_expired_signature` (advance `vm.warp` past `expires`).
- `test_resolveWithProof_reverts_on_wrong_signer` — sign with a non-signer key, assert `UnauthorizedSigner` revert.
- `test_resolveWithProof_reverts_on_tampered_result` — flip a bit in `result` after signing.

**Commit:** `feat(ReckonWildcardResolver): resolveWithProof with EIP-712 signature verification`

### Step 12.4 — Signer / URL rotation

- `setSigner(address newSigner) external` — only owner; emits `SignerRotated`.
- `setUrls(string[] calldata newUrls) external` — only owner; emits `UrlsRotated`. Useful when the gateway moves hosts.
- Two-step ownership transfer (OZ `Ownable2Step`) so a fat-fingered key can't lock the resolver.

**Test:** `test_setSigner_only_owner_emits`, `test_setUrls_only_owner_emits`, `test_ownership_transfer_two_step`.

**Commit:** `feat(ReckonWildcardResolver): owner-rotated signer and gateway URLs`

### Step 12.5 — Deploy script + ENS wiring

Create `script/DeployENSResolver.s.sol`:
- `vm.createSelectFork(vm.rpcUrl("ethereum"))` — Ethereum mainnet (use Sepolia in dev: `vm.rpcUrl("sepolia")`).
- Deploys `ReckonWildcardResolver(signer = <gateway EOA>, urls = ["https://gateway.reckon.fi/{sender}/{data}.json"])`.
- Logs: `address deployedAt`, `bytes32 reckonEthNamehash` for the next manual step.
- Writes `deployments/ethereum-mainnet.json`.

**Manual post-deploy step (one-time, by Builder A from the wallet that owns `reckon.eth`):**
- Visit `app.ens.domains` → `reckon.eth` → "Records" → "Edit Records" → set Resolver to the deployed `ReckonWildcardResolver` address. One mainnet tx, ~$5–10 gas.
- After this, **every** ENS client (viem, ethers, wagmi) resolving `*.solvers.reckon.eth` or `*.challengers.reckon.eth` will hit the wildcard resolver, which reverts with `OffchainLookup`, which the client follows to the gateway, which signs and returns — transparently to the caller.

**Test:** dry-run on a Sepolia fork: `forge script DeployENSResolver --rpc-url sepolia --simulate`. Commit transcript to `docs/deployment-dry-run-ens.md`.

**Commit:** `feat(scripts): DeployENSResolver for Ethereum mainnet wildcard resolver`

### Step 12.6 — End-to-end resolver test (Sepolia fork)

`test/ens/WildcardResolver.t.sol::test_endToEnd_OffchainLookup_then_callback`:
- Deploy resolver to a Sepolia fork.
- Construct an ENSIP-10 query: `data = abi.encodeCall(IPublicResolver.text, (namehash("bunni.solvers.reckon.eth"), "reckon.reputation"))`.
- Call `resolver.resolve(dnsEncode("bunni.solvers.reckon.eth"), data)` inside `vm.expectRevert` — assert the `OffchainLookup` payload's URL matches `urls[0]` and `extraData` round-trips.
- In test, simulate the gateway: sign a known `result = abi.encode("0.84")` with the signer key, pass `(result, block.timestamp + 60, sig)` to `resolveWithProof(response, extraData)`, assert the returned bytes ABI-decode to `"0.84"`.

This is the proof point that the on-chain half is complete; gateway integration tests live in `packages/relayer/` and the gateway service repo, not contracts.

**Test:** passes on Sepolia fork.

**Commit:** `test(WildcardResolver): end-to-end OffchainLookup → signed callback → result`

---

## 13. Bootstrap and deploy scripts

### Step 13.1 — `BootstrapAnvilFork.s.sol`
- One Forge script that:
  - Selects fork (`vm.createSelectFork(vm.rpcUrl("base"))`).
  - Deploys (in dependency order): `OwnerRegistry`, `SolverRegistry`, `ChallengerRegistry`, `EBBOOracle` (with the 3 canonical USDC/WETH pools committed via §5.1's timelock workflow — fast-forward `vm.warp` past the eta inside the script), `SolverBondVault`, `FillRegistry`, `RoyaltyDistributor`, `ReckonValidator`, `Challenger`.
  - Constructor arg `relayer` for `SolverRegistry` / `ChallengerRegistry` / `OwnerRegistry` / `FillRegistry.recorder` all point at the same single relayer EOA in dev (rotatable later).
  - Wires post-deploy setters: `vault.setChallenger(challenger)`, `fillRegistry.setChallenger(challenger)`. **No `repWriter.setReporter(...)` — the writer is gone.**
  - Registers a baseline set of test solvers + challengers via `solverRegistry.register(node, owner)` and `challengerRegistry.register(node, owner)` from the relayer EOA; precomputes namehashes for `alice.solvers.reckon.eth`, `bob.solvers.reckon.eth`, `eve.challengers.reckon.eth`, etc.
  - Seeds reputation text on the SolverRegistry (`solverRegistry.setText(node, "reckon.reputation", "500000000000000000")` — mid-decay) so the `requiredBond` math has something non-default to read.
  - Funds test EOAs with USDC via `deal()`.
  - Has each test solver `solverBondVault.deposit(...)` a baseline bond.
  - Writes deployed addresses to `deployments/anvil-fork.json`.

**Test:** `forge script BootstrapAnvilFork --rpc-url anvil --broadcast` succeeds end-to-end on a fresh Anvil fork; addresses JSON is generated; a follow-up `forge script` reads addresses and asserts `solverBondVault.bondedAmount(node) > 0` for each seeded solver and `challengerRegistry.isRegistered(...)` for each seeded challenger.

**Commit:** `feat(scripts): BootstrapAnvilFork end-to-end deploy + seed`

### Step 13.2 — `DeployBaseMainnet.s.sol`
- Same as above but no `deal()`, no subname seeding (real subnames are inserted into MongoDB by humans/UI, then mirrored on-chain by the relayer's first `register` call when the subname is first observed). The script just deploys the contracts and wires roles.
- Reads constructor args from a `mainnet.toml` config file (relayer EOA, owner multisig, treasury, EBBO pool list).
- Verifies on Basescan via `--verify`.

**Test:** dry-run with `--rpc-url base --simulate`; commit the simulation transcript to `docs/deployment-dry-run.md`.

**Commit:** `feat(scripts): DeployBaseMainnet with basescan verification`

### Step 13.3 — `DeployZGGalileo.s.sol`
- Deploys only `ChallengerNFT` to 0G Galileo via `--rpc-url zg_galileo`.

**Test:** dry-run; commit the simulation transcript.

**Commit:** `feat(scripts): DeployZGGalileo for ChallengerNFT`

---

## 14. End-to-end integration test

### Step 14.1 — Full happy path on fork
`test/E2E.t.sol::test_HappyPath_BadFill_GetsSlashed`:
- Run `BootstrapAnvilFork`-equivalent setup in `setUp()`.
- Simulate a UniswapX `Fill` event (we don't actually run the reactor — instead we have the test impersonate the relayer's recorder EOA via `vm.prank` and call `FillRegistry.recordFill` with an `outputAmount` that's clearly below benchmark, including the new `tokenIn`/`tokenOut` args from §8.2).
- Submit a challenge via `Challenger.submit` (using a Permit2 signature signed in test setup).
- Assert: solver bond decremented; `RoyaltyPaid` event with 60/30/10 split; `FillRecord.slashed == true`; `ChallengeSucceeded` event includes `fillerNamehash` and `challengerNode`; second `submit` reverts with `AlreadySlashed`.
- Reputation propagation is **not** asserted on-chain — that path lives in relayer tests. The contract test asserts the events the relayer subscribes to are emitted with the correct shape.

**Test:** passes against fork.

**Commit:** `test(e2e): bad fill triggers slash + royalty + ChallengeSucceeded event`

### Step 14.2 — Full failure path
`test_HappyPath_GoodFill_ChallengeFails`:
- Same setup but `outputAmount` matches benchmark within tolerance.
- `Challenger.submit` enters failure branch; challenger bond moves to `protocolTreasury`; `ChallengeFailed` emitted with the `fillerNamehash`.

**Test:** passes.

**Commit:** `test(e2e): good fill rejects challenge, challenger forfeits bond`

### Step 14.3 — Adversarial scenarios
Add tests for:
- Challenge after deadline.
- Self-challenge attempt — same EOA registered in both `SolverRegistry` and `ChallengerRegistry` would still produce different namehashes (different parent nodes), so the equality check passes; the more realistic attack is a colluding pair of EOAs. Document that the on-chain check stops the trivial case and that economic deterrence handles the colluding case (per spec §"Adversarial robustness").
- Challenger without subname (`ChallengerRegistry.isRegistered(msg.sender) == false`) → revert.
- Multi-output fill is rejected at relayer boundary (`FillRegistry.recordFill` reverts on `outputsLength != 1`).
- iNFT transferred mid-challenge → `OwnerRegistry` stale → royalty queued; `claimQueued` works after re-attest.
- Concurrent N=20 challenges in same block (use `vm.roll`/parallel calls); assert no double-slash via `markSlashed` idempotency.
- Reputation text record changes between two `deposit` calls correctly re-quote `requiredBond` (relayer flips `reckon.reputation` mid-test via `solverRegistry.setText`).

**Test:** all pass.

**Commit:** `test(e2e): adversarial scenarios per NFR-2`

### Step 14.4 — Gas budget regression
Aggregate gas snapshot test (`forge snapshot --check`) committed as `.gas-snapshot`. CI fails on regression.

**Test:** initial snapshot generation, then re-run gates.

**Commit:** `test(gas): commit baseline gas snapshot`

---

## 15. Static analysis and polish

### Step 15.1 — Slither
- Add `slither.config.json` with detectors disabled for `naming-convention`, `solc-version` (we pin intentionally).
- Add `make slither` target.
- Fix all HIGH and MEDIUM findings; document INFO/LOW dismissals in `docs/slither-dismissals.md`.

**Test:** `slither . --config-file slither.config.json` produces no HIGH/MEDIUM.

**Commit:** `chore: slither pass — clean HIGH/MEDIUM`

### Step 15.2 — NatSpec on every public function
Pass over each contract; add `@notice`, `@param`, `@return` on externals.

**Test:** `forge doc --build` succeeds; eyeball spot-check generated docs.

**Commit:** `docs: full natspec on public surface`

### Step 15.3 — Mythril smoke
Run `myth analyze src/Challenger.sol --solv 0.8.26 -t 3` (and `RoyaltyDistributor`, `SolverBondVault`). Address findings or document accepted risks.

**Test:** mythril output committed under `docs/mythril/`.

**Commit:** `chore: mythril smoke on critical contracts`

---

## 16. Milestone gates

After each phase milestone, do **not** continue until the gate is green:

- **End of §0–§1:** fork sanity green, CI green, registrar interface compiles. ✅ done
- **End of §2–§4:** `OwnerRegistry`, `MockReckonRegistrar`, `SolverBondVault` all at ≥80% line coverage. ✅ done
- **End of §5:** `EBBOOracle` matches v3 spot within 0.5% on real fork. ✅ done
- **End of §6:** `SolverRegistry` + `ChallengerRegistry` round-trip register/setText/isRegistered with relayer auth; `SolverBondVault.requiredBond` reads the production `SolverRegistry` text records correctly (integration test from §6.1 green).
- **End of §7:** `ReckonValidator.validate` rejects unregistered fillers and malformed validation data; under 30k gas per NFR-1.
- **End of §8:** `FillRegistry` rejects multi-output, stores `tokenIn`/`tokenOut`, locks the solver bond on record, anchors batch roots.
- **End of §9:** `RoyaltyDistributor` queues stale payouts and pays out via `claimQueued`.
- **End of §10:** Challenger submit ≤ 280k gas; both branches (success/failure) tested; `ChallengeSucceeded` / `ChallengeFailed` events carry the indexed namehashes the relayer needs.
- **End of §11:** ChallengerNFT mints + transfers via mock oracle; Transfer topic pinned.
- **End of §12:** `ReckonWildcardResolver` compiles, `OffchainLookup` revert tested, EIP-712 signature verification round-trips against a known `(result, expires, sig)` triple.
- **End of §13–§14:** `BootstrapAnvilFork.s.sol` runs cleanly on fresh Anvil (deploys both registries, seeds via relayer); full E2E scenarios green; `DeployENSResolver.s.sol` simulates cleanly against an Ethereum mainnet fork.
- **End of §15:** Slither/Mythril clean; NatSpec complete.

If a milestone slips by more than half a day, raise it in the daily standup and decide whether to descope (per spec §"Out of scope" and §"Scoping note for in-person 72-hour format").

---

## 17. Open items the spec doesn't pin

Flag these to Builder A / Builder B during Phase 0:

1. ~~**`FillRecord.tokenIn`/`tokenOut` fields**~~ — resolved in §7.1, baked into the struct from day one.
2. ~~**Per-fill bond lock vs counter-based lock**~~ — resolved in §4.4: amount-based `lock`/`unlock` from §4.3 stays for live challenges; new counter-based `lockOnFill`/`unlockOnFill` wraps it for "any open fill" gating. Both compose; `withdraw` checks both. Relayer owns `unlockOnFill` scheduling after `challengeDeadline`.
3. **Challenger bond recipient on failure:** spec doesn't specify. Locked in §10.5 as `protocolTreasury` (parallels the 10% protocol cut).
4. **EBBOOracle pool list source of truth:** ✅ resolved at §5.4 with the three Base v3 USDC/WETH pools.
5. **`reckon.reputation` text record encoding:** decimal-string of a `uint256` in [0, 1e18] — matches `SolverBondVault._parseUint` and the off-chain flush writer in §8.3. Document in `docs/reputation-flow.md`.
6. ~~**Durin vs in-house registrar**~~ — replaced by `SolverRegistry` + `ChallengerRegistry` (§8.1, §8.2), both relayer-attested. Mock registrar from §3.1 still drives unit tests.
7. **Permit2 nonce strategy:** spec doesn't pin nonce ranges per challenger; recommend documenting that each challenger agent owns a nonce range exclusive to its `agentTokenId` (e.g. `agentTokenId << 224 | localNonce`) so concurrent agents don't collide on Permit2's unordered nonce bitmap.
8. **0G Galileo deployment of `ChallengerNFT`:** the reference's mock oracle setup; verify exactly what addresses get baked into the constructor before Phase 4.
9. **NEW (v0.9): single-relayer trust assumption.** `SolverRegistry`, `ChallengerRegistry`, `OwnerRegistry`, and `FillRegistry` all share the same relayer EOA in dev. Production should rotate to four distinct keys so a compromise of one doesn't propagate. Document key-rotation runbook before mainnet deploy.
10. **NEW (v0.9): on-chain vs off-chain reputation source of truth.** v0.9 puts MongoDB as the read store and CCIP-Read serves it externally, but `SolverBondVault.requiredBond` requires an on-chain mirror. The relayer dual-writes (MongoDB + `SolverRegistry.setText`); flag the consistency window (max 24 h gap before the daily flush catches up) in the README.
11. **NEW (v0.9): how the relayer knows a fill aged out cleanly.** The relayer subscribes to `FillRecorded` and tracks per-orderHash deadlines in MongoDB; when `block.number > challengeDeadline` and no `ChallengeSucceeded` arrived, it marks the fill clean. No on-chain support needed — flag in relayer spec, not contracts.
