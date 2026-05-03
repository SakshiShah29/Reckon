/**
 * End-to-end ENS resolution test via viem.
 *
 * This script exercises the full CCIP-Read flow:
 *   1. Seeds a subname into MongoDB (if not present)
 *   2. Resolves it via viem's standard getEnsText / getEnsAddress
 *      → viem calls the Universal Resolver on Ethereum mainnet
 *      → resolver reverts with OffchainLookup
 *      → viem follows the gateway URL
 *      → gateway reads MongoDB, signs response
 *      → viem calls resolveWithProof on the resolver
 *      → resolver verifies signature, returns result
 *   3. Prints resolved values
 *
 * Usage:
 *   npx tsx scripts/e2e-resolve.ts
 *
 * Required env:
 *   MONGODB_URI_RO  — Atlas connection string (needs write for seeding)
 *   ETHEREUM_RPC    — Ethereum mainnet RPC (optional, defaults to public)
 */

import "dotenv/config";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { normalize } from "viem/ens";
import { MongoClient } from "mongodb";
import { namehash } from "viem/ens";

const ETHEREUM_RPC =
  process.env.ETHEREUM_RPC || "https://ethereum-rpc.publicnode.com";

const TEST_SUBNAME = "challenger-4.challengers.reckonprotocol.eth";
const TEST_OWNER = "0xFdFa4fF359C9E06E82eF37300cA746CA189C22a4";
const TEST_REPUTATION = "0";
const LABEL = "challenger-4"

async function seedMongoDB() {
  const uri = process.env.MONGODB_URI_RO;
  if (!uri) {
    console.error("MONGODB_URI_RO not set, skipping seed");
    return;
  }

  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db("reckon");
    const subnames = db.collection("subnames");

    const node = namehash(normalize(TEST_SUBNAME));

    const existing = await subnames.findOne({ namehash: node });
    if (existing) {
      console.log(`✓ Subname "${TEST_SUBNAME}" already seeded (namehash: ${node})`);
      return;
    }

    await subnames.insertOne({
      label: LABEL,
      namespace: "challengers",
      owner: TEST_OWNER,
      namehash: node,
      registeredAt: Date.now(),
    });
    console.log(`✓ Seeded "${TEST_SUBNAME}" into MongoDB (namehash: ${node})`);
  } finally {
    await client.close();
  }
}

async function resolveViaViem() {
  const client = createPublicClient({
    chain: mainnet,
    transport: http(ETHEREUM_RPC),
  });

  console.log("\n--- Resolving via viem (full CCIP-Read flow) ---\n");
  console.log(`Subname: ${TEST_SUBNAME}`);
  console.log(`RPC:     ${ETHEREUM_RPC}`);
  console.log("");

  // 2. Resolve text record: reckon.totalFills
  try {
    const fills = await client.getEnsText({
      name: normalize(TEST_SUBNAME),
      key: "reckon.totalFills",
    });
    console.log(`✓ text("reckon.totalFills") = "${fills}"`);
  } catch (err: any) {
    console.log(`✗ text("reckon.totalFills") failed: ${err.message}`);
  }

  // 3. Resolve address
  try {
    const addr = await client.getEnsAddress({
      name: normalize(TEST_SUBNAME),
    });
    console.log(`✓ addr() = "${addr}"`);
    if (addr?.toLowerCase() === TEST_OWNER.toLowerCase()) {
      console.log("  → matches expected owner");
    } else {
      console.log(`  ✗ expected "${TEST_OWNER}", got "${addr}"`);
    }
  } catch (err: any) {
    console.log(`✗ addr() failed: ${err.message}`);
  }

  console.log("\n--- Done ---");
}

async function main() {
  await seedMongoDB();
  await resolveViaViem();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
