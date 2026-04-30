#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MULTI_AGENT_DIR="$(dirname "$SCRIPT_DIR")"
ENVS_DIR="$MULTI_AGENT_DIR/envs"

echo "=== Step 6: Generate Agent .env Files ==="

# Load AXL public keys
if [ ! -f "$MULTI_AGENT_DIR/axl-pubkeys.env" ]; then
  echo "[env] ERROR: Run 05-start-axl-mesh.sh first to get public keys"
  exit 1
fi
source "$MULTI_AGENT_DIR/axl-pubkeys.env"

echo "[env] AXL public keys loaded:"
echo "  Hub:     ${HUB_KEY:0:16}..."
echo "  Spoke A: ${SPOKE_A_KEY:0:16}..."
echo "  Spoke B: ${SPOKE_B_KEY:0:16}..."
echo ""

# ── Shared config ──
BASE_RPC_URL="http://147.182.164.208:8545"
ZG_RPC_URL="https://evmrpc-testnet.0g.ai"
ZG_INDEXER_URL="https://indexer-storage-testnet-turbo.0g.ai"

echo "[env] You need to fill in the following values from your single-agent setup"
echo "      and the provision outputs from step 3."
echo ""

# Prompt for contract addresses (or use defaults from indexer .env)
read -p "FILL_REGISTRY_ADDRESS [0x6Cd4d964254CE6B43F266F4B26264E10B886189C]: " FILL_REGISTRY
FILL_REGISTRY="${FILL_REGISTRY:-0x6Cd4d964254CE6B43F266F4B26264E10B886189C}"

read -p "CHALLENGER_ADDRESS [0x9C4017bB47a2b693994EAD02e087428FD9087eC0]: " CHALLENGER_ADDR
CHALLENGER_ADDR="${CHALLENGER_ADDR:-0x9C4017bB47a2b693994EAD02e087428FD9087eC0}"

read -p "CHALLENGER_REGISTRY_ADDRESS: " CHALLENGER_REG
read -p "SOLVER_BOND_VAULT_ADDRESS: " BOND_VAULT
read -p "ZG_COMPUTE_PROVIDER_ADDRESS: " COMPUTE_PROVIDER

# Agent 1 values (already provisioned)
echo ""
echo "--- Agent 1 (already provisioned, token 0) ---"
read -p "Agent 1 OWNER_SIGNATURE: " AGENT1_OWNER_SIG
AGENT1_PRIVATE_KEY="0xf36ab74a4872adcd123b055c56de0d0552ace17cc7f82b9db523b83cf48d2b14"

# Agent 2 values (from provision output)
echo ""
echo "--- Agent 2 (from provision-agent2.log) ---"
read -p "Agent 2 AGENT_TOKEN_ID: " AGENT2_TOKEN_ID
read -p "Agent 2 OWNER_SIGNATURE: " AGENT2_OWNER_SIG
AGENT2_PRIVATE_KEY="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"

# Agent 3 values (from provision output)
echo ""
echo "--- Agent 3 (from provision-agent3.log) ---"
read -p "Agent 3 AGENT_TOKEN_ID: " AGENT3_TOKEN_ID
read -p "Agent 3 OWNER_SIGNATURE: " AGENT3_OWNER_SIG
AGENT3_PRIVATE_KEY="0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"

# ── Generate .env files ──
mkdir -p "$ENVS_DIR"

