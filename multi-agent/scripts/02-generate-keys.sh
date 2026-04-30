#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MULTI_AGENT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$MULTI_AGENT_DIR")"
KEYS_DIR="$MULTI_AGENT_DIR/keys"

# Use Homebrew OpenSSL on macOS (LibreSSL lacks Ed25519 support)
if [[ "$(uname)" == "Darwin" ]]; then
  OPENSSL="/opt/homebrew/opt/openssl/bin/openssl"
  if [ ! -f "$OPENSSL" ]; then
    echo "[keys] ERROR: Homebrew OpenSSL not found at $OPENSSL"
    echo "[keys] Install with: brew install openssl"
    exit 1
  fi
else
  OPENSSL="openssl"
fi

echo "=== Step 2: Generate Ed25519 PEM Keys ==="
echo "[keys] Using OpenSSL: $OPENSSL"

mkdir -p "$KEYS_DIR"

# Generate 3 PEM keys (skip if already exists)
for i in 1 2 3; do
  PEM_FILE="$KEYS_DIR/axl-identity-${i}.pem"
  if [ -f "$PEM_FILE" ]; then
    echo "[keys] axl-identity-${i}.pem already exists, skipping"
  else
    "$OPENSSL" genpkey -algorithm ed25519 -out "$PEM_FILE"
    echo "[keys] Generated axl-identity-${i}.pem"
  fi
done

# Also copy key 2 from inft-tools if it exists and we don't have one
if [ -f "$REPO_ROOT/inft-tools/axl-identity-2.pem" ] && [ ! -s "$KEYS_DIR/axl-identity-2.pem" ]; then
  cp "$REPO_ROOT/inft-tools/axl-identity-2.pem" "$KEYS_DIR/axl-identity-2.pem"
  echo "[keys] Copied existing axl-identity-2.pem from inft-tools"
fi

# Derive public keys using Node.js + @noble/ed25519
echo ""
echo "[keys] Deriving public keys..."

cd "$REPO_ROOT"

PUBKEYS_FILE="$KEYS_DIR/public-keys.txt"
cat > "$KEYS_DIR/_derive-pubkeys.mjs" << 'SCRIPT_EOF'
import { readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

ed.etc.sha512Sync = (...m) => {
  const h = sha512.create();
  for (const msg of m) h.update(msg);
  return h.digest();
};

const keysDir = process.argv[2];
const results = [];

for (let i = 1; i <= 3; i++) {
  const pemPath = `${keysDir}/axl-identity-${i}.pem`;
  try {
    const pem = readFileSync(pemPath, "utf-8");
    const keyObj = createPrivateKey(pem);
    const raw = keyObj.export({ type: "pkcs8", format: "der" });
    const seed = Buffer.from(raw.subarray(raw.length - 32)).toString("hex");
    const pubKey = Buffer.from(ed.getPublicKey(Buffer.from(seed, "hex"))).toString("hex");
    results.push({ agent: i, pubKey, pemPath });
    console.log(`  Agent ${i}: ${pubKey}`);
  } catch (err) {
    console.error(`  Agent ${i}: ERROR - ${err.message}`);
  }
}

writeFileSync(`${keysDir}/public-keys.txt`, results.map(r => `${r.agent}=${r.pubKey}`).join("\n") + "\n");
writeFileSync(`${keysDir}/public-keys.json`, JSON.stringify(results, null, 2));
SCRIPT_EOF

node --import tsx "$KEYS_DIR/_derive-pubkeys.mjs" "$KEYS_DIR"

echo ""
echo "[keys] Public keys saved to $PUBKEYS_FILE"
echo ""
cat "$PUBKEYS_FILE"
echo ""
echo "[keys] Done! Keys in: $KEYS_DIR/"
