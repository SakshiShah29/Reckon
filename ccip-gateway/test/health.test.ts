import { describe, it, expect } from "vitest";
import { createApp } from "../src/server.js";
import { createMockDb, type SubnameRecord } from "../src/db.js";
import http from "node:http";
import type { Hex, Address } from "viem";
import { namehash } from "viem/ens";

function requestJson(
  app: ReturnType<typeof createApp>,
  path: string
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return reject(new Error("bad addr"));
      const url = `http://127.0.0.1:${addr.port}${path}`;
      http.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        });
      }).on("error", (err) => { server.close(); reject(err); });
    });
  });
}

describe("health endpoint", () => {
  it("returns 200 with status ok", async () => {
    const app = createApp();
    const res = await requestJson(app, "/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("shows permissive mode when no resolverAddress", async () => {
    const db = createMockDb(new Map());
    const app = createApp({
      chainId: 1,
      signerKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex,
      db,
    });
    const res = await requestJson(app, "/health");
    expect(res.body.mode).toBe("permissive");
    expect(res.body.resolverAddress).toBeNull();
  });

  it("shows strict mode when resolverAddress is set", async () => {
    const db = createMockDb(new Map());
    const app = createApp({
      resolverAddress: "0x1234567890abcdef1234567890abcdef12345678" as Address,
      chainId: 1,
      signerKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex,
      db,
    });
    const res = await requestJson(app, "/health");
    expect(res.body.mode).toBe("strict");
    expect(res.body.resolverAddress).toBe("0x1234567890abcdef1234567890abcdef12345678");
  });
});

describe("/test/:name debug route", () => {
  const ALICE_NODE = namehash("alice.solvers.reckonprotocol.eth") as Hex;
  const records = new Map<Hex, SubnameRecord>();
  records.set(ALICE_NODE, {
    label: "alice",
    namespace: "solvers",
    owner: "0x00000000000000000000000000000000000A11CE",
    textRecords: { "reckon.reputation": "500000000000000000" },
  });

  function buildApp() {
    return createApp({
      chainId: 1,
      signerKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex,
      db: createMockDb(records),
    });
  }

  it("returns record for known subname", async () => {
    const app = buildApp();
    const res = await requestJson(app, "/test/alice.solvers.reckonprotocol.eth");
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.owner).toBe("0x00000000000000000000000000000000000A11CE");
    expect(res.body.textRecords["reckon.reputation"]).toBe("500000000000000000");
  });

  it("returns found: false for unknown subname", async () => {
    const app = buildApp();
    const res = await requestJson(app, "/test/nobody.solvers.reckonprotocol.eth");
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
    expect(res.body.namehash).toBeDefined();
  });

  it("returns 400 for invalid name format", async () => {
    const app = buildApp();
    const res = await requestJson(app, "/test/justlabel");
    expect(res.status).toBe(400);
  });
});
