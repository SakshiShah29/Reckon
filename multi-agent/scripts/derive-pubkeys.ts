import { readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m: Uint8Array[]) => {
  const h = sha512.create();
  for (const msg of m) h.update(msg);
  return h.digest();
};

const keysDir = "multi-agent/keys";
const results: string[] = [];

for (let i = 1; i <= 3; i++) {
  const pem = readFileSync(`${keysDir}/axl-identity-${i}.pem`, "utf-8");
  const keyObj = createPrivateKey(pem);
  const raw = keyObj.export({ type: "pkcs8", format: "der" });
  const seed = Buffer.from(raw.subarray(raw.length - 32)).toString("hex");
  const pubKey = Buffer.from(ed.getPublicKey(Buffer.from(seed, "hex"))).toString("hex");
  console.log(`Agent ${i}: ${pubKey}`);
  results.push(pubKey);
}

writeFileSync(`${keysDir}/pubkeys.txt`, results.join("\n") + "\n");
console.log(`\nSaved to ${keysDir}/pubkeys.txt`);
