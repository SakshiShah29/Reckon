import type { Hex } from "viem";
import { namehash } from "viem/ens";
import type { SubnameRecord } from "../../src/db.js";

export const ALICE_ADDR = "0x00000000000000000000000000000000000A11CE" as const;
export const BOB_ADDR = "0x0000000000000000000000000000000000000B0B" as const;
export const EVE_ADDR = "0x0000000000000000000000000000000000000E4E" as const;

export const ALICE_NODE = namehash("alice.solvers.reckonprotocol.eth") as Hex;
export const BOB_NODE = namehash("bob.solvers.reckonprotocol.eth") as Hex;
export const EVE_NODE = namehash("eve.challengers.reckonprotocol.eth") as Hex;

export const seedRecords: Array<{ node: Hex; record: SubnameRecord }> = [
  {
    node: ALICE_NODE,
    record: {
      label: "alice",
      namespace: "solvers",
      owner: ALICE_ADDR,
      textRecords: {
        "reckon.reputation": "500000000000000000",
        "reckon.totalFills": "12",
        "reckon.slashCount": "0",
      },
    },
  },
  {
    node: BOB_NODE,
    record: {
      label: "bob",
      namespace: "solvers",
      owner: BOB_ADDR,
      textRecords: {},
    },
  },
  {
    node: EVE_NODE,
    record: {
      label: "eve",
      namespace: "challengers",
      owner: EVE_ADDR,
      textRecords: {},
    },
  },
];