cat > "$ENVS_DIR/agent1.env" << EOF
# Agent 1 — Hub (AXL port 9002)
BASE_RPC_URL=$BASE_RPC_URL
ZG_RPC_URL=$ZG_RPC_URL
ZG_INDEXER_URL=$ZG_INDEXER_URL
ZG_AGENT_PRIVATE_KEY=$AGENT1_PRIVATE_KEY
AGENT_TOKEN_ID=0
OWNER_SIGNATURE=$AGENT1_OWNER_SIG
ZG_COMPUTE_PROVIDER_ADDRESS=$COMPUTE_PROVIDER
FILL_REGISTRY_ADDRESS=$FILL_REGISTRY
CHALLENGER_ADDRESS=$CHALLENGER_ADDR
CHALLENGER_REGISTRY_ADDRESS=$CHALLENGER_REG
SOLVER_BOND_VAULT_ADDRESS=$BOND_VAULT
AXL_API_URL=http://127.0.0.1:9002
AXL_PEER_KEYS=$SPOKE_A_KEY,$SPOKE_B_KEY
RELAYER_URL=http://localhost:10000
CHALLENGER_LABEL=challenger-1
HEADLESS_MODE=false
EOF

cat > "$ENVS_DIR/agent2.env" << EOF
# Agent 2 — Spoke A (AXL port 9012)
BASE_RPC_URL=$BASE_RPC_URL
ZG_RPC_URL=$ZG_RPC_URL
ZG_INDEXER_URL=$ZG_INDEXER_URL
ZG_AGENT_PRIVATE_KEY=$AGENT2_PRIVATE_KEY
AGENT_TOKEN_ID=$AGENT2_TOKEN_ID
OWNER_SIGNATURE=$AGENT2_OWNER_SIG
ZG_COMPUTE_PROVIDER_ADDRESS=$COMPUTE_PROVIDER
FILL_REGISTRY_ADDRESS=$FILL_REGISTRY
CHALLENGER_ADDRESS=$CHALLENGER_ADDR
CHALLENGER_REGISTRY_ADDRESS=$CHALLENGER_REG
SOLVER_BOND_VAULT_ADDRESS=$BOND_VAULT
AXL_API_URL=http://127.0.0.1:9012
AXL_PEER_KEYS=$HUB_KEY,$SPOKE_B_KEY
RELAYER_URL=http://localhost:10000
CHALLENGER_LABEL=challenger-2
HEADLESS_MODE=false
EOF

cat > "$ENVS_DIR/agent3.env" << EOF
# Agent 3 — Spoke B (AXL port 9022)
BASE_RPC_URL=$BASE_RPC_URL
ZG_RPC_URL=$ZG_RPC_URL
ZG_INDEXER_URL=$ZG_INDEXER_URL
ZG_AGENT_PRIVATE_KEY=$AGENT3_PRIVATE_KEY
AGENT_TOKEN_ID=$AGENT3_TOKEN_ID
OWNER_SIGNATURE=$AGENT3_OWNER_SIG
ZG_COMPUTE_PROVIDER_ADDRESS=$COMPUTE_PROVIDER
FILL_REGISTRY_ADDRESS=$FILL_REGISTRY
CHALLENGER_ADDRESS=$CHALLENGER_ADDR
CHALLENGER_REGISTRY_ADDRESS=$CHALLENGER_REG
SOLVER_BOND_VAULT_ADDRESS=$BOND_VAULT
AXL_API_URL=http://127.0.0.1:9022
AXL_PEER_KEYS=$HUB_KEY,$SPOKE_A_KEY
RELAYER_URL=http://localhost:10000
CHALLENGER_LABEL=challenger-3
HEADLESS_MODE=false
EOF

echo ""
echo "=== Agent .env files generated ==="
echo "  $ENVS_DIR/agent1.env (Hub, token 0, AXL :9002)"
echo "  $ENVS_DIR/agent2.env (Spoke A, token $AGENT2_TOKEN_ID, AXL :9012)"
echo "  $ENVS_DIR/agent3.env (Spoke B, token $AGENT3_TOKEN_ID, AXL :9022)"
echo ""
echo "To start agents (in 3 separate terminals):"
echo "  cd agent && env \$(cat ../multi-agent/envs/agent1.env | grep -v '^#' | xargs) npm run start"
echo "  cd agent && env \$(cat ../multi-agent/envs/agent2.env | grep -v '^#' | xargs) npm run start"
echo "  cd agent && env \$(cat ../multi-agent/envs/agent3.env | grep -v '^#' | xargs) npm run start"
