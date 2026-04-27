// Minimal ABIs for off-chain reads — only the functions/events we need

export const UniswapV3PoolABI = [
  {
    inputs: [],
    name: "slot0",
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token0",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "token1",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const StateViewABI = [
  {
    inputs: [
      { name: "poolManager", type: "address" },
      { name: "poolId", type: "bytes32" },
    ],
    name: "getSlot0",
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint24" },
      { name: "lpFee", type: "uint24" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const FillRegistryABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "orderHash", type: "bytes32" },
      { indexed: true, name: "fillerNamehash", type: "bytes32" },
      { indexed: true, name: "swapper", type: "address" },
      { indexed: false, name: "fillBlock", type: "uint256" },
    ],
    name: "FillRecorded",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "rootHash", type: "bytes32" },
      { indexed: false, name: "firstOrderHash", type: "bytes32" },
      { indexed: false, name: "lastOrderHash", type: "bytes32" },
    ],
    name: "FillBatchAnchored",
    type: "event",
  },
  {
    inputs: [{ name: "orderHash", type: "bytes32" }],
    name: "fills",
    outputs: [
      { name: "filler", type: "address" },
      { name: "fillerNamehash", type: "bytes32" },
      { name: "swapper", type: "address" },
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "inputAmount", type: "uint256" },
      { name: "outputAmount", type: "uint256" },
      { name: "eboToleranceBps", type: "uint16" },
      { name: "fillBlock", type: "uint256" },
      { name: "challengeDeadline", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

export const PriorityOrderReactorABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "orderHash", type: "bytes32" },
      { indexed: true, name: "filler", type: "address" },
      { indexed: true, name: "swapper", type: "address" },
      { indexed: false, name: "nonce", type: "uint256" },
    ],
    name: "Fill",
    type: "event",
  },
] as const;
