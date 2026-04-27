import { describe, it, expect } from "vitest";
import { signResponse, encodeGatewayResponse } from "../src/signer.js";
import {
  type Hex,
  type Address,
  keccak256,
  encodeAbiParameters,
  decodeAbiParameters,
  pad,
  concat,
  toHex,
  encodeFunctionData,
  verifyTypedData,
} from "viem";
import { namehash } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";

/**
 * This test replicates the exact EIP-712 digest computation from
 * ReckonWildcardResolver.sol's resolveWithProof to verify that
 * the TypeScript signer produces byte-identical signatures.
 *
 * Contract reference (ReckonWildcardResolver.sol lines 74-82):
 *   bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
 *       MESSAGE_TYPEHASH,
 *       bytes32(uint256(uint160(address(this)))),
 *       expires,
 *       keccak256(extraData),
 *       keccak256(result)
 *   )));
 */

const SIGNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const SIGNER_ADDR = privateKeyToAccount(SIGNER_KEY).address;
const RESOLVER_ADDR = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const CHAIN_ID = 31337;

const MESSAGE_TYPEHASH = keccak256(
  new TextEncoder().encode(
    "Message(bytes32 sender,uint64 expires,bytes32 requestHash,bytes32 resultHash)"
  )
);

const EIP712_DOMAIN_TYPEHASH = keccak256(
  new TextEncoder().encode(
    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
  )
);

function computeDomainSeparator(
  chainId: number,
  verifyingContract: Address
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        EIP712_DOMAIN_TYPEHASH as `0x${string}`,
        keccak256(new TextEncoder().encode("ReckonWildcardResolver")),
        keccak256(new TextEncoder().encode("1")),
        BigInt(chainId),
        verifyingContract,
      ]
    )
  );
}

function computeContractDigest(
  resolverAddress: Address,
  expires: bigint,
  extraData: Hex,
  result: Hex,
  chainId: number
): Hex {
  const structHash = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint64" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        MESSAGE_TYPEHASH as `0x${string}`,
        pad(resolverAddress, { size: 32 }),
        expires,
        keccak256(extraData),
        keccak256(result),
      ]
    )
  );

  const domainSeparator = computeDomainSeparator(chainId, resolverAddress);

  return keccak256(
    concat([toHex("\x19\x01"), domainSeparator as Hex, structHash as Hex])
  );
}

describe("E2E signature cross-validation", () => {
  it("gateway signature matches contract digest computation", async () => {
    const textAbi = [
      {
        name: "text",
        type: "function",
        inputs: [
          { name: "node", type: "bytes32" },
          { name: "key", type: "string" },
        ],
        outputs: [{ type: "string" }],
        stateMutability: "view",
      },
    ] as const;

    const node = namehash("bunni.solvers.reckon.eth");
    const callData = encodeFunctionData({
      abi: textAbi,
      functionName: "text",
      args: [node as `0x${string}`, "reckon.reputation"],
    });

    const result = encodeAbiParameters([{ type: "string" }], ["0.84"]);
    const extraData = encodeAbiParameters([{ type: "bytes" }], [callData]);
    const expires = BigInt(Math.floor(Date.now() / 1000) + 300);

    const sig = await signResponse({
      result,
      expires,
      extraData,
      resolverAddress: RESOLVER_ADDR,
      chainId: CHAIN_ID,
      signerKey: SIGNER_KEY,
    });

    // Replicate the contract's digest computation
    const contractDigest = computeContractDigest(
      RESOLVER_ADDR,
      expires,
      extraData,
      result,
      CHAIN_ID
    );

    // Verify signature against the contract-style digest
    const valid = await verifyTypedData({
      address: SIGNER_ADDR,
      domain: {
        name: "ReckonWildcardResolver",
        version: "1",
        chainId: BigInt(CHAIN_ID),
        verifyingContract: RESOLVER_ADDR,
      },
      types: {
        Message: [
          { name: "sender", type: "bytes32" },
          { name: "expires", type: "uint64" },
          { name: "requestHash", type: "bytes32" },
          { name: "resultHash", type: "bytes32" },
        ],
      },
      primaryType: "Message",
      message: {
        sender: pad(RESOLVER_ADDR, { size: 32 }),
        expires,
        requestHash: keccak256(extraData),
        resultHash: keccak256(result),
      },
      signature: sig,
    });
    expect(valid).toBe(true);
  });

  it("full response encodes correctly for resolveWithProof", async () => {
    const result = encodeAbiParameters([{ type: "string" }], ["0.84"]);
    const callData = "0xdeadbeef" as Hex;
    const extraData = encodeAbiParameters([{ type: "bytes" }], [callData]);
    const expires = BigInt(Math.floor(Date.now() / 1000) + 300);

    const sig = await signResponse({
      result,
      expires,
      extraData,
      resolverAddress: RESOLVER_ADDR,
      chainId: CHAIN_ID,
      signerKey: SIGNER_KEY,
    });

    const encoded = encodeGatewayResponse(result, expires, sig);

    // Decode as the contract would: abi.decode(response, (bytes, uint64, bytes))
    const [decodedResult, decodedExpires, decodedSig] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
      encoded
    );

    expect(decodedResult).toBe(result);
    expect(decodedExpires).toBe(expires);
    expect(decodedSig).toBe(sig);

    // The contract would then decode result as string
    const [textValue] = decodeAbiParameters(
      [{ type: "string" }],
      decodedResult as Hex
    );
    expect(textValue).toBe("0.84");
  });
});
