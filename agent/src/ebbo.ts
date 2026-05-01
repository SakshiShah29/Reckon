import {
  createPublicClient,
  http,
  type PublicClient,
  type Address,
  getAddress,
  defineChain,
} from "viem";

// Define Base Sepolia chain locally (test pool lives here)
const baseSepolia = defineChain({
  id: 84532,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
});
import {
  UniswapV3PoolABI,
  CANONICAL_POOLS_USDC_WETH,
  EBBO_PRECISION,
  EBBO_POOL_COUNT,
} from "@reckon-protocol/types";

/**
 * Reads sqrtPriceX96 from a Uniswap V3 pool's slot0 and converts to a
 * 1e18-precision price ratio (token1 per token0).
 *
 * sqrtPriceX96 = sqrt(price) * 2^96
 * price = (sqrtPriceX96 / 2^96)^2
 * price_1e18 = (sqrtPriceX96^2 * 1e18) / 2^192
 */
async function readV3PoolPrice(
  client: PublicClient,
  poolAddress: Address,
  tokenIn: Address,
  blockNumber?: bigint,
): Promise<bigint> {
  const overrides = blockNumber ? { blockNumber } : {};

  const [slot0Result, token0Result] = await Promise.all([
    client.readContract({
      address: poolAddress,
      abi: UniswapV3PoolABI,
      functionName: "slot0",
      ...overrides,
    }),
    client.readContract({
      address: poolAddress,
      abi: UniswapV3PoolABI,
      functionName: "token0",
      ...overrides,
    }),
  ]);

  const sqrtPriceX96 = BigInt(slot0Result[0]);
  const token0 = getAddress(token0Result);
  const isToken0 = getAddress(tokenIn) === token0;

  // price = sqrtPriceX96^2 / 2^192 (token1 per token0)
  // We compute in 1e18 precision
  const sqrtSquared = sqrtPriceX96 * sqrtPriceX96;
  const Q192 = 1n << 192n;

  if (isToken0) {
    // tokenIn is token0 → price is token1/token0 = direct
    return (sqrtSquared * EBBO_PRECISION) / Q192;
  } else {
    // tokenIn is token1 → we need token0/token1 = 1/price = Q192 / sqrtSquared
    return (Q192 * EBBO_PRECISION) / sqrtSquared;
  }
}

/**
 * Computes the equal-weighted geometric mean of N prices.
 *
 * For 3 prices: geomean = (p1 * p2 * p3)^(1/3)
 *
 * We use Newton's method for integer cube root to avoid floating point:
 * cbrt(x) where x = p1 * p2 * p3 (all in 1e18)
 *
 * Since we multiply three 1e18 values, the product is in 1e54.
 * The cube root of 1e54 is 1e18, which is our desired precision.
 */
function geometricMean3(prices: [bigint, bigint, bigint]): bigint {
  if (prices.some((p) => p <= 0n)) {
    throw new Error("All prices must be positive");
  }

  // Product of three 1e18 values = value in 1e54
  const product = prices[0] * prices[1] * prices[2];

  // Newton's method for integer cube root
  // Start with a reasonable initial guess
  let x = product;
  // Better initial estimate: bitlength / 3
  const bitLen = BigInt(product.toString(2).length);
  x = 1n << (bitLen / 3n + 1n);

  for (let i = 0; i < 256; i++) {
    const xNew = (2n * x + product / (x * x)) / 3n;
    if (xNew >= x) break;
    x = xNew;
  }

  // Verify: x^3 should be <= product < (x+1)^3
  // Refine if needed
  while (x * x * x > product) {
    x -= 1n;
  }

  return x;
}

function geometricMean2(a: bigint, b: bigint): bigint {
  if (a <= 0n || b <= 0n) throw new Error("All prices must be positive");
  // product of two 1e18 values = 1e36, sqrt gives 1e18
  const product = a * b;
  // Newton's method for integer square root
  let x = 1n << (BigInt(product.toString(2).length) / 2n + 1n);
  for (let i = 0; i < 256; i++) {
    const xNew = (x + product / x) / 2n;
    if (xNew >= x) break;
    x = xNew;
  }
  while (x * x > product) x -= 1n;
  return x;
}

