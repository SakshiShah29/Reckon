import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  encodeAbiParameters,
  keccak256,
  concat,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PERMIT2, USDC_BASE_SEP, CHALLENGER_BOND_PCT, BASE_SEPOLIA_CHAIN_ID } from "@reckon-protocol/types";

const baseSepolia = defineChain({
  id: BASE_SEPOLIA_CHAIN_ID,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://sepolia.base.org"] } },
});

const ChallengerABI = [
  {
    inputs: [
      { name: "orderHash", type: "bytes32" },
      { name: "challengerBond", type: "uint256" },
      { name: "agentTokenId", type: "uint256" },
      {
        name: "permit",
        type: "tuple",
        components: [
          {
            name: "permitted",
            type: "tuple",
            components: [
              { name: "token", type: "address" },
              { name: "amount", type: "uint256" },
            ],
          },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      },
      { name: "signature", type: "bytes" },
    ],
    name: "submit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ERC20ApproveABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const PERMIT_TRANSFER_FROM_TYPEHASH = keccak256(
  toHex("PermitTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)"),
);

const TOKEN_PERMISSIONS_TYPEHASH = keccak256(
  toHex("TokenPermissions(address token,uint256 amount)"),
);

export interface SubmitConfig {
  baseRpcUrl: string;
  agentPrivateKey: Hex;
  challengerAddress: Address;
}

export interface SubmitResult {
  success: boolean;
  txHash?: Hex;
  error?: string;
}

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

export async function submitChallenge(
  orderHash: Hex,
  agentTokenId: string,
  solverBond: bigint,
  config: SubmitConfig,
): Promise<SubmitResult> {
  try {
    const account = privateKeyToAccount(config.agentPrivateKey);

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(config.baseRpcUrl),
    });

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(config.baseRpcUrl),
    });

    const challengerBond = (solverBond * BigInt(CHALLENGER_BOND_PCT)) / 100n;

    // Ensure USDC allowance to Permit2
    const allowance = await publicClient.readContract({
      address: USDC_BASE_SEP,
      abi: ERC20ApproveABI,
      functionName: "allowance",
      args: [account.address, PERMIT2],
    });

    if (allowance < challengerBond) {
      console.log(`[submit] Approving USDC to Permit2...`);
      const approveTx = await walletClient.writeContract({
        address: USDC_BASE_SEP,
        abi: ERC20ApproveABI,
        functionName: "approve",
        args: [PERMIT2, 2n ** 256n - 1n],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveTx, confirmations: 2 });
      console.log(`[submit] Permit2 approved: ${approveTx}`);
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const nonce = BigInt(Date.now());

    const permit = {
      permitted: {
        token: USDC_BASE_SEP as Address,
        amount: challengerBond,
      },
      nonce,
      deadline,
    };

    // EIP-712 signing for PermitTransferFrom
    const tokenPermHash = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
        [TOKEN_PERMISSIONS_TYPEHASH, USDC_BASE_SEP, challengerBond],
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
        ],
        [
          PERMIT_TRANSFER_FROM_TYPEHASH,
          tokenPermHash,
          config.challengerAddress,
          nonce,
          deadline,
        ],
      ),
    );

    const domainSep = permit2DomainSeparator(baseSepolia.id);
    const digest = keccak256(concat(["0x1901", domainSep, structHash]));
    const signature = await account.sign({ hash: digest });

    // Send the challenge transaction
    const txHash = await walletClient.writeContract({
      address: config.challengerAddress,
      abi: ChallengerABI,
      functionName: "submit",
      args: [orderHash, challengerBond, BigInt(agentTokenId), permit, signature],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status === "reverted") {
      return { success: false, txHash, error: "Transaction reverted" };
    }

    return { success: true, txHash };
  } catch (err) {
    return {
      success: false,
      error: `Challenge submission failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
