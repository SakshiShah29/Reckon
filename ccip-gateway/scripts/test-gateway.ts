/**
 * Direct gateway test — calls the CCIP-Read endpoint and verifies the response.
 * Does NOT go through ENS. Useful for debugging the gateway in isolation.
 *
 * Usage:
 *   npx tsx scripts/test-gateway.ts [gateway-url] [resolver-address]
 *
 * Examples:
 *   npx tsx scripts/test-gateway.ts http://localhost:3000
 *   npx tsx scripts/test-gateway.ts https://gateway.reckon.fi 0x1234...
 */

import {
  encodeFunctionData,
  decodeAbiParameters,
  encodeAbiParameters,
  verifyTypedData,
  pad,
  keccak256,
  type Hex,
  type Address,
} from "viem";
import { namehash, normalize } from "viem/ens";

const GATEWAY_URL = process.argv[2] || "https://reckon-puwe.onrender.com";
const RESOLVER_ADDR = (process.argv[3] ||
  "0xb7C8876A5c1E94c33a8163E8F9B639554195ef43") as Address;

const TEST_SUBNAME = "alice.solvers.reckonprotocol.eth";

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

async function queryGateway(
  sender: string,
  callData: Hex,
  label: string
) {
  const url = `${GATEWAY_URL}/${sender}/${callData.slice(2)}.json`;
  console.log(`  GET ${url.substring(0, 80)}...`);

  const res = await fetch(url);
  const body = await res.json();

  if (res.status !== 200) {
    console.log(`  ✗ ${label}: HTTP ${res.status} — ${JSON.stringify(body)}`);
    return null;
  }

  const [result, expires, sig] = decodeAbiParameters(
    [{ type: "bytes" }, { type: "uint64" }, { type: "bytes" }],
    body.data as Hex
  );

  console.log(`  ✓ ${label}: HTTP 200`);
  console.log(`    expires: ${new Date(Number(expires) * 1000).toISOString()}`);

  return { result: result as Hex, expires, sig: sig as Hex, callData };
}

async function main() {
  console.log(`Gateway: ${GATEWAY_URL}`);
  console.log(`Sender:  ${RESOLVER_ADDR}`);
  console.log(`Subname: ${TEST_SUBNAME}`);
  console.log("");

  // 1. Health check
  try {
    const health = await fetch(`${GATEWAY_URL}/health`);
    const body = await health.json();
    console.log(`Health: ${JSON.stringify(body)}`);
  } catch (err: any) {
    console.log(`✗ Health check failed: ${err.message}`);
    return;
  }
  console.log("");

  // 2. Test debug route
  console.log("--- /test/:name debug route ---");
  try {
    const testRes = await fetch(`${GATEWAY_URL}/test/${TEST_SUBNAME}`);
    const testBody = await testRes.json();
    console.log(`  ${JSON.stringify(testBody, null, 2)}`);
  } catch (err: any) {
    console.log(`  ✗ Debug route failed: ${err.message}`);
  }
  console.log("");

  const node = namehash(normalize(TEST_SUBNAME));

  // 3. text(node, "reckon.reputation")
  console.log("--- CCIP-Read: text(reckon.reputation) ---");
  const textCall = encodeFunctionData({
    abi: textAbi,
    functionName: "text",
    args: [node as `0x${string}`, "reckon.reputation"],
  });
  const textResult = await queryGateway(RESOLVER_ADDR, textCall, "text");
  if (textResult) {
    const [value] = decodeAbiParameters(
      [{ type: "string" }],
      textResult.result
    );
    console.log(`    value: "${value}"`);
  }
  console.log("");

  // 4. addr(node)
  console.log("--- CCIP-Read: addr() ---");
  const addrCall = encodeFunctionData({
    abi: addrAbi,
    functionName: "addr",
    args: [node as `0x${string}`],
  });
  const addrResult = await queryGateway(RESOLVER_ADDR, addrCall, "addr");
  if (addrResult) {
    const [addr] = decodeAbiParameters(
      [{ type: "address" }],
      addrResult.result
    );
    console.log(`    address: "${addr}"`);
  }

  console.log("\n--- Done ---");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
