# Reckon Contracts — Step-by-Step Implementation Guide (v0.7)

**Audience:** Builder A (and Builder B during pairing-seam work). Aligns with `specs/reckon-spec-v0.7.md` and the partner-integration guides under `specs/research/partner-implementation-guide/`.

**Framework:** Foundry. Solidity `0.8.26` (matches UniswapX + v4). Forge tests run against an Anvil fork of Base mainnet via `vm.createSelectFork()`.

**Monorepo location:** `packages/contracts/` (this guide assumes a workspace layout with sibling `packages/indexer/`, `packages/agent/`, `packages/dashboard/`, etc. — only `contracts/` is in scope here).

**Working principle:** every step is small, ends with a tangible green test, and ends with a commit. The commit messages below are tentative — adjust if the diff drifts. Run `forge test` after each step; if a step has no new test, the prior suite must still be green.

---

## 0. Setup

### Step 0.1 — Initialize monorepo + contracts package
- At repo root, create `packages/contracts/`.
- Inside it run `forge init --no-git --no-commit .`
- Delete the default `src/Counter.sol`, `script/Counter.s.sol`, `test/Counter.t.sol`.
- Add a top-level `package.json` with `"workspaces": ["packages/*"]` so Bun/pnpm can resolve sibling packages later.
- Add `.gitignore` entries: `cache/`, `out/`, `broadcast/`, `node_modules/`, `.env`, `lib/`.

**Test:** `cd packages/contracts && forge --version && forge build` exits 0 with no contracts.

**Commit:** `chore(contracts): scaffold foundry package in monorepo`

### Step 0.2 — Configure `foundry.toml`
- Set `solc = "0.8.26"`, `optimizer = true`, `optimizer_runs = 1_000_000`, `via_ir = false` (turn on later only if stack-too-deep hits).
- Add `[rpc_endpoints]` block with `base = "${BASE_MAINNET_RPC}"` and `zg_galileo = "https://evmrpc-testnet.0g.ai"`.
- Add `[profile.default.fuzz] runs = 256` and `[profile.ci.fuzz] runs = 1024`.
- Add `[etherscan] base = { key = "${BASESCAN_API_KEY}", chain = 8453 }`.
- Create `.env.example` documenting `BASE_MAINNET_RPC`, `BASESCAN_API_KEY`, `ZG_GALILEO_PRIVATE_KEY`, `RELAYER_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`.

**Test:** `forge config | grep solc_version` shows `0.8.26`.

**Commit:** `chore(contracts): pin solc 0.8.26 and rpc endpoints`

### Step 0.3 — Install dependencies
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

### Step 0.5 — Fork sanity test
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

