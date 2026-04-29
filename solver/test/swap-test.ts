/**
 * Swapper test script — builds a signed PriorityOrder and POSTs it to the demo solver.
 *
 * Usage:
 *   npm run swap-test                         # honest fill at fair price
 *   npm run swap-test:bad                     # 50% of benchmark — triggers slash
 *   npx tsx test/swap-test.ts --bad-fill 30   # 30% of benchmark
 *
 * Env vars (in solver/.env):
 *   SWAPPER_PRIVATE_KEY   — funded with WETH on Base
 *   SOLVER_URL            — e.g. http://localhost:3000
 *   BASE_RPC_URL
 *   RECKON_VALIDATOR_ADDRESS
 *   EBBO_ORACLE_ADDRESS
 */

import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  encodeAbiParameters,
  keccak256,
  concat,
  erc20Abi,
  maxUint256,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  PRIORITY_ORDER_REACTOR,
  PERMIT2,
  USDC_BASE,
  WETH_BASE,
} from "@reckon-protocol/types";

// ── Env ────────────────────────────────────────────────────────

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

const SWAPPER_KEY = required("SWAPPER_PRIVATE_KEY") as `0x${string}`;
const SOLVER_URL = required("SOLVER_URL");
const BASE_RPC_URL = required("BASE_RPC_URL");
const VALIDATOR = required("RECKON_VALIDATOR_ADDRESS") as Address;
const EBBO_ORACLE = required("EBBO_ORACLE_ADDRESS") as Address;

// ── Parse args ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const badFillIdx = args.indexOf("--bad-fill");
const isBadFill = badFillIdx !== -1;
const badFillPct = isBadFill
  ? parseInt(args[badFillIdx + 1] ?? "50", 10)
  : 100;

// ── Clients ────────────────────────────────────────────────────

const account = privateKeyToAccount(SWAPPER_KEY);
const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
const walletClient = createWalletClient({ chain: base, transport: http(BASE_RPC_URL), account });

// ── ABIs ───────────────────────────────────────────────────────

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

// ── EIP-712 type hashes (matching PriorityOrderLib.sol) ────────

const ORDER_INFO_TYPE =
  "OrderInfo(address reactor,address swapper,uint256 nonce,uint256 deadline,address additionalValidationContract,bytes additionalValidationData)";

const PRIORITY_INPUT_TYPE =
  "PriorityInput(address token,uint256 amount,uint256 mpsPerPriorityFeeWei)";

const PRIORITY_OUTPUT_TYPE =
  "PriorityOutput(address token,uint256 amount,uint256 mpsPerPriorityFeeWei,address recipient)";

const PRIORITY_ORDER_TYPE =
  "PriorityOrder(" +
  "OrderInfo info," +
  "address cosigner," +
  "uint256 auctionStartBlock," +
  "uint256 baselinePriorityFeeWei," +
  "PriorityInput input," +
  "PriorityOutput[] outputs)";

// Full ORDER_TYPE — nested structs alphabetically
const ORDER_TYPE =
  PRIORITY_ORDER_TYPE + ORDER_INFO_TYPE + PRIORITY_INPUT_TYPE + PRIORITY_OUTPUT_TYPE;

const ORDER_TYPE_HASH = keccak256(toHex(ORDER_TYPE));
const ORDER_INFO_TYPE_HASH = keccak256(toHex(ORDER_INFO_TYPE));
const PRIORITY_INPUT_TYPE_HASH = keccak256(toHex(PRIORITY_INPUT_TYPE));
const PRIORITY_OUTPUT_TYPE_HASH = keccak256(toHex(PRIORITY_OUTPUT_TYPE));

const TOKEN_PERMISSIONS_TYPEHASH = keccak256(
  toHex("TokenPermissions(address token,uint256 amount)"),
);

const PERMIT_WITNESS_TRANSFER_TYPEHASH = keccak256(
  toHex(
    "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline," +
      "PriorityOrder witness)" +
      ORDER_INFO_TYPE +
      PRIORITY_INPUT_TYPE +
      PRIORITY_ORDER_TYPE +
      PRIORITY_OUTPUT_TYPE +
      "TokenPermissions(address token,uint256 amount)",
  ),
);

// ── PriorityOrder ABI encoding ─────────────────────────────────

