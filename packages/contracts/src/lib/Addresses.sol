// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title Addresses
/// @notice Central address book for Base mainnet anchors used across Reckon contracts.
/// @dev Keep magic addresses out of contract source — import from here.
library Addresses {
    // UniswapX
    address internal constant PRIORITY_ORDER_REACTOR = 0x000000001Ec5656dcdB24D90DFa42742738De729;

    // Permit2 (canonical, same address on every chain)
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    // Uniswap v4
    address internal constant V4_POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
    address internal constant V4_STATE_VIEW = 0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71;

    // ERC-20 anchors on Base
    address internal constant USDC_BASE = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant WETH_BASE = 0x4200000000000000000000000000000000000006;

    // ERC-20 anchors on Base-Sepolia
    address internal constant USDC_BASE_SEP = 0x868D2ea6D9885e3909Ab82a9B5AC1EE02D50CF93;
    address internal constant WETH_BASE_SEP = 0xb8d5d470fFc5d08Cf3B0Be5F6bce8dFf54cC84d8;
}