export interface EBBOResult {
  /** Benchmark price in 1e18 precision */
  benchmarkPrice: bigint;
  /** Individual pool prices in 1e18 precision */
  poolPrices: bigint[];
  /** Block number the prices were read at */
  blockNumber: bigint;
}

/**
 * Computes the EBBO benchmark for a token pair by reading 3 canonical
 * Uniswap V3 pools and returning their equal-weighted geometric mean.
 *
 * This mirrors the on-chain EBBOOracle.computeBenchmark() logic.
 *
 * @param rpcUrl - Base mainnet (or Anvil fork) RPC URL
 * @param tokenIn - Input token address
 * @param tokenOut - Output token address (used for pool selection)
 * @param blockNumber - Optional block number for historical reads
 * @returns EBBO benchmark result
 */
export async function computeEBBO(
  rpcUrl: string,
  tokenIn: Address,
  tokenOut: Address,
  blockNumber?: bigint,
): Promise<EBBOResult> {
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const block = blockNumber ?? (await client.getBlockNumber());

  // Read prices from all canonical pools in parallel
  const poolAddresses = CANONICAL_POOLS_USDC_WETH;
  if (poolAddresses.length !== EBBO_POOL_COUNT) {
    throw new Error(
      `Expected ${EBBO_POOL_COUNT} canonical pools, got ${poolAddresses.length}`,
    );
  }

  // Read each pool individually — skip pools that revert (e.g. on Anvil forks)
  const poolResults = await Promise.all(
    poolAddresses.map(async (pool) => {
      try {
        return await readV3PoolPrice(client, pool, tokenIn, block);
      } catch {
        try {
          return await readV3PoolPrice(client, pool, tokenIn);
        } catch {
          console.warn(`[ebbo] Pool ${pool.slice(0, 10)}... unreachable, skipping`);
          return null;
        }
      }
    }),
  );

  const poolPrices = poolResults.filter((p): p is bigint => p !== null);
  if (poolPrices.length === 0) {
    throw new Error("All EBBO pools unreachable");
  }

  const benchmarkPrice = poolPrices.length === 3
    ? geometricMean3(poolPrices as [bigint, bigint, bigint])
    : poolPrices.length === 2
      ? geometricMean2(poolPrices[0], poolPrices[1])
      : poolPrices[0];

  return {
    benchmarkPrice,
    poolPrices,
    blockNumber: block,
  };
}

/**
 * Determines if a fill is slashable given the EBBO benchmark and tolerance.
 *
 * @param benchmarkPrice - EBBO benchmark price in 1e18
 * @param actualOutputAmount - Actual output from the fill (in token atomic units)
 * @param expectedInputAmount - Input amount from the fill (in token atomic units)
 * @param toleranceBps - Tolerance in basis points (e.g., 50 = 0.5%)
 * @returns Whether the fill violates EBBO beyond tolerance
 */
export function isSlashable(
  benchmarkPrice: bigint,
  actualOutputAmount: bigint,
  expectedInputAmount: bigint,
  toleranceBps: number,
): { slashable: boolean; expectedOutput: bigint; shortfall: bigint } {
  // expectedOutput = inputAmount * benchmarkPrice / 1e18 * (1 - tolerance)
  // = inputAmount * benchmarkPrice * (10000 - toleranceBps) / (1e18 * 10000)
  const expectedOutput =
    (expectedInputAmount * benchmarkPrice * BigInt(10000 - toleranceBps)) /
    (EBBO_PRECISION * 10000n);

  const slashable = actualOutputAmount < expectedOutput;
  const shortfall = slashable ? expectedOutput - actualOutputAmount : 0n;

  return { slashable, expectedOutput, shortfall };
}
