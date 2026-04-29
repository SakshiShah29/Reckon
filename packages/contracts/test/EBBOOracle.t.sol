// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EBBOOracle} from "../src/EBBOOracle.sol";
import {IUniswapV3Pool} from "v3-core/interfaces/IUniswapV3Pool.sol";
import {ReckonErrors} from "../src/lib/ReckonErrors.sol";
import {ReckonEvents} from "../src/lib/ReckonEvents.sol";
import {Addresses} from "../src/lib/Addresses.sol";

contract EBBOOracleTest is Test {
    EBBOOracle internal oracle;
    address internal admin = makeAddr("admin");
    address internal stranger = makeAddr("stranger");

    address constant POOL_A = 0x6c561B446416E1A00E8E93E221854d6eA4171372;
    address constant POOL_B = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
    address constant POOL_C = 0x0b1C2DCbBfA744ebD3fC17fF1A96A1E1Eb4B2d69;

    function setUp() public {
        oracle = new EBBOOracle(admin, address(0), address(0), new EBBOOracle.PoolRef[](0));
    }

    function _threePools() internal pure returns (EBBOOracle.PoolRef[] memory pools) {
        pools = new EBBOOracle.PoolRef[](3);
        pools[0] = EBBOOracle.PoolRef({pool: POOL_A});
        pools[1] = EBBOOracle.PoolRef({pool: POOL_B});
        pools[2] = EBBOOracle.PoolRef({pool: POOL_C});
    }

    // -- pairKey ordering --

    function test_pairKey_is_order_independent() public view {
        bytes32 a = oracle.pairKey(Addresses.USDC_BASE, Addresses.WETH_BASE);
        bytes32 b = oracle.pairKey(Addresses.WETH_BASE, Addresses.USDC_BASE);
        assertEq(a, b);
    }

    // -- proposePoolList --

    function test_proposePoolList_only_owner() public {
        EBBOOracle.PoolRef[] memory pools = _threePools();
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, pools);
    }

    function test_proposePoolList_reverts_on_empty() public {
        EBBOOracle.PoolRef[] memory pools = new EBBOOracle.PoolRef[](0);
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.InsufficientPools.selector);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, pools);
    }

    function test_proposePoolList_reverts_on_zero_pool() public {
        EBBOOracle.PoolRef[] memory pools = new EBBOOracle.PoolRef[](2);
        pools[0] = EBBOOracle.PoolRef({pool: POOL_A});
        pools[1] = EBBOOracle.PoolRef({pool: address(0)});
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.ZeroAddress.selector);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, pools);
    }

    function test_proposePoolList_writes_pending_with_eta() public {
        vm.warp(1_700_000_000);
        bytes32 key = oracle.pairKey(Addresses.USDC_BASE, Addresses.WETH_BASE);

        vm.expectEmit(true, false, false, true, address(oracle));
        emit ReckonEvents.PoolListProposed(key, uint64(block.timestamp) + 48 hours);

        vm.prank(admin);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, _threePools());

        (EBBOOracle.PoolRef[] memory pools, uint64 eta) = oracle.pendingFor(Addresses.USDC_BASE, Addresses.WETH_BASE);
        assertEq(pools.length, 3);
        assertEq(pools[0].pool, POOL_A);
        assertEq(eta, uint64(block.timestamp) + 48 hours);
    }

    function test_proposePoolList_overwrites_prior_pending() public {
        vm.startPrank(admin);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, _threePools());

        EBBOOracle.PoolRef[] memory pools2 = new EBBOOracle.PoolRef[](1);
        pools2[0] = EBBOOracle.PoolRef({pool: POOL_A});
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, pools2);
        vm.stopPrank();

        (EBBOOracle.PoolRef[] memory got,) = oracle.pendingFor(Addresses.USDC_BASE, Addresses.WETH_BASE);
        assertEq(got.length, 1);
        assertEq(got[0].pool, POOL_A);
    }

    // -- commitPoolList --

    function test_commitPoolList_only_owner() public {
        vm.prank(admin);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, _threePools());

        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        oracle.commitPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);
    }

    function test_commit_reverts_before_eta() public {
        vm.prank(admin);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, _threePools());

        vm.warp(block.timestamp + 48 hours - 1);
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.TimelockNotElapsed.selector);
        oracle.commitPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);
    }

    function test_commit_reverts_when_no_pending() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.NoPendingProposal.selector);
        oracle.commitPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);
    }

    function test_propose_then_commit_after_eta() public {
        vm.warp(1_700_000_000);
        vm.prank(admin);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, _threePools());

        vm.warp(block.timestamp + 48 hours);

        bytes32 key = oracle.pairKey(Addresses.USDC_BASE, Addresses.WETH_BASE);
        vm.expectEmit(true, false, false, false, address(oracle));
        emit ReckonEvents.PoolListCommitted(key);
        vm.prank(admin);
        oracle.commitPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);

        EBBOOracle.PoolRef[] memory active = oracle.poolsForPair(Addresses.USDC_BASE, Addresses.WETH_BASE);
        assertEq(active.length, 3);
        assertEq(active[0].pool, POOL_A);
        assertEq(active[1].pool, POOL_B);
        assertEq(active[2].pool, POOL_C);

        // pending cleared
        (EBBOOracle.PoolRef[] memory pending, uint64 eta) =
            oracle.pendingFor(Addresses.USDC_BASE, Addresses.WETH_BASE);
        assertEq(pending.length, 0);
        assertEq(eta, 0);
    }

    function test_commit_replaces_active_list() public {
        vm.warp(1_700_000_000);
        vm.startPrank(admin);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, _threePools());
        vm.warp(block.timestamp + 48 hours);
        oracle.commitPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);

        EBBOOracle.PoolRef[] memory pools2 = new EBBOOracle.PoolRef[](1);
        pools2[0] = EBBOOracle.PoolRef({pool: POOL_B});
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, pools2);
        vm.warp(block.timestamp + 48 hours);
        oracle.commitPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);
        vm.stopPrank();

        EBBOOracle.PoolRef[] memory active = oracle.poolsForPair(Addresses.USDC_BASE, Addresses.WETH_BASE);
        assertEq(active.length, 1);
        assertEq(active[0].pool, POOL_B);
    }

    // -- cancelPoolList --

    function test_cancelPoolList_only_owner() public {
        vm.prank(admin);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, _threePools());

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        oracle.cancelPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);
    }

    function test_cancelPoolList_reverts_when_no_pending() public {
        vm.prank(admin);
        vm.expectRevert(ReckonErrors.NoPendingProposal.selector);
        oracle.cancelPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);
    }

    function test_cancel_clears_pending() public {
        vm.prank(admin);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, _threePools());

        bytes32 key = oracle.pairKey(Addresses.USDC_BASE, Addresses.WETH_BASE);
        vm.expectEmit(true, false, false, false, address(oracle));
        emit ReckonEvents.PoolListCancelled(key);
        vm.prank(admin);
        oracle.cancelPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);

        (EBBOOracle.PoolRef[] memory pending, uint64 eta) =
            oracle.pendingFor(Addresses.USDC_BASE, Addresses.WETH_BASE);
        assertEq(pending.length, 0);
        assertEq(eta, 0);
    }

    function test_cancel_does_not_affect_active_list() public {
        vm.warp(1_700_000_000);
        vm.startPrank(admin);
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, _threePools());
        vm.warp(block.timestamp + 48 hours);
        oracle.commitPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);

        EBBOOracle.PoolRef[] memory pools2 = new EBBOOracle.PoolRef[](1);
        pools2[0] = EBBOOracle.PoolRef({pool: POOL_B});
        oracle.proposePoolList(Addresses.USDC_BASE, Addresses.WETH_BASE, pools2);
        oracle.cancelPoolList(Addresses.USDC_BASE, Addresses.WETH_BASE);
        vm.stopPrank();

        EBBOOracle.PoolRef[] memory active = oracle.poolsForPair(Addresses.USDC_BASE, Addresses.WETH_BASE);
        assertEq(active.length, 3);
    }
}

