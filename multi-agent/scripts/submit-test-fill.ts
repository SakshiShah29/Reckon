/**
 * Submit a test bad fill on Base Sepolia FillRegistry.
 * Uses the relayer key (recorder role) to call recordFill().
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  toHex,
  defineChain,
  type Address,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { USDC_BASE, WETH_BASE, BASE_SEPOLIA_CHAIN_ID } from "@reckon-protocol/types";

const baseSepolia = defineChain({
  id: BASE_SEPOLIA_CHAIN_ID,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
});

const BASE_SEP_RPC = "https://base-sepolia.g.alchemy.com/v2/Dp5FwElAg3eJPHhdUxBEFzOe5wF-ae0Y";
const FILL_REGISTRY = "0xb2f6cDEe56CcA45c9D7AeFe6E268C013C23a0C1D" as Address;
const RELAYER_PK = "0xc0233c30bfad04c5303e621aaf79c147d474d4b2b29b68029d01c7c90cc40e8e" as `0x${string}`;
const SOLVER = "0x31E7aE6788B460e9828AD4357159B52Ed780372E" as Address;

const abi = parseAbi([
  "function recordFill(bytes32 orderHash, address filler, address swapper, address tokenIn, address tokenOut, uint128 inputAmount, uint128 outputAmount, uint16 eboTolerance, uint8 outputsLength, uint64 fillBlock) external",
]);

async function main() {
  const relayer = privateKeyToAccount(RELAYER_PK);
  const client = createPublicClient({ chain: baseSepolia, transport: http(BASE_SEP_RPC) });
  const wallet = createWalletClient({ chain: baseSepolia, transport: http(BASE_SEP_RPC), account: relayer });

  const currentBlock = await client.getBlockNumber();
  const orderHash = keccak256(toHex(`test-fill-${Date.now()}-${Math.random()}`));

  // Simulate a bad fill: 0.01 WETH in, only 10 USDC out (should be ~25 USDC at market)
  const inputAmount = 10n ** 16n; // 0.01 WETH
  const badOutput = 10n * 10n ** 6n; // 10 USDC (roughly 50% of fair value)

  console.log(`Submitting test bad fill on Base Sepolia...`);
  console.log(`  OrderHash: ${orderHash.slice(0, 18)}...`);
  console.log(`  Input: 0.01 WETH, Output: 10 USDC (intentionally bad)`);
  console.log(`  FillRegistry: ${FILL_REGISTRY}`);
  console.log(`  Block: ${currentBlock}`);

  try {
    const tx = await wallet.writeContract({
      address: FILL_REGISTRY,
      abi,
      functionName: "recordFill",
      args: [
        orderHash,
        SOLVER,
        "0x000000000000000000000000000000000000dEaD" as Address, // swapper
        WETH_BASE as Address, // tokenIn
        USDC_BASE as Address, // tokenOut
        inputAmount, // inputAmount
        badOutput, // outputAmount (intentionally low)
        100, // eboTolerance (1%)
        1, // outputsLength
        currentBlock, // fillBlock
      ],
    });

    console.log(`  TX sent: ${tx}`);
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    console.log(`  ✓ Fill recorded! Block: ${receipt.blockNumber}, Status: ${receipt.status}`);
    console.log(`  Watch agents: tail -f multi-agent/logs/agent-1.log`);
  } catch (err) {
    console.error(`  ✗ Failed:`, err instanceof Error ? err.message : err);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
