/**
 * Submit a bad fill directly to FillRegistry on the Anvil fork.
 * This triggers FillRecorded events that all 3 agents will pick up.
 *
 * Steps:
 *   1. Register a demo solver in SolverRegistry (via relayer)
 *   2. Fund + bond the solver in SolverBondVault
 *   3. Call FillRegistry.recordFill() as the recorder with a bad output amount
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
  encodeFunctionData,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { USDC_BASE, WETH_BASE } from "@reckon-protocol/types";

// ── Anvil fork ──────────────────────────────────────────────
const RPC = "http://147.182.164.208:8545";

// Anvil Account #0 is both the deployer, owner, and relayer/recorder
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;
// Anvil Account #5 as the demo solver
const SOLVER_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as const;

// Deployed contract addresses (from DeployBase broadcast)
const FILL_REGISTRY = "0x86D7dBAa4B25d467ff51CcD42A60092F8Af2b7AF" as Address;
const SOLVER_REGISTRY = "0x0FFFA58189CE7131e96F457Df27B516CcAD36cE9" as Address;
const SOLVER_BOND_VAULT = "0xb24b6440755cE3DD08176350e0c2ba7750BA89EA" as Address;
const EBBO_ORACLE = "0x8Ac51E20cBcd9ac0F310E3512AccDb5e47a19B13" as Address;

const abi = parseAbi([
  // SolverRegistry
  "function register(bytes32 node, address solverOwner) external",
  "function isRegistered(address subnameOwner) external view returns (bool)",
  "function namehashOf(address subnameOwner) external view returns (bytes32)",
  // SolverBondVault
  "function deposit(uint256 amount) external",
  "function bondedAmount(bytes32 node) external view returns (uint256)",
  // FillRegistry
  "function recordFill(bytes32 orderHash, address filler, address swapper, address tokenIn, address tokenOut, uint128 inputAmount, uint128 outputAmount, uint16 eboTolerance, uint8 outputsLength, uint64 fillBlock) external",
  // EBBOOracle
  "function computeBenchmark(address tokenIn, address tokenOut) external view returns (uint256)",
  // ERC20
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
]);

async function main() {
  const deployer = privateKeyToAccount(DEPLOYER_KEY);
  const solver = privateKeyToAccount(SOLVER_KEY);

  const client = createPublicClient({ chain: base, transport: http(RPC) });
  const deployerWallet = createWalletClient({ chain: base, transport: http(RPC), account: deployer });
  const solverWallet = createWalletClient({ chain: base, transport: http(RPC), account: solver });

  console.log("=== Submit Bad Fill ===");
  console.log(`Recorder/Relayer: ${deployer.address}`);
  console.log(`Solver: ${solver.address}`);

  // 1. Register solver if not already registered
  const isRegistered = await client.readContract({
    address: SOLVER_REGISTRY,
    abi,
    functionName: "isRegistered",
    args: [solver.address],
  });

  const solverNode = keccak256(toHex("demo-solver.solvers.reckon.eth"));

  if (!isRegistered) {
    console.log("\n[1/5] Registering solver...");
    const regTx = await deployerWallet.writeContract({
      address: SOLVER_REGISTRY,
      abi,
      functionName: "register",
      args: [solverNode, solver.address],
    });
    await client.waitForTransactionReceipt({ hash: regTx });
    console.log(`  Registered: ${regTx}`);
  } else {
    console.log("\n[1/5] Solver already registered");
  }

  // 2. Fund solver with USDC via anvil_setStorageAt
  console.log("[2/5] Funding solver with USDC...");
  const solverUsdcSlot = keccak256(
    ("0x" +
      solver.address.slice(2).toLowerCase().padStart(64, "0") +
      (9).toString(16).padStart(64, "0")) as Hex,
  );
  await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "anvil_setStorageAt",
      params: [
        USDC_BASE,
        solverUsdcSlot,
        "0x00000000000000000000000000000000000000000000000000000002540be400", // 10,000 USDC
      ],
      id: 1,
    }),
  });

  const usdcBal = await client.readContract({
    address: USDC_BASE as Address,
    abi,
    functionName: "balanceOf",
    args: [solver.address],
  });
  console.log(`  USDC balance: ${Number(usdcBal) / 1e6} USDC`);

  // 3. Approve + deposit bond
  const bondAmount = await client.readContract({
    address: SOLVER_BOND_VAULT,
    abi,
    functionName: "bondedAmount",
    args: [solverNode],
  });

  if ((bondAmount as bigint) < 1000n * 10n ** 6n) {
    console.log("[3/5] Depositing solver bond (5000 USDC)...");
    const approveTx = await solverWallet.writeContract({
      address: USDC_BASE as Address,
      abi,
      functionName: "approve",
      args: [SOLVER_BOND_VAULT, 5000n * 10n ** 6n],
    });
    await client.waitForTransactionReceipt({ hash: approveTx });

    const depositTx = await solverWallet.writeContract({
      address: SOLVER_BOND_VAULT,
      abi,
      functionName: "deposit",
      args: [5000n * 10n ** 6n],
    });
    await client.waitForTransactionReceipt({ hash: depositTx });
    console.log(`  Bonded: ${depositTx}`);
  } else {
    console.log("[3/5] Solver already bonded");
  }

  // 4. Read EBBO benchmark
  console.log("[4/5] Reading EBBO benchmark...");
  const benchmark = await client.readContract({
    address: EBBO_ORACLE,
    abi,
    functionName: "computeBenchmark",
    args: [WETH_BASE as Address, USDC_BASE as Address],
  });
  console.log(`  Benchmark (WETH→USDC, 1e18): ${benchmark}`);

  // Build bad fill: 0.01 WETH in, 50% of fair USDC output
  const inputAmount = 10n ** 16n; // 0.01 WETH
  const fairOutput = ((benchmark as bigint) * inputAmount) / 10n ** 18n;
  const badOutput = fairOutput / 2n; // 50% of benchmark

  const currentBlock = await client.getBlockNumber();
  const orderHash = keccak256(
    toHex(`bad-fill-test-${Date.now()}-${Math.random()}`),
  );
  const swapper = "0x000000000000000000000000000000000000dEaD" as Address;

  console.log(`  Input:  ${Number(inputAmount) / 1e18} WETH`);
  console.log(`  Fair output:   ${Number(fairOutput) / 1e6} USDC`);
  console.log(`  Bad output:    ${Number(badOutput) / 1e6} USDC (50%)`);
  console.log(`  Order hash: ${orderHash}`);
  console.log(`  Fill block: ${currentBlock}`);

  // 5. Record bad fill
  console.log("[5/5] Recording bad fill on FillRegistry...");
  const fillTx = await deployerWallet.writeContract({
    address: FILL_REGISTRY,
    abi,
    functionName: "recordFill",
    args: [
      orderHash,
      solver.address,           // filler
      swapper,                  // swapper
      WETH_BASE as Address,     // tokenIn
      USDC_BASE as Address,     // tokenOut
      BigInt(inputAmount) as unknown as bigint,  // inputAmount (uint128)
      BigInt(badOutput) as unknown as bigint,    // outputAmount (uint128)
      100,                      // eboTolerance (1% = 100 bps)
      1,                        // outputsLength
      BigInt(currentBlock) as unknown as bigint, // fillBlock (uint64)
    ],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: fillTx });
  console.log(`  Tx: ${fillTx}`);
  console.log(`  Status: ${receipt.status}`);
  console.log(`  Block: ${receipt.blockNumber}`);

  console.log("\n=== Bad fill submitted! ===");
  console.log("All 3 agents should now detect this via FillRecorded event.");
  console.log("Watch multi-agent/logs/agent-{1,2,3}.log for pipeline activity.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
