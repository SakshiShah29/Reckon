/**
 * GET /api/ebbo
 *
 * Returns the current EBBO Oracle benchmark price for WETH/USDC.
 * Reads from the EBBOOracle contract on Base Sepolia.
 */

import { NextResponse } from "next/server";
import { createPublicClient, http, type Address } from "viem";
import { WETH_BASE_SEP, USDC_BASE_SEP } from "@reckon-protocol/types";

export const dynamic = "force-dynamic";

const EBBOOracleABI = [
  {
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
    ],
    name: "computeBenchmark",
    outputs: [{ name: "price1e18", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export async function GET() {
  try {
    const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC_URL;
    const EBBO_ORACLE = process.env.EBBO_ORACLE_ADDRESS as Address | undefined;

    if (!BASE_SEPOLIA_RPC || !EBBO_ORACLE) {
      return NextResponse.json({
        benchmark: null,
        oracleAddress: EBBO_ORACLE ?? null,
        error: "EBBO oracle not configured",
      });
    }

    const client = createPublicClient({
      transport: http(BASE_SEPOLIA_RPC),
    });

    const benchmark: bigint = await client.readContract({
      address: EBBO_ORACLE,
      abi: EBBOOracleABI,
      functionName: "computeBenchmark",
      args: [WETH_BASE_SEP, USDC_BASE_SEP],
    });

    // benchmark is price * 1e18 (USDC per WETH scaled to 18 decimals)
    // Convert to human-readable: divide by 1e18 to get USDC per WETH,
    // but USDC has 6 decimals, so the raw value is (price * 1e18) where price is in USDC base units
    // Actually: benchmark = (USDC_amount * 1e18) / WETH_amount
    // For 1 WETH: USDC_output = benchmark * 1e18 / 1e18 = benchmark (in USDC base units)
    // To get USD: benchmark / 1e6
    const priceUSD = Number(benchmark) / 1e6;

    return NextResponse.json({
      benchmark: benchmark.toString(),
      priceUSD,
      oracleAddress: EBBO_ORACLE,
      tokenIn: WETH_BASE_SEP,
      tokenOut: USDC_BASE_SEP,
      toleranceBps: 100, // 1%
      timestamp: Math.floor(Date.now() / 1000),
    });
  } catch (err: any) {
    console.error("[api/ebbo] Error:", err.message);
    return NextResponse.json({
      benchmark: null,
      oracleAddress: process.env.EBBO_ORACLE_ADDRESS ?? null,
      error: err.shortMessage ?? err.message ?? "Failed to read EBBO oracle",
    });
  }
}
