// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable} from "@openzeppelin/access/Ownable.sol";
import {Math} from "@openzeppelin/utils/math/Math.sol";
import {IUniswapV3Pool} from "v3-core/interfaces/IUniswapV3Pool.sol";
import {SD59x18, sd, convert} from "prb-math/SD59x18.sol";
import {ReckonErrors} from "./lib/ReckonErrors.sol";
import {ReckonEvents} from "./lib/ReckonEvents.sol";

/// @title EBBOOracle
/// @notice Equal-weighted geometric-mean benchmark across the canonical v3 pools
///         for a token pair on Base. Pool list updates pass through a 48-hour
///         timelock to prevent live attacks.
/// @dev v4 reader is deferred (no material Base v4 USDC/WETH TVL at Phase 0); the
///      `PoolRef` struct keeps a single `pool` field today and grows when v4 ships.
contract EBBOOracle is Ownable {
    uint64 public constant TIMELOCK_DELAY = 48 hours;

    struct PoolRef {
        address pool;
    }

    struct PendingProposal {
        PoolRef[] pools;
        uint64 eta;
    }

    /// @dev keyed by `_pairKey(tokenA, tokenB)` — sorted-token pair hash.
    mapping(bytes32 pairKey => PoolRef[]) internal _poolsForPair;
    mapping(bytes32 pairKey => PendingProposal) internal _pending;

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Sorted-pair key — order-independent.
    function pairKey(address tokenA, address tokenB) public pure returns (bytes32) {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encode(t0, t1));
    }

    /// @notice Read the active pool list for a pair. Empty array if unset.
    function poolsForPair(address tokenA, address tokenB) external view returns (PoolRef[] memory) {
        return _poolsForPair[pairKey(tokenA, tokenB)];
    }

    /// @notice Read the pending proposal for a pair (if any).
    function pendingFor(address tokenA, address tokenB) external view returns (PoolRef[] memory pools, uint64 eta) {
        PendingProposal storage p = _pending[pairKey(tokenA, tokenB)];
        return (p.pools, p.eta);
    }

    /// @notice Propose a new pool list for a pair. Owner only. ETA = now + 48h.
    /// @dev Overwrites any prior pending proposal for the same pair.
    function proposePoolList(address tokenA, address tokenB, PoolRef[] calldata pools) external onlyOwner {
        if (pools.length == 0) revert ReckonErrors.InsufficientPools();
        bytes32 key = pairKey(tokenA, tokenB);

        PendingProposal storage p = _pending[key];
        delete p.pools;
        for (uint256 i; i < pools.length; ++i) {
            if (pools[i].pool == address(0)) revert ReckonErrors.ZeroAddress();
            p.pools.push(pools[i]);
        }
        p.eta = uint64(block.timestamp) + TIMELOCK_DELAY;
        emit ReckonEvents.PoolListProposed(key, p.eta);
    }

    /// @notice Commit a previously-proposed pool list once ETA has elapsed. Owner only.
    function commitPoolList(address tokenA, address tokenB) external onlyOwner {
        bytes32 key = pairKey(tokenA, tokenB);
        PendingProposal storage p = _pending[key];
        if (p.eta == 0) revert ReckonErrors.NoPendingProposal();
        if (block.timestamp < p.eta) revert ReckonErrors.TimelockNotElapsed();

        delete _poolsForPair[key];
        for (uint256 i; i < p.pools.length; ++i) {
            _poolsForPair[key].push(p.pools[i]);
        }
        delete _pending[key];
        emit ReckonEvents.PoolListCommitted(key);
    }

    /// @notice Cancel a pending proposal. Owner only.
    function cancelPoolList(address tokenA, address tokenB) external onlyOwner {
        bytes32 key = pairKey(tokenA, tokenB);
        if (_pending[key].eta == 0) revert ReckonErrors.NoPendingProposal();
        delete _pending[key];
        emit ReckonEvents.PoolListCancelled(key);
    }

    /// @notice Spot price of `tokenOut` per raw unit of `tokenIn` from a single
    ///         Uniswap v3 pool, scaled by 1e18.
    /// @dev Both `tokenIn` and `tokenOut` must be the pool's `token0`/`token1`
    ///      in either ordering. Reverts on mismatch or zero sqrtPriceX96.
    function _priceFromV3(address pool, address tokenIn, address tokenOut) internal view returns (uint256 price1e18) {
        IUniswapV3Pool p = IUniswapV3Pool(pool);
        (uint160 sqrtPriceX96,,,,,,) = p.slot0();
        if (sqrtPriceX96 == 0) revert ReckonErrors.ZeroPrice();

        address token0 = p.token0();
        address token1 = p.token1();

        bool inIs0 = (tokenIn == token0 && tokenOut == token1);
        bool inIs1 = (tokenIn == token1 && tokenOut == token0);
        if (!inIs0 && !inIs1) revert ReckonErrors.InvalidValidationData();

        // priceX192 = sqrtPriceX96^2 = (token1 raw / token0 raw) * 2^192
        // For canonical USDC/WETH pools sqrtPriceX96 ≈ 2^82, so the square fits in
        // uint256. Reverts on overflow if a future pair pushes sqrtPriceX96 ≥ 2^128.
        uint256 priceX192 = uint256(sqrtPriceX96) * uint256(sqrtPriceX96);
        uint256 q192 = 1 << 192;

        if (inIs0) {
            // out=token1 per in=token0 = priceX192 / 2^192, scaled by 1e18
            price1e18 = Math.mulDiv(priceX192, 1e18, q192);
        } else {
            // out=token0 per in=token1 = 2^192 / priceX192, scaled by 1e18
            price1e18 = Math.mulDiv(q192, 1e18, priceX192);
        }
    }

    /// @notice Canonical benchmark price of `tokenOut` per raw unit of `tokenIn`,
    ///         scaled by 1e18, computed as the equal-weighted geometric mean
    ///         across the registered pool list for the pair.
    /// @dev Reverts if fewer than 3 pools are registered for the pair (NFR-2's
    ///      `1/sqrt(N)` manipulation-resistance bound is the load-bearing claim;
    ///      we lock in N≥3 at the contract level).
    function computeBenchmark(address tokenIn, address tokenOut) external view returns (uint256 price1e18) {
        bytes32 key = pairKey(tokenIn, tokenOut);
        PoolRef[] storage pools = _poolsForPair[key];
        if (pools.length < 3) revert ReckonErrors.InsufficientPools();

        uint256[] memory prices = new uint256[](pools.length);
        for (uint256 i; i < pools.length; ++i) {
            prices[i] = _priceFromV3(pools[i].pool, tokenIn, tokenOut);
        }
        return _geomeanEqualWeighted(prices);
    }

    /// @notice Equal-weighted geometric mean of N prices, all scaled by 1e18.
    /// @dev Computed in log space via PRBMath SD59x18 to avoid overflow at the
    ///      product step and to handle prices that encode ratios well below 1.0
    ///      (e.g., 3.7e9 means 3.7e-9). All inputs must be non-zero.
    function _geomeanEqualWeighted(uint256[] memory prices1e18) internal pure returns (uint256) {
        uint256 n = prices1e18.length;
        if (n == 0) revert ReckonErrors.InsufficientPools();

        SD59x18 sumLn = sd(0);
        for (uint256 i; i < n; ++i) {
            if (prices1e18[i] == 0) revert ReckonErrors.ZeroPrice();
            sumLn = sumLn + sd(int256(prices1e18[i])).ln();
        }

        SD59x18 avgLn = sumLn / convert(int256(n));
        return uint256(SD59x18.unwrap(avgLn.exp()));
    }
}