contract EBBOOracleBenchmarkForkTest is Test {
    EBBOOracle internal oracle;
    address internal admin = makeAddr("admin");

    address constant POOL_030 = 0x6c561B446416E1A00E8E93E221854d6eA4171372;
    address constant POOL_005 = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
    address constant POOL_100 = 0x0b1C2DCbBfA744ebD3fC17fF1A96A1E1Eb4B2d69;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("base"));
        oracle = new EBBOOracle(admin, Addresses.WETH_BASE, Addresses.USDC_BASE, _canonicalPools());
    }

    function _canonicalPools() internal pure returns (EBBOOracle.PoolRef[] memory pools) {
        pools = new EBBOOracle.PoolRef[](3);
        pools[0] = EBBOOracle.PoolRef({pool: POOL_030});
        pools[1] = EBBOOracle.PoolRef({pool: POOL_005});
        pools[2] = EBBOOracle.PoolRef({pool: POOL_100});
    }

    function test_computeBenchmark_in_expected_band_weth_to_usdc() public {
        uint256 benchmark = oracle.computeBenchmark(Addresses.WETH_BASE, Addresses.USDC_BASE);
        assertGe(benchmark, 1e9);
        assertLe(benchmark, 4e9);
    }

    function test_computeBenchmark_in_expected_band_usdc_to_weth() public {

        uint256 benchmark = oracle.computeBenchmark(Addresses.USDC_BASE, Addresses.WETH_BASE);
        assertGe(benchmark, 25e25);
        assertLe(benchmark, 1e27);
    }

    function test_computeBenchmark_directions_are_reciprocal() public {

        uint256 fwd = oracle.computeBenchmark(Addresses.WETH_BASE, Addresses.USDC_BASE);
        uint256 rev = oracle.computeBenchmark(Addresses.USDC_BASE, Addresses.WETH_BASE);
        uint256 product = (fwd * rev) / 1e18;
        assertGt(product, 1e18 - 1e15);
        assertLt(product, 1e18 + 1e15);
    }

    function test_computeBenchmark_within_half_pct_of_deepest_pool() public {

        uint256 benchmark = oracle.computeBenchmark(Addresses.WETH_BASE, Addresses.USDC_BASE);

        EBBOOracleHarness harness = new EBBOOracleHarness(admin);
        uint256 spot = harness.exposed_priceFromV3(POOL_005, Addresses.WETH_BASE, Addresses.USDC_BASE);

        uint256 diff = benchmark > spot ? benchmark - spot : spot - benchmark;
        assertLt(diff * 1000, spot * 5);
    }

    function test_computeBenchmark_reverts_on_unregistered_pair() public {
        vm.expectRevert(ReckonErrors.InsufficientPools.selector);
        oracle.computeBenchmark(address(0xdead), address(0xbeef));
    }

    function test_computeBenchmark_reverts_on_too_few_pools() public {
        EBBOOracle.PoolRef[] memory pools = new EBBOOracle.PoolRef[](2);
        pools[0] = EBBOOracle.PoolRef({pool: POOL_005});
        pools[1] = EBBOOracle.PoolRef({pool: POOL_030});
        vm.startPrank(admin);
        oracle.proposePoolList(Addresses.WETH_BASE, Addresses.USDC_BASE, pools);
        vm.warp(block.timestamp + 48 hours);
        oracle.commitPoolList(Addresses.WETH_BASE, Addresses.USDC_BASE);
        vm.stopPrank();

        vm.expectRevert(ReckonErrors.InsufficientPools.selector);
        oracle.computeBenchmark(Addresses.WETH_BASE, Addresses.USDC_BASE);
    }
}