### Step 0.6 — Address book
Create `src/lib/Addresses.sol` (a `library` of `address constant`s) for: `PRIORITY_ORDER_REACTOR`, `PERMIT2`, `V4_POOL_MANAGER`, `V4_STATE_VIEW`, `USDC_BASE` (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`), `WETH_BASE` (`0x4200000000000000000000000000000000000006`). Exported as one library so we don't repeat magic addresses.

**Test:** add unit test asserting each constant has nonzero codesize on the fork.

**Commit:** `feat(contracts): central address book for base mainnet anchors`

---

## 1. Shared interfaces and errors

### Step 1.1 — Errors and events module
Create `src/lib/ReckonErrors.sol` and `src/lib/ReckonEvents.sol` — flat files of custom errors and events used cross-contract. Start with placeholders (`error NotRegistered();`, `error ChallengeWindowClosed();`, `event FillRecorded(...)`, etc.). Keeps cross-contract event signatures consistent.

**Test:** `forge build` compiles.

**Commit:** `feat(contracts): shared errors and events modules`

### Step 1.2 — Reckon registrar interface
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

---

## 2. OwnerRegistry (Base)

Smallest contract — relayer-attested cross-chain ownerOf cache. Build first because `RoyaltyDistributor` and `Challenger` both depend on it.

### Step 2.1 — `OwnerRegistry` skeleton with attester role
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

### Step 2.2 — `attestOwner` + `ownerOf` + `freshnessOf`
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

## 3. Subname registrar — test mock now, production deferred

Downstream contracts (`SolverBondVault`, `ReckonValidator`, `Challenger`, `ENSReputationWriter`) all take an `IReckonRegistrar` in their constructor. Their unit tests need *some* implementation of that interface. The production registrar — Durin/Namestone or, failing that, an in-house build — is **deferred until Phase 0 verifies which path is usable** (per spec Risk #5 and the ENS implementation guide). We do not block contract work on that decision.

Instead, we ship a tiny in-test mock and move on.

### Step 3.1 — `MockReckonRegistrar` test fixture
Create `test/mocks/MockReckonRegistrar.sol`. It lives under `test/`, never deploys to a chain. Surface:
- `enum Role { None, Solver, Challenger }`.
- `mint(address user, bytes32 node, Role role)` — public test helper that seeds the owner⇆node mapping (no auth, no real ENS plumbing).
- `setText(bytes32 node, string key, string value)` — open in the mock; production will gate on owner OR reputation writer.
- All `IReckonRegistrar` getters: `namehashOf`, `ownerOfNamehash`, `isRegistered`, `getText`, `isSameOwner`.
- Storage: `mapping(bytes32 => address) ownerOfNode`, `mapping(address => bytes32) nodeOfOwner`, `mapping(bytes32 => mapping(string => string)) texts`.

Constraints to mirror in the mock so tests reflect production semantics:
- `namehashOf(unregistered)` reverts with `ReckonErrors.NotRegistered`.
- One subname per address — second `mint` for the same address reverts.
- `isSameOwner(a, b)` compares `ownerOfNode[a] == ownerOfNode[b]`.

**Test:** `test/mocks/MockReckonRegistrar.t.sol` — mint, namehash round-trip, duplicate-mint revert, text round-trip, `isSameOwner` true/false.

**Commit:** `test(contracts): MockReckonRegistrar for downstream unit tests`

### Step 3.2 — Production registrar (Phase 0 contingency, may never ship)
**Do not write this until Phase 0 verification reports back.** Two outcomes:

1. **Durin or Namestone is usable** → integrate their tooling in Phase 4 directly. The production registrar adapter is a small wrapper around their contracts that exposes the same `IReckonRegistrar` surface. Estimated 2–4 hours, scheduled in Phase 4 alongside the mainnet registrar deploy.
2. **Neither is usable** → write a minimal in-house `ReckonSubnameRegistrar` (~150 LoC) implementing the production semantics: ENSIP-1 `_namehash`, role-scoped parents (`solvers.reckon.eth`, `challengers.reckon.eth`), one subname per address, `setText` gated on owner OR `reputationWriter`. Estimated ~6 hours per spec Risk #5 mitigation.

Whichever path lands, downstream contracts don't change because they only depend on `IReckonRegistrar`. The mock from §3.1 stays in `test/` and continues to drive all unit tests.

**Test:** N/A until Phase 0 outcome is known.

**Commit:** N/A (will be added when path is chosen).

---

## 4. SolverBondVault (Base)

Keyed by namehash, not by address. Holds USDC. Locks during open challenge windows.

### Step 4.1 — Storage and constructor
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

### Step 4.2 — `deposit(amount)` and `requiredBond(node)`
- `deposit(uint256 amount)` — caller must be registered solver; pulls USDC via `transferFrom`; increments `bondedAmount[node]` where `node = registrar.namehashOf(msg.sender)`.
- `requiredBond(bytes32 node) view returns (uint256)` — reads `reckon.reputation` text (parsed as uint, expected 0–1e18 for [0, 1] range), linearly interpolates between `baseBond` (rep=0) and `floorBond` (rep=1e18). On parse failure, defaults to `baseBond`.
- Helper `_parseUint(string memory) internal pure returns (uint256, bool)` — guards against malformed text records.

**Test:**
- `test_deposit_pulls_usdc_and_credits_node`
- `test_deposit_reverts_for_unregistered_caller`
- `test_requiredBond_decays_linearly` (set text record via mock, assert math)
- `test_requiredBond_defaults_when_text_unset`.

**Commit:** `feat(SolverBondVault): deposit and reputation-decayed requiredBond`

### Step 4.3 — `lock`, `unlock`, `slash`
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

---

## 5. EBBOOracle (Base) — fork-only tests

Reads real Uniswap v3 pools from the Base fork. **v4 is deferred** — Phase 0 verification found no Base v4 USDC/WETH pool with material TVL, so the v4 reader is not in MVP scope. Re-evaluate at Phase 4: if a v4 pool enters the top-3 by TVL, add a `_priceFromV4` reader and propose a new pool list via the timelock.

All tests in this section require `--fork-url`.

### Step 5.1 — Pool list registry with timelock
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

### Step 5.2 — V3 spot price reader
Internal helper `_priceFromV3(address pool, address tokenIn, address tokenOut) view returns (uint256 price1e18)`:
- Read `slot0()` for `sqrtPriceX96`.
- Compute price via `FullMath.mulDiv(sqrtPriceX96, sqrtPriceX96, 2**192)` then scale to 1e18.
- Read pool's `token0()` and `token1()`; if `tokenIn == token1`, invert.

**Test:** fork test — pick the canonical USDC/WETH 0.05% v3 pool on Base, assert price is within ~5% of CoinGecko spot at the fork block.

**Commit:** `feat(EBBOOracle): v3 slot0 price reader with token ordering`

### Step 5.3 — Geometric mean
Internal `_geomeanEqualWeighted(uint256[] memory prices1e18) pure returns (uint256)`:
- `prod = product of (price / 1e18)` — but to avoid overflow, accumulate in log-space using PRBMath (`UD60x18`) or fixed-point logarithm. Recommend importing `prb-math` (`forge install PaulRBerg/prb-math`).
- For N=3 with USDC/WETH-scale prices, naïve `nthRoot(prod, N)` overflows; use log-space: `geomean = exp((ln(p1) + ln(p2) + ln(p3)) / N)`.

**Test:**
- `test_geomean_three_equal_inputs_returns_input` (within 1 wei tolerance)
- `test_geomean_known_triple` (e.g., 1e18, 4e18, 9e18 → ~3.30e18, hand-computed).

**Commit:** `feat(EBBOOracle): equal-weighted geomean in log space`

### Step 5.4 — Public `computeBenchmark`
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

### Step 5.5 — Manipulation-resistance test
Fork test that uses `vm.store` or a helper that performs a one-sided swap against one pool to skew its spot, then asserts the benchmark moves by ≤ `1/sqrt(N)` of the skew (NFR-2 invariant).

**Test:** `test_manipulationResistance_singlePool_one_over_sqrt_n` passes.

**Commit:** `test(EBBOOracle): NFR-2 manipulation-resistance bound`

---

## 6. ReckonValidator (Base)

The only contract on the UniswapX integration boundary. Must be `external view`.

### Step 6.1 — Implement `IValidationCallback.validate`
- Constructor: `(IReckonRegistrar registrar)`.
- `validate(address filler, ResolvedOrder calldata order) external view`:
  - `if (!registrar.isRegistered(filler)) revert NotRegistered();`
  - `bytes32 fillerNode = registrar.namehashOf(filler);`
  - Decode `uint16 eboTolerance = abi.decode(order.info.additionalValidationData, (uint16));` — wrapped in a `try`/library to surface a clean revert reason on malformed input.
  - Sanity check: `eboTolerance <= 10_000` (basis points cap at 100%).
  - Returns silently.

**Test:**
- `test_validate_succeeds_for_registered_filler_with_valid_data`
- `test_validate_reverts_unregistered_filler`
- `test_validate_reverts_on_malformed_validationData`
- `test_validate_reverts_on_tolerance_above_10000bps`.

**Commit:** `feat(ReckonValidator): view-only ENS gating per UniswapX spec`

### Step 6.2 — Gas budget assertion
Add `test_validate_under_30k_gas` that wraps the call in `gasleft()` snapshots and asserts < 30_000 (per NFR-1).

**Test:** passes.

**Commit:** `test(ReckonValidator): assert ≤30k gas budget`

---

## 7. FillRegistry (Base)

### Step 7.1 — Storage + permissioned recorder
- `struct FillRecord { bytes32 fillerNamehash; address swapper; uint128 inputAmount; uint128 outputAmount; uint16 eboTolerance; uint64 fillBlock; uint64 challengeDeadline; bool slashed; }`
- `mapping(bytes32 orderHash => FillRecord) public fills;`
- `address public recorder;`
- `uint64 public challengeWindowBlocks = 1800;`
- `event FillRecorded(bytes32 indexed orderHash, bytes32 indexed fillerNamehash, address indexed swapper, uint64 fillBlock);`
- `event FillBatchAnchored(bytes32 indexed rootHash, bytes32 firstOrderHash, bytes32 lastOrderHash);`

**Test:** `test_constructor_sets_recorder`.

**Commit:** `feat(FillRegistry): storage and recorder role`

### Step 7.2 — `recordFill` with multi-output rejection
- `recordFill(bytes32 orderHash, address filler, address swapper, uint128 inputAmount, uint128 outputAmount, uint16 eboTolerance, uint8 outputsLength, uint64 fillBlock) external`:
  - `require(msg.sender == recorder);`
  - `require(outputsLength == 1, MultiOutputUnsupported());`
  - `require(fills[orderHash].fillBlock == 0, AlreadyRecorded());` (idempotency)
  - `bytes32 node = registrar.namehashOf(filler);`
  - Compute `challengeDeadline = fillBlock + challengeWindowBlocks`.
  - Write record, emit event.
  - Call `solverBondVault.lock(node, requiredBondForFill)` — bond locked = current `requiredBond(node)` (or a per-fill cap; spec says full bond is locked while window open, so we sum).

**Note:** locking-on-fill is the cleanest way to honor "bond locked while challenge windows are open against any of the solver's recent fills" (FR-1). Consider per-fill counter rather than per-fill amount: maintain `mapping(node => uint256) openFillCount` and lock the full `requiredBond` while count > 0. Pick whichever is simpler — recommend the counter.

**Test:**
- `test_recordFill_only_recorder`
- `test_recordFill_rejects_multi_output`
- `test_recordFill_rejects_duplicate_orderHash`
- `test_recordFill_locks_solver_bond`.

**Commit:** `feat(FillRegistry): recordFill with multi-output rejection and bond lock`

### Step 7.3 — `anchorBatch` for 0G Storage Log
- `anchorBatch(bytes32 rootHash, bytes32 firstOrderHash, bytes32 lastOrderHash) external` — only recorder; emits `FillBatchAnchored`.

**Test:** `test_anchorBatch_emits_event`.

**Commit:** `feat(FillRegistry): anchorBatch for 0G Storage Log roots`

### Step 7.4 — Read helpers for Challenger
- `getFill(bytes32 orderHash) external view returns (FillRecord memory)`.
- `markSlashed(bytes32 orderHash) external` — only `challenger` contract; sets `slashed = true`. Used by Challenger to prevent double-slash.

**Test:** `test_markSlashed_only_challenger`.

**Commit:** `feat(FillRegistry): getFill + markSlashed`

---

## 8. ENSReputationWriter (Base)

### Step 8.1 — Skeleton + role
- `IReckonRegistrar public immutable registrar;`
- `address public flusher;` (KeeperHub schedule workflow's wallet; can rotate).
- `struct PendingDelta { int128 reputationDelta; uint64 lastSlashAt; uint32 fillCountDelta; uint32 slashCountDelta; }`
- `mapping(bytes32 node => PendingDelta) internal _pending;`
- Constructor takes registrar + initial flusher.

**Test:** `test_constructor`, `test_rotateFlusher_only_owner`.

**Commit:** `feat(ENSReputationWriter): pending-delta storage and flusher role`

### Step 8.2 — `incrementOnCleanFill` and `decrementOnSlash`
- Called by Challenger and FillRegistry respectively (via permissioned setter `setReporter(address)` so we don't hard-code).
- Mutate `_pending[node]`.

**Test:** `test_incrementOnCleanFill_only_reporter`, `test_decrementOnSlash_writes_pending_negative`.

**Commit:** `feat(ENSReputationWriter): incrementOnCleanFill / decrementOnSlash`

### Step 8.3 — `flushReputation(bytes32[] nodes)`
- `flushReputation(bytes32[] calldata nodes) external` — only flusher.
- For each node: read current `reckon.reputation` via `registrar.getText`, parse, apply delta with floor at 0 and cap at 1e18, write back via `registrar.setText`. Update `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`. Clear `_pending[node]`.
- Emit `ReputationFlushed(node, newReputation)`.

**Test:**
- `test_flushReputation_writes_text_records` (mock registrar)
- `test_flushReputation_floors_at_zero`
- `test_flushReputation_caps_at_1e18`
- `test_flushReputation_clears_pending`.

**Commit:** `feat(ENSReputationWriter): flushReputation with floor/cap`

### Step 8.4 — Gas amortization test
Add `test_flushReputation_avg_gas_under_60k(uint8 batchSize)` fuzzing batch size; assert `gasUsed / batchSize < 60_000` per NFR-1.

**Test:** passes for batches of 5–50.

**Commit:** `test(ENSReputationWriter): amortized gas under 60k per agent`

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
- Wires: `FillRegistry`, `EBBOOracle`, `SolverBondVault`, `RoyaltyDistributor`, `ENSReputationWriter`, `OwnerRegistry`, `IReckonRegistrar`, `IPermit2`, `IERC20 usdc`.
- `uint16 public minChallengerBondBps = 1000;` (10% of solver bond).
- `event ChallengeSubmitted(bytes32 indexed orderHash, bytes32 indexed challengerNode, uint256 agentTokenId, uint256 challengerBond);`
- `event ChallengeSucceeded(bytes32 indexed orderHash, uint256 slashAmount);`
- `event ChallengeFailed(bytes32 indexed orderHash, address challenger);`

**Test:** `test_constructor_wires_all_deps`.

**Commit:** `feat(Challenger): storage and dependency wiring`

### Step 10.2 — Pre-flight checks (no math yet)
Implement `_preflight(bytes32 orderHash, address challengerEoa, uint256 agentTokenId)` internal:
- `FillRecord memory r = fills.getFill(orderHash); require(r.fillBlock != 0, FillNotFound());`
- `require(!r.slashed, AlreadySlashed());`
- `require(block.number <= r.challengeDeadline, ChallengeWindowClosed());`
- `bytes32 challengerNode = registrar.namehashOf(challengerEoa);`
- `require(!registrar.isSameOwner(challengerNode, r.fillerNamehash), SelfChallengeForbidden());` — using the registrar helper from Step 3.4 (compare owner addresses, since one address ⇒ one subname).
- `require(ownerRegistry.ownerOf(agentTokenId) == challengerEoa, NotAgentOwner());`

**Test:** unit tests cover each revert path with mocks.

**Commit:** `feat(Challenger): preflight checks (deadline, self-challenge, agent ownership)`

### Step 10.3 — Permit2 bond pull
- `_pullBond(uint256 amount, IPermit2.SignatureTransferDetails calldata transferDetails, address challengerEoa, IPermit2.PermitTransferFrom calldata permit, bytes calldata signature)` internal.
- Call `permit2.permitTransferFrom(permit, transferDetails, challengerEoa, signature);` — pulls USDC from challenger's EOA into this contract.
- Validate `transferDetails.to == address(this)` and `transferDetails.requestedAmount == amount`.

**Test:** fork test — use a funded test EOA, sign a Permit2 transfer with `MessageHashUtils` + `vm.sign`, assert USDC moves.

**Commit:** `feat(Challenger): permit2 bond pull with signature validation`

### Step 10.4 — `submit` happy path (success branch)
- Public `submit(bytes32 orderHash, uint256 challengerBond, address beneficiary, uint256 agentTokenId, IPermit2.PermitTransferFrom calldata permit, bytes calldata signature) external`:
  - `_preflight(...)`
  - Validate `challengerBond >= solverBondVault.bondedAmount(r.fillerNamehash) * minChallengerBondBps / 10_000`.
  - `_pullBond(...)`
  - Compute benchmark: `uint256 benchmark = ebbo.computeBenchmark(tokenIn, tokenOut);` (need `tokenIn`, `tokenOut` — store them in `FillRecord` in Step 7.1; if missing, **go back and add** before continuing).
  - Compute `expectedOutput = benchmark * inputAmount / 1e18 * (10_000 - r.eboTolerance) / 10_000`.
  - **If `r.outputAmount < expectedOutput`:** challenge succeeds.
    - `slashAmount = min(solverBondVault.bondedAmount(r.fillerNamehash), expectedOutput - r.outputAmount)`
    - `solverBondVault.slash(r.fillerNamehash, slashAmount, address(royalty));`
    - `royalty.distribute(slashAmount, agentTokenId, r.swapper);`
    - Return challenger bond.
    - `fills.markSlashed(orderHash);`
    - `repWriter.decrementOnSlash(r.fillerNamehash);`
    - Emit `ChallengeSucceeded`.

**Note:** if `FillRecord` doesn't already store `tokenIn`/`tokenOut`, this is the moment to add them — go back to Step 7.1 and amend, then re-run those tests.

**Test:** integration test (mock EBBO oracle returning a benchmark that puts `actualOutput < expectedOutput`); assert slash + royalty + reputation decrement all fire.

**Commit:** `feat(Challenger): submit success branch — slash, distribute, decrement`

### Step 10.5 — `submit` failure branch (challenger loses bond)
Else branch when `actualOutput >= expectedOutput`:
- Challenger bond stays in this contract (or transfer to protocol treasury — pick treasury for clarity).
- `repWriter.incrementOnCleanFill(r.fillerNamehash)` — solver gets a tick of credit.
- Emit `ChallengeFailed`.

**Test:** integration test asserting bond moves to treasury and solver reputation increments.

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

## 12. Bootstrap and deploy scripts

### Step 12.1 — `BootstrapAnvilFork.s.sol`
- One Forge script that:
  - Selects fork (`vm.createSelectFork(vm.rpcUrl("base"))`).
  - Deploys: `ReckonSubnameRegistrar`, `OwnerRegistry`, `EBBOOracle` (with the 3 canonical USDC/WETH pools committed), `SolverBondVault`, `FillRegistry`, `ENSReputationWriter`, `RoyaltyDistributor`, `ReckonValidator`, `Challenger`.
  - Wires post-deploy setters: `vault.setChallenger(challenger)`, `fillRegistry.setChallenger(challenger)`, `repWriter.setReporter(challenger)`, etc.
  - Registers a baseline set of test solvers + challengers (subnames) and funds them with USDC via `deal()`.
  - Deposits a baseline solver bond.
  - Writes deployed addresses to `deployments/anvil-fork.json`.

**Test:** `forge script BootstrapAnvilFork --rpc-url anvil --broadcast` succeeds end-to-end on a fresh Anvil fork; addresses JSON is generated; a follow-up `forge script` reads addresses and asserts `solverBondVault.bondedAmount(...)` is nonzero.

**Commit:** `feat(scripts): BootstrapAnvilFork end-to-end deploy + seed`

### Step 12.2 — `DeployBaseMainnet.s.sol`
- Same as above but no `deal()`, no subname seeding (those happen on real ENS L2 registrar by humans), and reads constructor args from a `mainnet.toml` config file.
- Verifies on Basescan via `--verify`.

**Test:** dry-run with `--rpc-url base --simulate`; commit the simulation transcript to `docs/deployment-dry-run.md`.

**Commit:** `feat(scripts): DeployBaseMainnet with basescan verification`

### Step 12.3 — `DeployZGGalileo.s.sol`
- Deploys only `ChallengerNFT` to 0G Galileo via `--rpc-url zg_galileo`.

**Test:** dry-run; commit the simulation transcript.

**Commit:** `feat(scripts): DeployZGGalileo for ChallengerNFT`

---

## 13. End-to-end integration test

### Step 13.1 — Full happy path on fork
`test/E2E.t.sol::test_HappyPath_BadFill_GetsSlashed`:
- Run `BootstrapAnvilFork`-equivalent setup in `setUp()`.
- Simulate a UniswapX `Fill` event (we don't actually run the reactor — instead we have the test impersonate the indexer's recorder EOA via `vm.prank` and call `FillRegistry.recordFill` with an `outputAmount` that's clearly below benchmark).
- Submit a challenge via `Challenger.submit` (using a Permit2 signature signed in test setup).
- Assert: solver bond decremented; royalty distributed in 60/30/10; FillRecord marked slashed; reputation pending delta is negative; no double-slash possible (second `submit` reverts).

**Test:** passes against fork.

**Commit:** `test(e2e): bad fill triggers slash + royalty + reputation decrement`

### Step 13.2 — Full failure path
`test_HappyPath_GoodFill_ChallengeFails`:
- Same setup but `outputAmount` matches benchmark within tolerance.
- `Challenger.submit` enters failure branch; challenger loses bond; solver reputation pending delta is positive.

**Test:** passes.

**Commit:** `test(e2e): good fill rejects challenge, challenger forfeits bond`

### Step 13.3 — Adversarial scenarios
Add tests for:
- Challenge after deadline.
- Self-challenge attempt (filler tries to challenge own fill).
- Challenger without subname.
- Multi-output fill is rejected at indexer boundary (`FillRegistry.recordFill` reverts).
- iNFT transferred mid-challenge → `OwnerRegistry` stale → royalty queued; `claimQueued` works after re-attest.
- Concurrent N=20 challenges in same block (use `vm.roll`/parallel calls); assert no double-slash.

**Test:** all pass.

**Commit:** `test(e2e): adversarial scenarios per NFR-2`

### Step 13.4 — Gas budget regression
Aggregate gas snapshot test (`forge snapshot --check`) committed as `.gas-snapshot`. CI fails on regression.

**Test:** initial snapshot generation, then re-run gates.

**Commit:** `test(gas): commit baseline gas snapshot`

---

## 14. Static analysis and polish

### Step 14.1 — Slither
- Add `slither.config.json` with detectors disabled for `naming-convention`, `solc-version` (we pin intentionally).
- Add `make slither` target.
- Fix all HIGH and MEDIUM findings; document INFO/LOW dismissals in `docs/slither-dismissals.md`.

**Test:** `slither . --config-file slither.config.json` produces no HIGH/MEDIUM.

**Commit:** `chore: slither pass — clean HIGH/MEDIUM`

### Step 14.2 — NatSpec on every public function
Pass over each contract; add `@notice`, `@param`, `@return` on externals.

**Test:** `forge doc --build` succeeds; eyeball spot-check generated docs.

**Commit:** `docs: full natspec on public surface`

### Step 14.3 — Mythril smoke
Run `myth analyze src/Challenger.sol --solv 0.8.26 -t 3` (and `RoyaltyDistributor`, `SolverBondVault`). Address findings or document accepted risks.

**Test:** mythril output committed under `docs/mythril/`.

**Commit:** `chore: mythril smoke on critical contracts`

---

## 15. Milestone gates

After each phase milestone, do **not** continue until the gate is green:

- **End of §0–§1:** fork sanity green, CI green, registrar interface compiles.
- **End of §2–§4:** `OwnerRegistry`, `SubnameRegistrar`, `SolverBondVault` all at ≥80% line coverage.
- **End of §5–§6:** `EBBOOracle` matches v3 spot within 0.5% on real fork; Validator under 30k gas.
- **End of §7–§9:** `FillRegistry` rejects multi-output; `ENSReputationWriter` flush amortizes under 60k; `RoyaltyDistributor` queues stale payouts.
- **End of §10:** Challenger submit ≤ 280k gas; both branches (success/failure) tested.
- **End of §11:** ChallengerNFT mints + transfers via mock oracle; Transfer topic pinned.
- **End of §12–§13:** `BootstrapAnvilFork.s.sol` runs cleanly on fresh Anvil; full E2E scenarios green.
- **End of §14:** Slither/Mythril clean; NatSpec complete.

If a milestone slips by more than half a day, raise it in the daily standup and decide whether to descope (per spec §"Out of scope" and §"Scoping note for in-person 72-hour format").

---

## 16. Open items the spec doesn't pin

Flag these to Builder A / Builder B during Phase 0:

1. **`FillRecord.tokenIn`/`tokenOut` fields:** the spec implies the indexer captures these but doesn't show them on the struct; Step 10.4 needs them. Add in Step 7.1.
2. **Per-fill bond lock vs counter-based lock:** spec says "bond is locked while challenge windows are open against any of the solver's recent fills" — counter-based is simpler; confirm with Builder A.
3. **Challenger bond recipient on failure:** spec doesn't specify. Recommendation: protocol treasury (parallels the 10% protocol cut).
4. **EBBOOracle pool list source of truth:** spec says "TBD in Phase 0." Look up actual top-3 USDC/WETH Base pools by TVL on Day 1.
5. **`reckon.reputation` text record encoding:** decimal 0–1e18 string vs basis points. Pick decimal-string of an `uint256` in [0, 1e18] for parity with on-chain math.
6. **Durin vs in-house registrar:** Step 3 ships a minimal in-house registrar. If Phase 0 confirms Durin works, swap implementations behind `IReckonRegistrar` in Phase 4 — the rest of the contract suite shouldn't change.
7. **Permit2 nonce strategy:** spec doesn't pin nonce ranges per challenger; recommend documenting that each challenger agent owns a nonce range exclusive to its `agentTokenId`.
8. **0G Galileo deployment of `ChallengerNFT`:** the reference's mock oracle setup; verify exactly what addresses get baked into the constructor before Phase 4.
