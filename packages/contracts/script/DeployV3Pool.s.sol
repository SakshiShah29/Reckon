// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {IUniswapV3Factory} from "v3-core/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "v3-core/interfaces/IUniswapV3Pool.sol";
import {MockUSDC} from "../test/mocks/MockUSDC.sol";
import {MockWETH} from "../test/mocks/MockWETH.sol";

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}


/// @notice Deploys mock WETH + USDC, creates a Uniswap V3 pool on Base Sepolia
///         mirroring mainnet WETH/USDC settings (0.05% fee, tick spacing 10).
contract DeployV3Pool is Script {
    // --- Base Sepolia canonical Uniswap V3 addresses ---
    address constant V3_FACTORY = 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24;
    address constant NONFUNGIBLE_POSITION_MANAGER = 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2;

    // 0.05% fee tier — mirrors mainnet WETH/USDC
    uint24 constant FEE = 500;
    // Tick spacing for the 500 fee tier
    int24 constant TICK_SPACING = 10;

    // Near-full-range ticks (must be divisible by TICK_SPACING)
    int24 constant TICK_LOWER = -887270;
    int24 constant TICK_UPPER = 887270;

    // Initial mint amounts
    uint256 constant WETH_AMOUNT = 10 ether;
    uint256 constant USDC_AMOUNT = 25_000e6; // 10 ETH * $2,500

    function run() external {
        vm.startBroadcast();

        // Step 1: Deploy mock tokens
        MockWETH mockWETH = new MockWETH();
        MockUSDC mockUSDC = new MockUSDC();
        console.log("MockWETH deployed:  ", address(mockWETH));
        console.log("MockUSDC deployed:  ", address(mockUSDC));

        // Step 2: Sort tokens — V3 requires token0 < token1
        (address token0, address token1) = address(mockWETH) < address(mockUSDC)
            ? (address(mockWETH), address(mockUSDC))
            : (address(mockUSDC), address(mockWETH));
        bool wethIsToken0 = token0 == address(mockWETH);
        console.log("token0 (lower):     ", token0);
        console.log("token1 (higher):    ", token1);
        console.log("WETH is token0:     ", wethIsToken0);

        // Step 3: Create pool on V3 Factory
        IUniswapV3Factory factory = IUniswapV3Factory(V3_FACTORY);
        address pool = factory.createPool(token0, token1, FEE);
        console.log("Pool created:       ", pool);

        // Step 4: Initialize pool with sqrtPriceX96 for ~$2,500 ETH
        //
        // V3 price = token1 / token0 (in raw units).
        //
        // If WETH is token0 (18 dec), USDC is token1 (6 dec):
        //   price = 2500 * 1e6 / 1e18 = 2.5e-9
        //   sqrtPriceX96 = sqrt(2.5e-9) * 2^96 = 3,961,408,125,713,217,069,514,752
        //
        // If USDC is token0 (6 dec), WETH is token1 (18 dec):
        //   price = 1e18 / (2500 * 1e6) = 4e8
        //   sqrtPriceX96 = sqrt(4e8) * 2^96 = 1,584,563,250,285,286,751,870,879,006,720,000
        uint160 sqrtPriceX96 = wethIsToken0
            ? 3_961_408_125_713_217_069_514_752
            : 1_584_563_250_285_286_751_870_879_006_720_000;

        IUniswapV3Pool(pool).initialize(sqrtPriceX96);
        console.log("Pool initialized with sqrtPriceX96");

        // Step 5: Mint tokens for liquidity
        mockWETH.mint(msg.sender, WETH_AMOUNT);
        mockUSDC.mint(msg.sender, USDC_AMOUNT);

        // Step 6: Approve NonfungiblePositionManager
        MockWETH(address(mockWETH)).approve(NONFUNGIBLE_POSITION_MANAGER, type(uint256).max);
        MockUSDC(address(mockUSDC)).approve(NONFUNGIBLE_POSITION_MANAGER, type(uint256).max);

        // Step 7: Mint a full-range liquidity position
        (uint256 amount0Desired, uint256 amount1Desired) = wethIsToken0
            ? (WETH_AMOUNT, USDC_AMOUNT)
            : (USDC_AMOUNT, WETH_AMOUNT);

        INonfungiblePositionManager npm = INonfungiblePositionManager(NONFUNGIBLE_POSITION_MANAGER);
        (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) = npm.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: FEE,
                tickLower: TICK_LOWER,
                tickUpper: TICK_UPPER,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: 0,
                amount1Min: 0,
                recipient: msg.sender,
                deadline: block.timestamp + 600
            })
        );

        vm.stopBroadcast();

        // Log results
        console.log("=== Liquidity Position Minted ===");
        console.log("NFT Token ID:       ", tokenId);
        console.log("Liquidity:          ", uint256(liquidity));
        console.log("Amount0 used:       ", amount0);
        console.log("Amount1 used:       ", amount1);
        console.log("");
        console.log("=== Summary ===");
        console.log("MockWETH:           ", address(mockWETH));
        console.log("MockUSDC:           ", address(mockUSDC));
        console.log("V3 Pool:            ", pool);
        console.log("Fee Tier:            500 (0.05%)");
    }
}
