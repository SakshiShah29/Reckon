#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MULTI_AGENT_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$MULTI_AGENT_DIR")"
KEYS_DIR="$MULTI_AGENT_DIR/keys"
ENVS_DIR="$MULTI_AGENT_DIR/envs"

echo "=== Step 3: Provision Agents (Mint iNFTs) ==="

mkdir -p "$ENVS_DIR"

# Check if public keys exist
if [ ! -f "$KEYS_DIR/public-keys.json" ]; then
  echo "[provision] ERROR: Run 02-generate-keys.sh first"
  exit 1
fi

# ── Shared config ──
# Owner wallet (same for all agents — it mints the iNFTs)
PRIVATE_KEY="0xf36ab74a4872adcd123b055c56de0d0552ace17cc7f82b9db523b83cf48d2b14"
CHALLENGER_NFT_ADDRESS="0xc65389083725E4eF4eA3041e9c8412474a36e194"
CHALLENGER_ADDRESS=0x56764D715329bF70F6343900c07f298238C3b6c6
OWNER_REGISTRY_ADDRESS=0x4192F45355F52Af83b3AF4715A3D78a420b3a48B
ZG_RPC_URL="https://evmrpc-testnet.0g.ai"
ZG_INDEXER_URL="https://indexer-storage-testnet-turbo.0g.ai"
BASE_SEPOLIA_RPC=https://base-sepolia.g.alchemy.com/v2/Dp5FwElAg3eJPHhdUxBEFzOe5wF-ae0Y

# ── Per-agent wallets ──
# Agent 1: already provisioned (token 0), uses the owner wallet
# Agent 2: Anvil account #2
# Agent 3: Anvil account #3
AGENT2_PRIVATE_KEY="0x..."
AGENT2_ADDRESS="0xFdFa4fF359C9E06E82eF37300cA746CA189C22a4"

AGENT3_PRIVATE_KEY="0x..."
AGENT3_ADDRESS="0x654A9DEB79f8Fa946Be91A1106541Ed5B573865B"

echo ""
echo "Agent wallets:"
echo "  Agent 1: 0xbfC3d90156F2FF0412dEd13f6B26C2bF6C936976 (owner wallet)"
echo "  Agent 2: $AGENT2_ADDRESS (Anvil #2)"
echo "  Agent 3: $AGENT3_ADDRESS (Anvil #3)"
echo ""

# ── Provision Agent 2 ──
echo "[provision] Provisioning Agent 2 (axl-identity-2.pem)..."
cd "$REPO_ROOT/inft-tools"

cat > "$ENVS_DIR/.env.provision-agent2" << EOF
PRIVATE_KEY=$PRIVATE_KEY
CHALLENGER_NFT_ADDRESS=$CHALLENGER_NFT_ADDRESS
ZG_RPC_URL=$ZG_RPC_URL
ZG_INDEXER_URL=$ZG_INDEXER_URL
AXL_PEM_PATH=$KEYS_DIR/axl-identity-2.pem
AGENT_ADDRESS=$AGENT2_ADDRESS
AGENT_CHALLENGE_STRING=reckon-agent-auth-v1
MIN_SLASH_USDC=500000
MAX_BOND_PCT=90
ZG_MODEL=qwen/qwen-2.5-7b-instruct
CHALLENGER_ADDRESS=$CHALLENGER_ADDRESS
OWNER_REGISTRY_ADDRESS=$OWNER_REGISTRY_ADDRESS
BASE_SEPOLIA_RPC=$BASE_SEPOLIA_RPC
AGENT_PRIVATE_KEY=$AGENT2_PRIVATE_KEY
EOF

echo "[provision] Running provision for Agent 2..."
env $(cat "$ENVS_DIR/.env.provision-agent2" | grep -v '^#' | xargs) node --import tsx src/provision.ts 2>&1 | tee "$ENVS_DIR/provision-agent2.log"

echo ""

# ── Provision Agent 3 ──
echo "[provision] Provisioning Agent 3 (axl-identity-3.pem)..."

cat > "$ENVS_DIR/.env.provision-agent3" << EOF
PRIVATE_KEY=$PRIVATE_KEY
CHALLENGER_NFT_ADDRESS=$CHALLENGER_NFT_ADDRESS
ZG_RPC_URL=$ZG_RPC_URL
ZG_INDEXER_URL=$ZG_INDEXER_URL
AXL_PEM_PATH=$KEYS_DIR/axl-identity-3.pem
AGENT_ADDRESS=$AGENT3_ADDRESS
AGENT_CHALLENGE_STRING=reckon-agent-auth-v1
MIN_SLASH_USDC=500000
MAX_BOND_PCT=90
ZG_MODEL=qwen/qwen-2.5-7b-instruct
CHALLENGER_ADDRESS=$CHALLENGER_ADDRESS
OWNER_REGISTRY_ADDRESS=$OWNER_REGISTRY_ADDRESS
BASE_SEPOLIA_RPC=$BASE_SEPOLIA_RPC
AGENT_PRIVATE_KEY=$AGENT3_PRIVATE_KEY
EOF

echo "[provision] Running provision for Agent 3..."
env $(cat "$ENVS_DIR/.env.provision-agent3" | grep -v '^#' | xargs) node --import tsx src/provision.ts 2>&1 | tee "$ENVS_DIR/provision-agent3.log"

echo ""
echo "=== Provisioning complete ==="
echo ""
echo "IMPORTANT: Note the AGENT_TOKEN_ID and OWNER_SIGNATURE from each provision output above."
echo "You'll need them for the agent .env files."
echo ""
echo "Provision logs saved to:"
echo "  $ENVS_DIR/provision-agent2.log"
echo "  $ENVS_DIR/provision-agent3.log"
