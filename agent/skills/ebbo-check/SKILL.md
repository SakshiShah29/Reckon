---
name: ebbo-check
description: Compute the EBBO benchmark price from 3 canonical Uniswap pools and determine if a fill is slashable.
version: 0.1.0
metadata:
  openclaw:
    requires:
      env:
        - BASE_RPC_URL
      bins:
        - node
    primaryEnv: BASE_RPC_URL
    emoji: "bar_chart"
---

## Instructions

This skill computes the Execution Best Bid Offer (EBBO) benchmark for a token pair by reading prices from 3 canonical Uniswap V3 pools on Base mainnet and returning their equal-weighted geometric mean.

### When to use

Call this skill after `suspicion-triage` returns a score >= 0.3. This is the deterministic, objective math that backs every challenge.

### How it works

1. **Read pool prices** — For each of 3 canonical USDC/WETH pools on Base:
   - Call `IUniswapV3Pool(pool).slot0()` to get `sqrtPriceX96`
   - Convert: `price = (sqrtPriceX96^2 * 1e18) / 2^192`
   - Normalize for token0/token1 ordering

2. **Compute geometric mean** — Equal-weighted across 3 prices:
   - `geomean = (p1 * p2 * p3)^(1/3)`
   - Uses Newton's method for integer cube root (no floating point)

3. **Check slashability** — Compare actual fill output to expected:
   - `expectedOutput = inputAmount * benchmark * (10000 - toleranceBps) / (1e18 * 10000)`
   - If `actualOutput < expectedOutput` → fill is **slashable**
   - `shortfall = expectedOutput - actualOutput`

### Canonical pools (USDC/WETH on Base)

| Pool | Fee Tier |
|------|----------|
| `0xd0b53D9277642d899DF5C87A3966A349A798F224` | 0.05% |
| `0x4C36388bE6F416A29C8d8Eee81C771cE6bE14B18` | 0.3% |
| `0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C` | 1% |

### Why equal weighting

- TVL weighting is undefined for concentrated-liquidity pools
- Equal weighting preserves the `1/sqrt(3)` manipulation-resistance bound
- No single pool can move the benchmark by more than ~57.7%

### Properties

- **Deterministic**: same inputs → same output. All bigint arithmetic, no floats.
- **Historical reads**: pass a `blockNumber` to read prices at the fill block
- **Gas equivalent**: mirrors the on-chain `EBBOOracle.computeBenchmark()` at ~50-80k gas
