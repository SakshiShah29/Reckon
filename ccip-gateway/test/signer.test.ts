import { describe, it, expect } from "vitest";
import {
  signResponse,
  encodeGatewayResponse,
  MESSAGE_TYPEHASH,
} from "../src/signer.js";
import {
  keccak256,
  encodeAbiParameters,
  pad,
  verifyTypedData,
  type Hex,
  type Address,
  encodeFunctionData,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { namehash } from "viem/ens";

const SIGNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const SIGNER_ADDR = privateKeyToAccount(SIGNER_KEY).address;
const RESOLVER_ADDR = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const CHAIN_ID = 31337;

describe("signResponse", () => {
  it("produces a signature recoverable to the signer address", async () => {
    const result = encodeAbiParameters([{ type: "string" }], ["0.84"]);
    const data = "0xdeadbeef" as Hex;
    const extraData = encodeAbiParameters([{ type: "bytes" }], [data]);
    const expires = BigInt(Math.floor(Date.now() / 1000) + 300);

    const sig = await signResponse({
      result,
      expires,
      extraData,
      resolverAddress: RESOLVER_ADDR,
      chainId: CHAIN_ID,
      signerKey: SIGNER_KEY,
    });

    expect(sig).toMatch(/^0x[0-9a-f]{130}$/i);

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

  it("different extraData produces different signature", async () => {
    const result = encodeAbiParameters([{ type: "string" }], ["0.84"]);
    const expires = BigInt(Math.floor(Date.now() / 1000) + 300);

    const extraData1 = encodeAbiParameters([{ type: "bytes" }], ["0xaa" as Hex]);
    const extraData2 = encodeAbiParameters([{ type: "bytes" }], ["0xbb" as Hex]);

    const sig1 = await signResponse({
      result,
      expires,
      extraData: extraData1,
      resolverAddress: RESOLVER_ADDR,
      chainId: CHAIN_ID,
      signerKey: SIGNER_KEY,
    });

    const sig2 = await signResponse({
      result,
      expires,
      extraData: extraData2,
      resolverAddress: RESOLVER_ADDR,
      chainId: CHAIN_ID,
      signerKey: SIGNER_KEY,
    });

    expect(sig1).not.toBe(sig2);
  });
});

describe("encodeGatewayResponse", () => {
  it("encodes (result, expires, sig) as ABI bytes", async () => {
    const result = encodeAbiParameters([{ type: "string" }], ["0.84"]);
    const expires = 1700000000n;
    const sig = "0x" + "ab".repeat(65) as Hex;

    const encoded = encodeGatewayResponse(result, expires, sig);

    const [decodedResult, decodedExpires, decodedSig] = (() => {
      const { decodeAbiParameters } = require("viem");
      return decodeAbiParameters(
        [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
        encoded
      );
    })();

    expect(decodedResult).toBe(result);
    expect(decodedExpires).toBe(expires);
    expect(decodedSig).toBe(sig);
  });
});