const PriorityOrderABI = [
  {
    type: "tuple",
    components: [
      {
        name: "info",
        type: "tuple",
        components: [
          { name: "reactor", type: "address" },
          { name: "swapper", type: "address" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
          { name: "additionalValidationContract", type: "address" },
          { name: "additionalValidationData", type: "bytes" },
        ],
      },
      { name: "cosigner", type: "address" },
      { name: "auctionStartBlock", type: "uint256" },
      { name: "baselinePriorityFeeWei", type: "uint256" },
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "mpsPerPriorityFeeWei", type: "uint256" },
        ],
      },
      {
        name: "outputs",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "mpsPerPriorityFeeWei", type: "uint256" },
          { name: "recipient", type: "address" },
        ],
      },
      {
        name: "cosignerData",
        type: "tuple",
        components: [{ name: "auctionTargetBlock", type: "uint256" }],
      },
      { name: "cosignature", type: "bytes" },
    ],
  },
] as const;

// ── Hashing helpers (mirrors PriorityOrderLib.sol) ─────────────

interface OrderData {
  reactor: Address;
  swapper: Address;
  nonce: bigint;
  deadline: bigint;
  validationContract: Address;
  validationData: Hex;
  cosigner: Address;
  auctionStartBlock: bigint;
  baselinePriorityFeeWei: bigint;
  inputToken: Address;
  inputAmount: bigint;
  inputMps: bigint;
  outputToken: Address;
  outputAmount: bigint;
  outputMps: bigint;
  outputRecipient: Address;
}

function hashOrderInfo(o: OrderData): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
      ],
      [
        ORDER_INFO_TYPE_HASH,
        o.reactor,
        o.swapper,
        o.nonce,
        o.deadline,
        o.validationContract,
        keccak256(o.validationData),
      ],
    ),
  );
}

function hashInput(o: OrderData): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }],
      [PRIORITY_INPUT_TYPE_HASH, o.inputToken, o.inputAmount, o.inputMps],
    ),
  );
}

function hashOutput(o: OrderData): Hex {
  const singleHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
      ],
      [PRIORITY_OUTPUT_TYPE_HASH, o.outputToken, o.outputAmount, o.outputMps, o.outputRecipient],
    ),
  );
  // For a single output, keccak256 of the packed hash is just keccak256(hash)
  return keccak256(singleHash);
}

function hashOrder(o: OrderData): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        ORDER_TYPE_HASH,
        hashOrderInfo(o),
        o.cosigner,
        o.auctionStartBlock,
        o.baselinePriorityFeeWei,
        hashInput(o),
        hashOutput(o),
      ],
    ),
  );
}

// ── Permit2 signing ────────────────────────────────────────────

function permit2DomainSeparator(chainId: number): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [
        keccak256(toHex("EIP712Domain(string name,uint256 chainId,address verifyingContract)")),
        keccak256(toHex("Permit2")),
        BigInt(chainId),
        PERMIT2,
      ],
    ),
  );
}

