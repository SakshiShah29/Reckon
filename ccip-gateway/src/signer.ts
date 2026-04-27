import {
  type Hex,
  type Address,
  keccak256,
  encodeAbiParameters,
  createWalletClient,
  http,
  pad,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

const MESSAGE_TYPEHASH = keccak256(
  new TextEncoder().encode(
    "Message(bytes32 sender,uint64 expires,bytes32 requestHash,bytes32 resultHash)"
  )
) as Hex;

const EIP712_TYPES = {
  Message: [
    { name: "sender", type: "bytes32" },
    { name: "expires", type: "uint64" },
    { name: "requestHash", type: "bytes32" },
    { name: "resultHash", type: "bytes32" },
  ],
} as const;

export interface SignParams {
  result: Hex;
  expires: bigint;
  extraData: Hex;
  resolverAddress: Address;
  chainId: number;
  signerKey: Hex;
}

export async function signResponse(params: SignParams): Promise<Hex> {
  const { result, expires, extraData, resolverAddress, chainId, signerKey } =
    params;

  const account = privateKeyToAccount(signerKey);

  const signature = await account.signTypedData({
    domain: {
      name: "ReckonWildcardResolver",
      version: "1",
      chainId: BigInt(chainId),
      verifyingContract: resolverAddress,
    },
    types: EIP712_TYPES,
    primaryType: "Message",
    message: {
      sender: pad(resolverAddress, { size: 32 }),
      expires,
      requestHash: keccak256(extraData),
      resultHash: keccak256(result),
    },
  });

  return signature;
}

export function encodeGatewayResponse(
  result: Hex,
  expires: bigint,
  sig: Hex
): Hex {
  return encodeAbiParameters(
    [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
    [result, expires, sig]
  );
}

export { MESSAGE_TYPEHASH };
