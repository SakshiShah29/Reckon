import { describe, it, expect } from "vitest";
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
import {
  seedRecords,
  ALICE_NODE,
  BOB_NODE,
  EVE_NODE,
  ALICE_ADDR,
  BOB_ADDR,
  EVE_ADDR,
} from "./fixtures/seed.js";

const SIGNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const SIGNER_ADDR = privateKeyToAccount(SIGNER_KEY).address;
const RESOLVER_ADDR = "0x5FbDB2315678afecb367f032d93F642f64180aa3" as Address;
const CHAIN_ID = 31337;

const NONEXISTENT_NODE = namehash("nobody.solvers.reckonprotocol.eth") as Hex;

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

function buildSeededApp() {
  const records = new Map<Hex, SubnameRecord>();
  for (const { node, record } of seedRecords) {
    records.set(node, record);
  }
  return createApp({
    resolverAddress: RESOLVER_ADDR,
    chainId: CHAIN_ID,
    signerKey: SIGNER_KEY,
    db: createMockDb(records),
  });
}

async function queryText(
  app: ReturnType<typeof createApp>,
  node: Hex,
  key: string
): Promise<{ textValue: string; expires: bigint; sigValid: boolean }> {
  const callData = encodeFunctionData({
    abi: textAbi,
    functionName: "text",
    args: [node as `0x${string}`, key],
  });

  const res = await requestJson(
    app,
    `/${RESOLVER_ADDR}/${callData.slice(2)}.json`
  );
  expect(res.status).toBe(200);

  const [result, expires, sig] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
    res.body.data as Hex
  );

  const [textValue] = decodeAbiParameters(
    [{ type: "string" }],
    result as Hex
  );

  const extraData = encodeAbiParameters([{ type: "bytes" }], [callData]);
  const sigValid = await verifyTypedData({
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

  return { textValue, expires, sigValid };
}

async function queryAddr(
  app: ReturnType<typeof createApp>,
  node: Hex
): Promise<{ addr: string; sigValid: boolean }> {
  const callData = encodeFunctionData({
    abi: addrAbi,
    functionName: "addr",
    args: [node as `0x${string}`],
  });

  const res = await requestJson(
    app,
    `/${RESOLVER_ADDR}/${callData.slice(2)}.json`
  );
  expect(res.status).toBe(200);

  const [result, expires, sig] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
    res.body.data as Hex
  );

  const [addr] = decodeAbiParameters(
    [{ type: "address" }],
    result as Hex
  );

  const extraData = encodeAbiParameters([{ type: "bytes" }], [callData]);
  const sigValid = await verifyTypedData({
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

  return { addr, sigValid };
}

describe("integration: seeded subnames", () => {
  it("alice reputation text record returns correct value with valid signature", async () => {
    const app = buildSeededApp();
    const { textValue, sigValid } = await queryText(
      app,
      ALICE_NODE,
      "reckon.reputation"
    );
    expect(textValue).toBe("500000000000000000");
    expect(sigValid).toBe(true);
  });

  it("alice totalFills text record returns correct value", async () => {
    const app = buildSeededApp();
    const { textValue, sigValid } = await queryText(
      app,
      ALICE_NODE,
      "reckon.totalFills"
    );
    expect(textValue).toBe("12");
    expect(sigValid).toBe(true);
  });

  it("alice addr returns owner address", async () => {
    const app = buildSeededApp();
    const { addr, sigValid } = await queryAddr(app, ALICE_NODE);
    expect(addr.toLowerCase()).toBe(ALICE_ADDR.toLowerCase());
    expect(sigValid).toBe(true);
  });

  it("bob addr returns owner address", async () => {
    const app = buildSeededApp();
    const { addr, sigValid } = await queryAddr(app, BOB_NODE);
    expect(addr.toLowerCase()).toBe(BOB_ADDR.toLowerCase());
    expect(sigValid).toBe(true);
  });

  it("bob reputation (unset) returns empty string", async () => {
    const app = buildSeededApp();
    const { textValue, sigValid } = await queryText(
      app,
      BOB_NODE,
      "reckon.reputation"
    );
    expect(textValue).toBe("");
    expect(sigValid).toBe(true);
  });

  it("eve (challenger) addr returns owner address", async () => {
    const app = buildSeededApp();
    const { addr, sigValid } = await queryAddr(app, EVE_NODE);
    expect(addr.toLowerCase()).toBe(EVE_ADDR.toLowerCase());
    expect(sigValid).toBe(true);
  });

  it("nonexistent subname text returns empty string", async () => {
    const app = buildSeededApp();
    const { textValue, sigValid } = await queryText(
      app,
      NONEXISTENT_NODE,
      "reckon.reputation"
    );
    expect(textValue).toBe("");
    expect(sigValid).toBe(true);
  });

  it("nonexistent subname addr returns zero address", async () => {
    const app = buildSeededApp();
    const { addr, sigValid } = await queryAddr(app, NONEXISTENT_NODE);
    expect(addr).toBe(zeroAddress);
    expect(sigValid).toBe(true);
  });
});
