import { type Address, decodeAbiParameters, type Hex } from "viem";
import { PRIORITY_ORDER_REACTOR, USDC_BASE, WETH_BASE } from "@reckon-protocol/types";

export interface DecodedOrder {
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
  auctionTargetBlock: bigint;
  cosignature: Hex;
}

// PriorityOrder ABI tuple for decoding the encoded order bytes
const PriorityOrderTuple = [
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

export function decodeOrder(encodedOrder: Hex): DecodedOrder {
  const [order] = decodeAbiParameters(PriorityOrderTuple, encodedOrder);

  if (order.outputs.length !== 1) {
    throw new Error(`Expected 1 output, got ${order.outputs.length}`);
  }

  const output = order.outputs[0]!;

  return {
    reactor: order.info.reactor,
    swapper: order.info.swapper,
    nonce: order.info.nonce,
    deadline: order.info.deadline,
    validationContract: order.info.additionalValidationContract,
    validationData: order.info.additionalValidationData,
    cosigner: order.cosigner,
    auctionStartBlock: order.auctionStartBlock,
    baselinePriorityFeeWei: order.baselinePriorityFeeWei,
    inputToken: order.input.token,
    inputAmount: order.input.amount,
    inputMps: order.input.mpsPerPriorityFeeWei,
    outputToken: output.token,
    outputAmount: output.amount,
    outputMps: output.mpsPerPriorityFeeWei,
    outputRecipient: output.recipient,
    auctionTargetBlock: order.cosignerData.auctionTargetBlock,
    cosignature: order.cosignature,
  };
}

export interface ValidationError {
  error: string;
  code: "INVALID_ORDER" | "EXPIRED" | "WRONG_REACTOR" | "UNSUPPORTED_TOKEN";
}

export function validateOrder(
  order: DecodedOrder,
  reckonValidatorAddress: Address,
): ValidationError | null {
  if (order.reactor.toLowerCase() !== PRIORITY_ORDER_REACTOR.toLowerCase()) {
    return { error: `Wrong reactor: ${order.reactor}`, code: "WRONG_REACTOR" };
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  if (order.deadline <= now) {
    return { error: `Order expired at ${order.deadline}`, code: "EXPIRED" };
  }

  if (order.validationContract.toLowerCase() !== reckonValidatorAddress.toLowerCase()) {
    return {
      error: `Validation contract ${order.validationContract} is not ReckonValidator`,
      code: "INVALID_ORDER",
    };
  }

  const inputLower = order.inputToken.toLowerCase();
  const outputLower = order.outputToken.toLowerCase();
  const usdcLower = USDC_BASE.toLowerCase();
  const wethLower = WETH_BASE.toLowerCase();

  const isValidPair =
    (inputLower === usdcLower && outputLower === wethLower) ||
    (inputLower === wethLower && outputLower === usdcLower);

  if (!isValidPair) {
    return { error: `Unsupported token pair: ${order.inputToken} → ${order.outputToken}`, code: "UNSUPPORTED_TOKEN" };
  }

  return null;
}
