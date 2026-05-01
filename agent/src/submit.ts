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
  keeperHubWebhookUrl?: string;
  keeperHubApiKey?: string;
  keeperHubOrgApiKey?: string;
}

export interface SubmitResult {
  success: boolean;
  txHash?: Hex;
  runId?: string;
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

    const challengerBond = (solverBond * BigInt(CHALLENGER_BOND_PCT)) / 100n;

    // Ensure USDC allowance to Permit2
    const allowance = await publicClient.readContract({
      address: USDC_BASE_SEP,
      abi: ERC20ApproveABI,
      functionName: "allowance",
      args: [account.address, PERMIT2],
    });

    if (allowance < challengerBond) {
      const walletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: http(config.baseRpcUrl),
      });
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

    // Route to KeeperHub webhook if configured, otherwise submit directly
    if (config.keeperHubWebhookUrl && config.keeperHubApiKey) {
      return await submitViaKeeperHub(
        orderHash,
        challengerBond,
        agentTokenId,
        permit,
        signature,
        config.keeperHubWebhookUrl,
        config.keeperHubApiKey,
        config.keeperHubOrgApiKey,
      );
    }

    const walletClient = createWalletClient({
      account,
      chain: baseSepolia,
      transport: http(config.baseRpcUrl),
    });

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

async function submitViaKeeperHub(
  orderHash: Hex,
  challengerBond: bigint,
  agentTokenId: string,
  permit: { permitted: { token: Address; amount: bigint }; nonce: bigint; deadline: bigint },
  signature: Hex,
  webhookUrl: string,
  apiKey: string,
  orgApiKey?: string,
): Promise<SubmitResult> {
  const payload = {
    orderHash,
    challengerBond: challengerBond.toString(),
    agentTokenId,
    permit: {
      permitted: {
        token: permit.permitted.token,
        amount: permit.permitted.amount.toString(),
      },
      nonce: permit.nonce.toString(),
      deadline: permit.deadline.toString(),
    },
    signature,
  };

  console.log(`[submit] Sending challenge via KeeperHub webhook...`);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: `KeeperHub webhook failed (${response.status}): ${text}` };
  }

  const result = await response.json() as { runId?: string; executionId?: string };
  const runId = result.runId ?? result.executionId;

  console.log(`[submit] KeeperHub run started: ${runId}`);

  if (!runId || !orgApiKey) {
    return { success: true, runId };
  }

  // Poll execution logs via KeeperHub REST API to get the tx hash
  const logsUrl = `https://app.keeperhub.com/api/workflows/executions/${runId}/logs`;
  const maxAttempts = 15;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const logsRes = await fetch(logsUrl, {
        headers: { Authorization: `Bearer ${orgApiKey}` },
      });

      if (!logsRes.ok) {
        console.log(`[submit] Poll attempt ${i + 1}: ${logsRes.status}`);
        continue;
      }

      const logsData = await logsRes.json() as {
        execution?: {
          status?: string;
          output?: { transactionHash?: string; error?: string };
          error?: string;
        };
      };

      const exec = logsData.execution;
      if (!exec) continue;

      if (exec.status === "success" && exec.output?.transactionHash) {
        return { success: true, txHash: exec.output.transactionHash as Hex, runId };
      }

      if (exec.status === "error") {
        return { success: false, runId, error: exec.error ?? exec.output?.error ?? "KeeperHub run failed" };
      }
    } catch {
      continue;
    }
  }

  return { success: true, runId };
}
