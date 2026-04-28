import { describe, it, expect, beforeAll } from "vitest";
import { createApp } from "../src/server.js";
import { createMockDb, type SubnameRecord } from "../src/db.js";
import http from "node:http";
import {
  type Hex,
  type Address,
  encodeFunctionData,
  decodeAbiParameters,
  encodeAbiParameters,
  verifyTypedData,
  pad,
  keccak256,
  zeroAddress,
} from "viem";
import { namehash } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";

const SIGNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const SIGNER_ADDR = privateKeyToAccount(SIGNER_KEY).address;
const RESOLVER_ADDR = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const CHAIN_ID = 31337;

const ALICE_NODE = namehash("alice.solvers.reckonprotocol.eth") as Hex;
const UNKNOWN_NODE = namehash("nobody.solvers.reckonprotocol.eth") as Hex;

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

const addrAbi = [
  {
    name: "addr",
    type: "function",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
] as const;

function requestJson(
  app: ReturnType<typeof createApp>,
  path: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string")
        return reject(new Error("bad addr"));
      const url = `http://127.0.0.1:${addr.port}${path}`;
      http
        .get(url, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            server.close();
            resolve({ status: res.statusCode!, body: JSON.parse(data) });
          });
        })
        .on("error", (err) => {
          server.close();
          reject(err);
        });
    });
  });
}

const aliceRecord: SubnameRecord = {
  label: "alice",
  namespace: "solvers",
  owner: "0x00000000000000000000000000000000000A11CE",
  textRecords: {
    "reckon.reputation": "500000000000000000",
    "reckon.totalFills": "12",
  },
};

function buildApp() {
  const records = new Map<Hex, SubnameRecord>();
  records.set(ALICE_NODE, aliceRecord);
  const db = createMockDb(records);

  return createApp({
    resolverAddress: RESOLVER_ADDR,
    chainId: CHAIN_ID,
    signerKey: SIGNER_KEY,
    db,
  });
}

describe("CCIP-Read route", () => {
  it("returns signed text record for known subname", async () => {
    const app = buildApp();
    const callData = encodeFunctionData({
      abi: textAbi,
      functionName: "text",
      args: [ALICE_NODE as `0x${string}`, "reckon.reputation"],
    });
    const dataParam = callData.slice(2); // strip 0x for URL

    const res = await requestJson(
      app,
      `/${RESOLVER_ADDR}/${dataParam}.json`
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();

    const [result, expires, sig] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
      res.body.data as Hex
    );

    const [textValue] = decodeAbiParameters(
      [{ type: "string" }],
      result as Hex
    );
    expect(textValue).toBe("500000000000000000");

    expect(expires).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)));

    const extraData = encodeAbiParameters(
      [{ type: "bytes" }],
      [callData]
    );
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
        resultHash: keccak256(result as Hex),
      },
      signature: sig as Hex,
    });
    expect(valid).toBe(true);
  });

  it("returns empty string for unknown subname text query", async () => {
    const app = buildApp();
    const callData = encodeFunctionData({
      abi: textAbi,
      functionName: "text",
      args: [UNKNOWN_NODE as `0x${string}`, "reckon.reputation"],
    });

    const res = await requestJson(
      app,
      `/${RESOLVER_ADDR}/${callData.slice(2)}.json`
    );
    expect(res.status).toBe(200);

    const [result] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
      res.body.data as Hex
    );
    const [textValue] = decodeAbiParameters(
      [{ type: "string" }],
      result as Hex
    );
    expect(textValue).toBe("");
  });

  it("returns owner address for addr() call", async () => {
    const app = buildApp();
    const callData = encodeFunctionData({
      abi: addrAbi,
      functionName: "addr",
      args: [ALICE_NODE as `0x${string}`],
    });

    const res = await requestJson(
      app,
      `/${RESOLVER_ADDR}/${callData.slice(2)}.json`
    );
    expect(res.status).toBe(200);

    const [result] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
      res.body.data as Hex
    );
    const [addr] = decodeAbiParameters(
      [{ type: "address" }],
      result as Hex
    );
    expect(addr.toLowerCase()).toBe(
      "0x00000000000000000000000000000000000A11CE".toLowerCase()
    );
  });

  it("returns zero address for unknown subname addr query", async () => {
    const app = buildApp();
    const callData = encodeFunctionData({
      abi: addrAbi,
      functionName: "addr",
      args: [UNKNOWN_NODE as `0x${string}`],
    });

    const res = await requestJson(
      app,
      `/${RESOLVER_ADDR}/${callData.slice(2)}.json`
    );
    expect(res.status).toBe(200);

    const [result] = decodeAbiParameters(
      [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
      res.body.data as Hex
    );
    const [addr] = decodeAbiParameters(
      [{ type: "address" }],
      result as Hex
    );
    expect(addr).toBe(zeroAddress);
  });

  it("returns 400 for wrong sender address", async () => {
    const app = buildApp();
    const callData = encodeFunctionData({
      abi: textAbi,
      functionName: "text",
      args: [ALICE_NODE as `0x${string}`, "reckon.reputation"],
    });
    const wrongSender = "0x0000000000000000000000000000000000000001";

    const res = await requestJson(
      app,
      `/${wrongSender}/${callData.slice(2)}.json`
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("sender mismatch");
  });
});