async function signOrder(
  order: OrderData,
  orderHash: Hex,
): Promise<Hex> {
  const tokenPermHash = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [TOKEN_PERMISSIONS_TYPEHASH, order.inputToken, order.inputAmount],
    ),
  );

  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "bytes32" },
      ],
      [
        PERMIT_WITNESS_TRANSFER_TYPEHASH,
        tokenPermHash,
        PRIORITY_ORDER_REACTOR,
        order.nonce,
        order.deadline,
        orderHash,
      ],
    ),
  );

  const domainSep = permit2DomainSeparator(base.id);
  const digest = keccak256(
    concat(["0x1901", domainSep, structHash]),
  );

  return await account.sign({ hash: digest });
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log(`=== Reckon Swap Test ===`);
  console.log(`Swapper: ${account.address}`);
  console.log(`Solver: ${SOLVER_URL}`);
  console.log(`Mode: ${isBadFill ? `BAD FILL (${badFillPct}% of benchmark)` : "honest fill"}`);
  console.log();

  // 1. Read benchmark (WETH→USDC price)
  const benchmark = await publicClient.readContract({
    address: EBBO_ORACLE,
    abi: EBBOOracleABI,
    functionName: "computeBenchmark",
    args: [WETH_BASE, USDC_BASE],
  });
  console.log(`EBBO benchmark: ${benchmark} (price1e18)`);

  // 2. Compute amounts — input 0.01 WETH, output USDC
  const inputAmount = 10n ** 16n; // 0.01 WETH (18 decimals)
  const fairOutput = (benchmark * inputAmount) / 10n ** 18n;
  const outputAmount = (fairOutput * BigInt(badFillPct)) / 100n;
  console.log(`Input: ${inputAmount} WETH (${Number(inputAmount) / 1e18} WETH)`);
  console.log(`Output: ${outputAmount} USDC (fair: ${fairOutput})`);

  // 3. Wrap ETH → WETH if needed
  const wethBalance = await publicClient.readContract({
    address: WETH_BASE,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (wethBalance < inputAmount) {
    const wrapAmount = inputAmount - wethBalance;
    console.log(`Wrapping ${Number(wrapAmount) / 1e18} ETH → WETH...`);
    const wrapTx = await walletClient.sendTransaction({
      to: WETH_BASE,
      value: wrapAmount,
    });
    await publicClient.waitForTransactionReceipt({ hash: wrapTx });
    console.log(`Wrapped: ${wrapTx}`);
  }

  // 4. Ensure WETH approved on Permit2
  const allowance = await publicClient.readContract({
    address: WETH_BASE,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, PERMIT2],
  });
  if (allowance < inputAmount) {
    console.log(`Approving WETH on Permit2...`);
    const approveTx = await walletClient.writeContract({
      address: WETH_BASE,
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2, maxUint256],
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log(`Approved: ${approveTx}`);
  }

  // 5. Build order
  const currentBlock = await publicClient.getBlockNumber();
  const block = await publicClient.getBlock({ blockNumber: currentBlock });
  const eboToleranceBps = 100; // 1%

  const validationData = encodeAbiParameters([{ type: "uint16" }], [eboToleranceBps]);

  const orderData: OrderData = {
    reactor: PRIORITY_ORDER_REACTOR,
    swapper: account.address,
    nonce: BigInt(Date.now()),
    deadline: block.timestamp + 3600n,
    validationContract: VALIDATOR,
    validationData,
    cosigner: "0x0000000000000000000000000000000000000000",
    auctionStartBlock: currentBlock,
    baselinePriorityFeeWei: 0n,
    inputToken: WETH_BASE,
    inputAmount,
    inputMps: 0n,
    outputToken: USDC_BASE,
    outputAmount,
    outputMps: 0n,
    outputRecipient: account.address,
  };

  // 6. Hash and sign
  const orderHash = hashOrder(orderData);
  console.log(`Order hash: ${orderHash}`);

  const signature = await signOrder(orderData, orderHash);
  console.log(`Signature: ${signature.slice(0, 20)}...`);

  // 7. Encode order
  const encodedOrder = encodeAbiParameters(PriorityOrderABI, [
    {
      info: {
        reactor: orderData.reactor,
        swapper: orderData.swapper,
        nonce: orderData.nonce,
        deadline: orderData.deadline,
        additionalValidationContract: orderData.validationContract,
        additionalValidationData: orderData.validationData,
      },
      cosigner: orderData.cosigner,
      auctionStartBlock: orderData.auctionStartBlock,
      baselinePriorityFeeWei: orderData.baselinePriorityFeeWei,
      input: {
        token: orderData.inputToken,
        amount: orderData.inputAmount,
        mpsPerPriorityFeeWei: orderData.inputMps,
      },
      outputs: [
        {
          token: orderData.outputToken,
          amount: orderData.outputAmount,
          mpsPerPriorityFeeWei: orderData.outputMps,
          recipient: orderData.outputRecipient,
        },
      ],
      cosignerData: { auctionTargetBlock: 0n },
      cosignature: "0x",
    },
  ]);

  // 8. POST to solver
  console.log();
  console.log(`Sending to solver at ${SOLVER_URL}/fill ...`);
  const response = await fetch(`${SOLVER_URL}/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encodedOrder, signature }),
  });

  const result = await response.json();
  if (response.ok) {
    console.log();
    console.log(`Fill submitted!`);
    console.log(`  tx: ${result.txHash}`);
    console.log(`  orderHash: ${result.orderHash}`);
    console.log(`  block: ${result.fillBlock}`);
    console.log(`  solver: ${result.solver}`);
    console.log();
    console.log(`Relayer will pick up the Fill event and open the challenge window.`);
    if (isBadFill) {
      console.log(`This is a bad fill — challenger agents should detect and slash within 30 minutes.`);
    }
  } else {
    console.error(`Solver rejected: ${result.error} (${result.code})`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