/// @notice Test-only subclass exposing internal helpers as a reference for the
///         "within 0.5% of deepest pool" check.
contract EBBOOracleHarness is EBBOOracle {
    constructor(address initialOwner) EBBOOracle(initialOwner, address(0), address(0), new PoolRef[](0)) {}

    function exposed_priceFromV3(address pool, address tokenIn, address tokenOut) external view returns (uint256) {
        return _priceFromV3(pool, tokenIn, tokenOut);
    }
}

contract EBBOOracleManipulationForkTest is Test {
    EBBOOracle internal oracle;
    address internal admin = makeAddr("admin");

    address constant POOL_030 = 0x6c561B446416E1A00E8E93E221854d6eA4171372;
    address constant POOL_005 = 0xd0b53D9277642d899DF5C87A3966A349A798F224;
    address constant POOL_100 = 0x0b1C2DCbBfA744ebD3fC17fF1A96A1E1Eb4B2d69;

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("base"));

        EBBOOracle.PoolRef[] memory pools = new EBBOOracle.PoolRef[](3);
        pools[0] = EBBOOracle.PoolRef({pool: POOL_030});
        pools[1] = EBBOOracle.PoolRef({pool: POOL_005});
        pools[2] = EBBOOracle.PoolRef({pool: POOL_100});

        oracle = new EBBOOracle(admin, Addresses.WETH_BASE, Addresses.USDC_BASE, pools);
    }

    /// @dev Overwrite the lower 160 bits of slot0 (sqrtPriceX96) on a v3 pool.
    ///      Uniswap v3 stores Slot0 in storage slot 0, packed: low 160 bits =
    ///      sqrtPriceX96, then tick (24), then observation/protocol fields. We
    ///      preserve the upper 96 bits and replace the lower 160.
    function _setSqrtPriceX96(address pool, uint160 newSqrtPrice) internal {
        bytes32 current = vm.load(pool, bytes32(uint256(0)));
        uint256 mask = (uint256(1) << 160) - 1;
        uint256 reassembled = (uint256(current) & ~mask) | uint256(newSqrtPrice);
        vm.store(pool, bytes32(uint256(0)), bytes32(reassembled));
    }

    /// @notice NFR-2 invariant: a one-sided manipulation of a single pool moves
    ///         the equal-weighted geomean benchmark by at most `1/sqrt(N)` times
    ///         the pool's own move. With N=3, that bound is ~0.577.
    /// @dev We double sqrtPriceX96 of POOL_100 → its reported price quadruples
    ///      (price ∝ sqrtPrice²). Benchmark should move by far less.
    function test_manipulationResistance_singlePool_one_over_sqrt_n() public {
        uint256 benchmarkBefore =
            oracle.computeBenchmark(Addresses.WETH_BASE, Addresses.USDC_BASE);

        // Read POOL_100's current sqrtPriceX96, double it
        (uint160 sqrtBefore,,,,,,) = IUniswapV3Pool(POOL_100).slot0();
        uint160 sqrtAfter = sqrtBefore * 2;
        _setSqrtPriceX96(POOL_100, sqrtAfter);

        // Confirm the pool's spot quadrupled
        (uint160 sqrtNow,,,,,,) = IUniswapV3Pool(POOL_100).slot0();
        assertEq(sqrtNow, sqrtAfter);

        uint256 benchmarkAfter =
            oracle.computeBenchmark(Addresses.WETH_BASE, Addresses.USDC_BASE);

        // Pool moved by factor 4x → +300% change in pool spot.
        // Benchmark for N=3 geomean moves by factor 4^(1/3) ≈ 1.587 → ~58.7%.
        // Bound from NFR-2: benchmarkChange ≤ poolChange / sqrt(N) ≈ 300/1.732 ≈ 173%.
        // Actual <<< bound; we assert the looser spec-stated bound to be safe.
        uint256 benchmarkChangeBps =
            ((benchmarkAfter - benchmarkBefore) * 10_000) / benchmarkBefore;
        uint256 poolChangeBps = 30_000; // 300%
        // sqrt(3) * 10_000 ≈ 17_320. Bound: benchmarkChangeBps * 17_320 ≤ poolChangeBps * 10_000.
        assertLt(benchmarkChangeBps * 17_320, poolChangeBps * 10_000);
    }

    /// @dev Tighter check matching the geomean's actual ~1/N behavior:
    ///      for a pool 4x move, benchmark should move ≤ 4^(1/3) - 1 ≈ 58.7% +
    ///      a small slack for ln/exp rounding.
    function test_manipulationResistance_geomean_one_over_n_actual() public {
        uint256 before_ = oracle.computeBenchmark(Addresses.WETH_BASE, Addresses.USDC_BASE);
        (uint160 sqrtBefore,,,,,,) = IUniswapV3Pool(POOL_100).slot0();
        _setSqrtPriceX96(POOL_100, sqrtBefore * 2);
        uint256 after_ = oracle.computeBenchmark(Addresses.WETH_BASE, Addresses.USDC_BASE);

        uint256 changeBps = ((after_ - before_) * 10_000) / before_;
        // 4^(1/3) - 1 ≈ 0.5874 → 5874 bps. Allow 100 bps slack for PRBMath rounding.
        assertLt(changeBps, 5_974);
    }
}

