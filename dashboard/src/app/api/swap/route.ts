/**
 * POST /api/swap
 *
 * Builds a signed UniswapX PriorityOrder (as the swapper) and submits it
 * to the solver's /fill endpoint. The solver independently picks it up,
 * validates, and fills on-chain.
 *
 * The fill is intentionally bad (50% of EBBO benchmark) so challenger
 * agents will detect and slash it.
 */

import { NextResponse } from "next/server";
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
  WETH_BASE,
  USDC_BASE,
  WETH_BASE_SEP,
  USDC_BASE_SEP,
} from "@reckon-protocol/types";

export const dynamic = "force-dynamic";

// ── Env (server-side only) ───────────────────────────────────────

function env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

// ── ABIs ─────────────────────────────────────────────────────────

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

// ── EIP-712 type hashes (matching PriorityOrderLib.sol) ──────────

const ORDER_INFO_TYPE =
  "OrderInfo(address reactor,address swapper,uint256 nonce,uint256 deadline,address additionalValidationContract,bytes additionalValidationData)";
const PRIORITY_INPUT_TYPE =
  "PriorityInput(address token,uint256 amount,uint256 mpsPerPriorityFeeWei)";
const PRIORITY_OUTPUT_TYPE =
  "PriorityOutput(address token,uint256 amount,uint256 mpsPerPriorityFeeWei,address recipient)";
const PRIORITY_ORDER_TYPE =
  "PriorityOrder(OrderInfo info,address cosigner,uint256 auctionStartBlock,uint256 baselinePriorityFeeWei,PriorityInput input,PriorityOutput[] outputs)";

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

// ── Hashing helpers ──────────────────────────────────────────────

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
      [{ type: "bytes32" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }, { type: "bytes32" }],
      [ORDER_INFO_TYPE_HASH, o.reactor, o.swapper, o.nonce, o.deadline, o.validationContract, keccak256(o.validationData)],
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
  const h = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "address" }],
      [PRIORITY_OUTPUT_TYPE_HASH, o.outputToken, o.outputAmount, o.outputMps, o.outputRecipient],
    ),
  );
  return keccak256(h);
}

function hashOrder(o: OrderData): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }, { type: "bytes32" }],
      [ORDER_TYPE_HASH, hashOrderInfo(o), o.cosigner, o.auctionStartBlock, o.baselinePriorityFeeWei, hashInput(o), hashOutput(o)],
    ),
  );
}

function permit2DomainSeparator(chainId: number): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "bytes32" }, { type: "uint256" }, { type: "address" }],
      [keccak256(toHex("EIP712Domain(string name,uint256 chainId,address verifyingContract)")), keccak256(toHex("Permit2")), BigInt(chainId), PERMIT2],
    ),
  );
}

// ── POST handler ─────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const badFillPct = BigInt(Math.min(Math.max(Number(body.badFillPct ?? 100), 1), 100));
    const inputEth = parseFloat(body.amount ?? "0.01");
    const inputAmountRaw = BigInt(Math.floor(inputEth * 1e18));

    const SWAPPER_KEY = env("SWAPPER_PRIVATE_KEY") as `0x${string}`;
    const BASE_RPC = env("BASE_RPC_URL");
    const BASE_SEPOLIA_RPC = env("BASE_SEPOLIA_RPC_URL");
    const VALIDATOR = env("RECKON_VALIDATOR_ADDRESS") as Address;
    const EBBO_ORACLE = env("EBBO_ORACLE_ADDRESS") as Address;
    const SOLVER_URL = env("SOLVER_URL");

    const account = privateKeyToAccount(SWAPPER_KEY);
    const anvilClient = createPublicClient({ chain: base, transport: http(BASE_RPC) });
    const anvilWallet = createWalletClient({ chain: base, transport: http(BASE_RPC), account });
    const sepoliaClient = createPublicClient({ chain: base, transport: http(BASE_SEPOLIA_RPC) });

    // 1. Read EBBO benchmark
    const benchmark: bigint = await sepoliaClient.readContract({
      address: EBBO_ORACLE,
      abi: EBBOOracleABI,
      functionName: "computeBenchmark",
      args: [WETH_BASE_SEP, USDC_BASE_SEP],
    });

    // 2. Compute amounts
    const inputAmount = inputAmountRaw > 0n ? inputAmountRaw : 10n ** 16n;
    const fairOutput = (benchmark * inputAmount) / 10n ** 18n;
    const outputAmount = (fairOutput * badFillPct) / 100n;

    // 3. Wrap ETH → WETH if needed
    const wethBal: bigint = await anvilClient.readContract({
      address: WETH_BASE,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (wethBal < inputAmount) {
      const tx = await anvilWallet.sendTransaction({ to: WETH_BASE, value: inputAmount - wethBal });
      await anvilClient.waitForTransactionReceipt({ hash: tx });
    }

    // 4. Approve WETH on Permit2
    const allowance: bigint = await anvilClient.readContract({
      address: WETH_BASE,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account.address, PERMIT2],
    });
    if (allowance < inputAmount) {
      const tx = await anvilWallet.writeContract({
        address: WETH_BASE,
        abi: erc20Abi,
        functionName: "approve",
        args: [PERMIT2, maxUint256],
      });
      await anvilClient.waitForTransactionReceipt({ hash: tx });
    }

    // 5. Build order
    const currentBlock = await anvilClient.getBlockNumber();
    const block = await anvilClient.getBlock({ blockNumber: currentBlock });
    const validationData = encodeAbiParameters([{ type: "uint16" }], [100]); // 1% tolerance

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

    // 6. EIP-712 sign via Permit2
    const orderHash = hashOrder(orderData);

    const tokenPermHash = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [TOKEN_PERMISSIONS_TYPEHASH, orderData.inputToken, orderData.inputAmount],
      ),
    );
    const structHash = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
        [PERMIT_WITNESS_TRANSFER_TYPEHASH, tokenPermHash, PRIORITY_ORDER_REACTOR, orderData.nonce, orderData.deadline, orderHash],
      ),
    );
    const domainSep = permit2DomainSeparator(base.id);
    const digest = keccak256(concat(["0x1901", domainSep, structHash]));
    const signature = await account.sign({ hash: digest });

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

    // 8. Submit to solver's /fill — solver picks it up independently
    const solverRes = await fetch(`${SOLVER_URL}/fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ encodedOrder, signature }),
    });

    const solverData = await solverRes.json();

    if (!solverRes.ok) {
      return NextResponse.json(
        { error: solverData.error || "Solver rejected the order", code: solverData.code },
        { status: solverRes.status },
      );
    }

    return NextResponse.json({
      ...solverData,
      inputAmount: inputAmount.toString(),
      outputAmount: outputAmount.toString(),
      fairOutput: fairOutput.toString(),
      benchmarkPrice: benchmark.toString(),
      badFillPct: Number(badFillPct),
      swapper: account.address,
    });
  } catch (err: any) {
    console.error("[api/swap] Error:", err.message);
    return NextResponse.json(
      { error: err.shortMessage ?? err.message ?? "Swap failed" },
      { status: 500 },
    );
  }
}
