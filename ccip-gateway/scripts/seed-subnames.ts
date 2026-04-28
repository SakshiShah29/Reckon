/**
 * Seeds test subnames into MongoDB for e2e testing.
 *
 * Usage:
 *   npx tsx scripts/seed-subnames.ts
 *
 * Required env:
 *   MONGODB_URI_RO — Atlas connection string (needs write access for seeding)
 */

import "dotenv/config";
import { MongoClient } from "mongodb";
import { namehash, normalize } from "viem/ens";

const SUBNAMES = [
  {
    label: "alice",
    namespace: "solvers" as const,
    owner: "0x00000000000000000000000000000000000A11CE",
    textRecords: {
      "reckon.reputation": "500000000000000000",
      "reckon.totalFills": "12",
      "reckon.slashCount": "0",
    },
  },
  {
    label: "bob",
    namespace: "solvers" as const,
    owner: "0x0000000000000000000000000000000000000B0B",
    textRecords: {
      "reckon.reputation": "800000000000000000",
      "reckon.totalFills": "47",
      "reckon.slashCount": "1",
      "reckon.lastSlash": "1714200000",
    },
  },
  {
    label: "eve",
    namespace: "challengers" as const,
    owner: "0x0000000000000000000000000000000000000E4E",
    textRecords: {},
  },
];

async function main() {
  const uri = process.env.MONGODB_URI_RO;
  if (!uri) {
    console.error("MONGODB_URI_RO not set");
    process.exit(1);
  }

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("reckon");
  const subnames = db.collection("subnames");

  for (const sub of SUBNAMES) {
    const fullName = `${sub.label}.${sub.namespace}.reckonprotocol.eth`;
    const node = namehash(normalize(fullName));

    const existing = await subnames.findOne({ namehash: node });
    if (existing) {
      console.log(`  skip  "${fullName}" — already exists`);
      continue;
    }

    await subnames.insertOne({
      label: sub.label,
      namespace: sub.namespace,
      owner: sub.owner,
      namehash: node,
      registeredAt: Date.now(),
      textRecords: sub.textRecords,
    });
    console.log(`  ✓ seed "${fullName}" (namehash: ${node})`);
  }

  await client.close();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
