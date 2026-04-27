import { describe, it, expect } from "vitest";
import { createApp } from "../src/server.js";
import { createMockDb, type SubnameRecord, type GatewayDb } from "../src/db.js";
import http from "node:http";
import { type Hex, type Address, encodeFunctionData } from "viem";
import { namehash } from "viem/ens";
import { privateKeyToAccount } from "viem/accounts";

const SIGNER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const RESOLVER_ADDR = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const CHAIN_ID = 31337;
const ALICE_NODE = namehash("alice.solvers.reckon.eth") as Hex;

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

function buildApp(db?: GatewayDb) {
  const records = new Map<Hex, SubnameRecord>();
  records.set(ALICE_NODE, {
    label: "alice",
    namespace: "solvers",
    owner: "0x00000000000000000000000000000000000A11CE",
    textRecords: { "reckon.reputation": "500000000000000000" },
  });

  return createApp({
    resolverAddress: RESOLVER_ADDR,
    chainId: CHAIN_ID,
    signerKey: SIGNER_KEY,
    db: db ?? createMockDb(records),
  });
}

describe("error handling", () => {
  it("returns 400 for invalid hex data", async () => {
    const app = buildApp();
    const res = await requestJson(
      app,
      `/${RESOLVER_ADDR}/not-valid-hex.json`
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for truncated calldata", async () => {
    const app = buildApp();
    // Valid selector but truncated parameters
    const res = await requestJson(
      app,
      `/${RESOLVER_ADDR}/59d1d43c0000.json`
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 with empty result for unknown selector", async () => {
    const app = buildApp();
    // Unknown selector with valid-looking padding
    const data =
      "deadbeef" +
      "0000000000000000000000000000000000000000000000000000000000000000";
    const res = await requestJson(
      app,
      `/${RESOLVER_ADDR}/${data}.json`
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it("returns 400 for wrong sender address", async () => {
    const app = buildApp();
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

  it("accepts any sender in permissive mode (no resolverAddress)", async () => {
    const records = new Map<Hex, SubnameRecord>();
    records.set(ALICE_NODE, {
      label: "alice",
      namespace: "solvers",
      owner: "0x00000000000000000000000000000000000A11CE",
      textRecords: { "reckon.reputation": "500000000000000000" },
    });

    const app = createApp({
      chainId: CHAIN_ID,
      signerKey: SIGNER_KEY,
      db: createMockDb(records),
    });

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

    const callData = encodeFunctionData({
      abi: textAbi,
      functionName: "text",
      args: [ALICE_NODE as `0x${string}`, "reckon.reputation"],
    });
    const anySender = "0x0000000000000000000000000000000000000001";

    const res = await requestJson(
      app,
      `/${anySender}/${callData.slice(2)}.json`
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
  });

  it("returns 500 when DB throws", async () => {
    const failingDb: GatewayDb = {
      async lookupByNamehash() {
        throw new Error("connection lost");
      },
      async close() {},
    };
    const app = buildApp(failingDb);

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

    const callData = encodeFunctionData({
      abi: textAbi,
      functionName: "text",
      args: [ALICE_NODE as `0x${string}`, "reckon.reputation"],
    });

    const res = await requestJson(
      app,
      `/${RESOLVER_ADDR}/${callData.slice(2)}.json`
    );
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("internal error");
  });
});
