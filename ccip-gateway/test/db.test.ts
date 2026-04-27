import { describe, it, expect } from "vitest";
import { createMockDb, type SubnameRecord } from "../src/db.js";
import type { Hex } from "viem";
import { namehash } from "viem/ens";

const ALICE_NODE = namehash("alice.solvers.reckon.eth") as Hex;
const UNKNOWN_NODE = namehash("nobody.solvers.reckon.eth") as Hex;

const aliceRecord: SubnameRecord = {
  label: "alice",
  namespace: "solvers",
  owner: "0x00000000000000000000000000000000000A11CE",
  textRecords: {
    "reckon.reputation": "500000000000000000",
    "reckon.totalFills": "12",
    "reckon.slashCount": "0",
  },
};

describe("MockDb", () => {
  const records = new Map<Hex, SubnameRecord>();
  records.set(ALICE_NODE, aliceRecord);
  const db = createMockDb(records);

  it("returns record for known namehash", async () => {
    const result = await db.lookupByNamehash(ALICE_NODE);
    expect(result).not.toBeNull();
    expect(result!.label).toBe("alice");
    expect(result!.owner).toBe("0x00000000000000000000000000000000000A11CE");
    expect(result!.textRecords["reckon.reputation"]).toBe("500000000000000000");
  });

  it("returns null for unknown namehash", async () => {
    const result = await db.lookupByNamehash(UNKNOWN_NODE);
    expect(result).toBeNull();
  });

  it("close is callable", async () => {
    await expect(db.close()).resolves.toBeUndefined();
  });
});
