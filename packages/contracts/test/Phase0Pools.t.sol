// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {IUniswapV3Pool} from "v3-core/interfaces/IUniswapV3Pool.sol";
import {Addresses} from "../src/lib/Addresses.sol";

/// @title Phase0Pools
/// @notice One-shot verification of the candidate USDC/WETH v3 pool list on Base.
///         For each pool: confirms token0/token1 are USDC+WETH (any ordering),
///         that slot0() returns a non-zero sqrtPriceX96, and prints fee + liquidity
///         so the human can sanity-check TVL ranking against Uniswap analytics.
contract Phase0PoolsTest is Test {
    address[3] internal POOLS = [
        0x6c561B446416E1A00E8E93E221854d6eA4171372,
        0xd0b53D9277642d899DF5C87A3966A349A798F224,
        0x0b1C2DCbBfA744ebD3fC17fF1A96A1E1Eb4B2d69
    ];

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("base"));
    }

    function test_AllPoolsAreUsdcWethAndQueryable() public {
        address USDC = Addresses.USDC_BASE;
        address WETH = Addresses.WETH_BASE;

        for (uint256 i; i < POOLS.length; ++i) {
            IUniswapV3Pool pool = IUniswapV3Pool(POOLS[i]);
            address t0 = pool.token0();
            address t1 = pool.token1();
            uint24 fee = pool.fee();
            uint128 liquidity = pool.liquidity();
            (uint160 sqrtPriceX96,,,,,,) = pool.slot0();

            console_log(i, address(pool), t0, t1, fee, liquidity, sqrtPriceX96);

            // pair must be USDC/WETH in either ordering
            bool match0 = (t0 == USDC && t1 == WETH) || (t0 == WETH && t1 == USDC);
            assertTrue(match0, "pool is not USDC/WETH");
            assertGt(sqrtPriceX96, 0, "slot0 sqrtPriceX96 is zero");
            assertGt(liquidity, 0, "pool has zero in-range liquidity");
        }
    }

    function console_log(
        uint256 i,
        address pool,
        address t0,
        address t1,
        uint24 fee,
        uint128 liquidity,
        uint160 sqrtPriceX96
    ) internal {
        // forge-std console emits to stdout under -vv
        // (kept as a separate function to keep the test body readable)
        // solhint-disable-next-line no-console
        emit log_named_uint("pool index", i);
        emit log_named_address("pool", pool);
        emit log_named_address("token0", t0);
        emit log_named_address("token1", t1);
        emit log_named_uint("fee (1e6 bps)", fee);
        emit log_named_uint("liquidity (in-range)", liquidity);
        emit log_named_uint("sqrtPriceX96", sqrtPriceX96);
    }
}
