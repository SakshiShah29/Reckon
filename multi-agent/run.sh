#!/usr/bin/env bash
##############################################################################
# Reckon Multi-Agent Setup — Two-Chain Architecture
#
#   cd multi-agent && bash run.sh
#
# Architecture:
#   - Anvil fork (147.182.164.208:8545) → swap event listening + EBBO pools
#   - Base Sepolia                      → protocol contracts (FillRegistry, Challenger, etc.)
#   - 0G Galileo                        → ChallengerNFT iNFTs
#
# What it does (in order):
#   1. Build AXL binary from source (skips if exists)
#   2. Generate 3 Ed25519 PEM keys (skips if exist)
#   3. Start 3-node AXL mesh (hub + 2 spokes)
#   4. Rebuild TypeScript packages (types + inft-tools)
#   5. Provision agents on 0G Galileo (mint iNFTs)
#   6. Generate agent .env files
#   7. Start all 3 challenger agents
#
# Prerequisites:
#   - Go 1.25+ installed
#   - Homebrew OpenSSL on macOS (brew install openssl)
#   - npm install already run at repo root
#   - Anvil fork running at ANVIL_RPC
#   - Contracts already deployed on Base Sepolia
#
# Environment overrides:
#   SKIP_PROVISION     — Set to "true" to skip 0G Galileo provisioning
#   SKIP_AXL_BUILD     — Set to "true" to skip AXL binary build
##############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
KEYS_DIR="$SCRIPT_DIR/keys"
CONFIGS_DIR="$SCRIPT_DIR/configs"
LOGS_DIR="$SCRIPT_DIR/logs"
AXL_DIR="$SCRIPT_DIR/axl"

# ── Two-Chain Config ─────────────────────────────────────────
ANVIL_RPC="http://127.0.0.1:8545"
BASE_SEPOLIA_RPC="https://base-sepolia.g.alchemy.com/v2/Dp5FwElAg3eJPHhdUxBEFzOe5wF-ae0Y"
ZG_RPC_URL="https://evmrpc-testnet.0g.ai"
ZG_INDEXER_URL="https://indexer-storage-testnet-turbo.0g.ai"
CHALLENGE_STRING="reckon-agent-auth-v1"

# Owner wallet (provisions iNFTs on 0G Galileo)
OWNER_PRIVATE_KEY="0xf36ab74a4872adcd123b055c56de0d0552ace17cc7f82b9db523b83cf48d2b14"

# ChallengerNFT on 0G Galileo
CHALLENGER_NFT_ADDRESS="0x98b6D75380FC3Cb3483D88f6178A128e848582a0"

# Base Sepolia contract addresses (pre-deployed)
FILL_REGISTRY="0xb2f6cDEe56CcA45c9D7AeFe6E268C013C23a0C1D"
CHALLENGER_CONTRACT="0xc249d4BDF82e3ba86C5Ddc16f58A031994b8E6cE"
CHALLENGER_REGISTRY="0x34D283590D58B56d0c92e6b3e2c4cD7C9E432678"
SOLVER_BOND_VAULT="0x8195ba15E335A4205c2bA2d928dC8BCd563CC783"

# Agent wallets (real, not Anvil defaults)
AGENT1_PK="0x7d405f33eea3d209f029796fc11d1e11dbeb4ce7f19a38aa8066098d4d2766c7"
AGENT1_ADDR="0xbfC3d90156F2FF0412dEd13f6B26C2bF6C936976"

AGENT2_PK="0x7a5fc5e4bd673c0502071b2ff3a18cdb6f60ac17ed8057679e361c940330dd72"
AGENT2_ADDR="0xFdFa4fF359C9E06E82eF37300cA746CA189C22a4"

AGENT3_PK="0xc66ed1f2a2d33edcb1b5809e8c74023fd4b2cca396875e23d2229a3578a64a77"
AGENT3_ADDR="0x654A9DEB79f8Fa946Be91A1106541Ed5B573865B"

# KeeperHub
KH_WEBHOOK_URL="https://app.keeperhub.com/api/workflows/krgoqq0af5urb1k8vnww7/webhook"
KH_WEBHOOK_API_KEY="wfb_NDD8eSj-eWftj17kPCtvtQMZ8EoYeYEd"
KH_API_KEY="kh_0NxSwyj3anqqqJppiQp56v_oYG5GgLe9"

# 0G Compute
ZG_API_KEY="sk-6dc7300b-9c85-4c86-9d99-114d113069ad"

# Owner signature (shared across all agents — same owner)
OWNER_SIGNATURE="0x4c933e0867de5400e046f0fc04a3786b70129e07aa159d706944d5b3205cd4ed1144a576f5a7fc5e787e16a9dea46c8de0862c71eae37e603d1d91853d8adcf31c"

mkdir -p "$KEYS_DIR" "$CONFIGS_DIR" "$LOGS_DIR"

fail() { echo ""; echo "ERROR: $1"; exit 1; }

echo "╔══════════════════════════════════════════════════════╗"
echo "║   Reckon Multi-Agent Setup (Two-Chain + KeeperHub)  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Anvil fork:    $ANVIL_RPC    ║"
echo "║  Base Sepolia:  contracts chain                     ║"
echo "║  0G Galileo:    ChallengerNFT iNFTs                 ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

##############################################################################
# 1. BUILD AXL
##############################################################################
echo "━━━ [1/7] Build AXL binary ━━━"

if [ "${SKIP_AXL_BUILD:-false}" = "true" ] && [ -f "$AXL_DIR/node" ]; then
  echo "  ✓ Skipping AXL build (SKIP_AXL_BUILD=true)"
elif [ -f "$AXL_DIR/node" ]; then
  echo "  ✓ AXL binary already exists, skipping build"
else
  if [ ! -d "$AXL_DIR" ]; then
    echo "  Cloning gensyn-ai/axl..."
    git clone https://github.com/gensyn-ai/axl.git "$AXL_DIR"
  fi
  echo "  Building with GOTOOLCHAIN=go1.25.5..."
  (cd "$AXL_DIR" && GOTOOLCHAIN=go1.25.5 go build -o node ./cmd/node/) || fail "AXL build failed"
  echo "  ✓ AXL binary built ($(du -h "$AXL_DIR/node" | cut -f1))"
fi

##############################################################################
# 2. GENERATE ED25519 KEYS
##############################################################################
echo ""
echo "━━━ [2/7] Generate Ed25519 PEM keys ━━━"

if [[ "$(uname)" == "Darwin" ]]; then
  OPENSSL="/opt/homebrew/opt/openssl/bin/openssl"
  [ -f "$OPENSSL" ] || fail "Homebrew OpenSSL not found. Run: brew install openssl"
else
  OPENSSL="openssl"
fi

for i in 1 2 3; do
  PEM="$KEYS_DIR/axl-identity-${i}.pem"
  if [ -f "$PEM" ]; then
    echo "  ✓ axl-identity-${i}.pem exists"
  else
    "$OPENSSL" genpkey -algorithm ed25519 -out "$PEM"
    echo "  ✓ Generated axl-identity-${i}.pem"
  fi
done

##############################################################################
# 3. START AXL MESH
##############################################################################
echo ""
echo "━━━ [3/7] Start AXL mesh (hub + 2 spokes) ━━━"

# Kill any existing AXL nodes
for PORT in 9001 9002 9012 9022; do
  lsof -ti :$PORT 2>/dev/null | xargs kill 2>/dev/null || true
done
sleep 1

# Generate configs
cat > "$CONFIGS_DIR/hub.json" << EOF
{
  "PrivateKeyPath": "$KEYS_DIR/axl-identity-1.pem",
  "Peers": [],
  "Listen": ["tls://127.0.0.1:9001"],
  "api_port": 9002,
  "tcp_port": 7000
}
EOF

cat > "$CONFIGS_DIR/spoke-a.json" << EOF
{
  "PrivateKeyPath": "$KEYS_DIR/axl-identity-2.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9012,
  "tcp_port": 7000
}
EOF

cat > "$CONFIGS_DIR/spoke-b.json" << EOF
{
  "PrivateKeyPath": "$KEYS_DIR/axl-identity-3.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9022,
  "tcp_port": 7000
}
EOF

"$AXL_DIR/node" -config "$CONFIGS_DIR/hub.json" > "$LOGS_DIR/hub.log" 2>&1 &
HUB_PID=$!
sleep 3

"$AXL_DIR/node" -config "$CONFIGS_DIR/spoke-a.json" > "$LOGS_DIR/spoke-a.log" 2>&1 &
SPOKE_A_PID=$!
sleep 2

"$AXL_DIR/node" -config "$CONFIGS_DIR/spoke-b.json" > "$LOGS_DIR/spoke-b.log" 2>&1 &
SPOKE_B_PID=$!
sleep 3

cat > "$SCRIPT_DIR/axl-pids.txt" << EOF
HUB=$HUB_PID
SPOKE_A=$SPOKE_A_PID
SPOKE_B=$SPOKE_B_PID
EOF

# Verify mesh
HUB_PEERS=$(curl -s --max-time 5 "http://127.0.0.1:9002/topology" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('peers',[])))" 2>/dev/null || echo "0")
if [ "$HUB_PEERS" -ge 2 ]; then
  echo "  ✓ Hub sees $HUB_PEERS peers — mesh connected"
else
  echo "  ⚠ Hub sees $HUB_PEERS peers (expected 2). Mesh may need more time."
fi

# Extract public keys from running nodes
HUB_KEY=$(curl -s "http://127.0.0.1:9002/topology" | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")
SPOKE_A_KEY=$(curl -s "http://127.0.0.1:9012/topology" | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")
SPOKE_B_KEY=$(curl -s "http://127.0.0.1:9022/topology" | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")

echo "  Hub key:     ${HUB_KEY:0:16}..."
echo "  Spoke A key: ${SPOKE_A_KEY:0:16}..."
echo "  Spoke B key: ${SPOKE_B_KEY:0:16}..."

##############################################################################
# 4. REBUILD TS PACKAGES
##############################################################################
echo ""
echo "━━━ [4/7] Rebuild TypeScript packages ━━━"

(cd "$REPO_ROOT/packages/types" && npm run build) 2>&1 | tail -1
echo "  ✓ @reckon-protocol/types built"

(cd "$REPO_ROOT/inft-tools" && npm run build) 2>&1 | tail -1
echo "  ✓ @reckon-protocol/inft-tools built"

##############################################################################
# 5. PROVISION AGENTS ON 0G GALILEO
##############################################################################
echo ""
echo "━━━ [5/7] Provision agents on 0G Galileo ━━━"

PROVISION_DATA_FILE="$SCRIPT_DIR/provision-data.json"

if [ "${SKIP_PROVISION:-false}" = "true" ] && [ -f "$PROVISION_DATA_FILE" ]; then
  echo "  ✓ Skipping provision (SKIP_PROVISION=true, using cached data)"
else
  # Agent 1 is already provisioned (token #0)
  if [ ! -f "$PROVISION_DATA_FILE" ]; then
    echo '{}' > "$PROVISION_DATA_FILE"
  fi

  # Check if agent1 data already exists
  HAS_AGENT1=$(python3 -c "import json; d=json.load(open('$PROVISION_DATA_FILE')); print('yes' if 'agent1' in d else 'no')" 2>/dev/null || echo "no")

  if [ "$HAS_AGENT1" = "no" ]; then
    echo "  Agent 1 already provisioned (token #0) — saving known data"
    python3 -c "
import json
with open('$PROVISION_DATA_FILE') as f: d = json.load(f)
d['agent1'] = {
  'tokenId': '0',
  'ownerSignature': '$OWNER_SIGNATURE',
  'rootHash': '0xf9b98c78606c7ca007e8c8cefd6c7d7906b9a400af0223659e814c89442312e4'
}
with open('$PROVISION_DATA_FILE', 'w') as f: json.dump(d, f, indent=2)
"
    echo "  ✓ Agent 1 → iNFT #0 (pre-provisioned)"
  else
    echo "  ✓ Agent 1 data cached"
  fi

  # Provision agents 2 and 3 if not yet provisioned
  for i in 2 3; do
    HAS_AGENT=$(python3 -c "import json; d=json.load(open('$PROVISION_DATA_FILE')); print('yes' if 'agent$i' in d else 'no')" 2>/dev/null || echo "no")
    if [ "$HAS_AGENT" = "yes" ]; then
      echo "  ✓ Agent $i data cached"
      continue
    fi

    AGENT_ADDR_VAR=""
    if [ "$i" = "2" ]; then AGENT_ADDR_VAR="AGENT_ADDRESS=$AGENT2_ADDR"; fi
    if [ "$i" = "3" ]; then AGENT_ADDR_VAR="AGENT_ADDRESS=$AGENT3_ADDR"; fi

    ENV_FILE="$SCRIPT_DIR/.env.provision-${i}"
    cat > "$ENV_FILE" << ENVEOF
PRIVATE_KEY=$OWNER_PRIVATE_KEY
CHALLENGER_NFT_ADDRESS=$CHALLENGER_NFT_ADDRESS
ZG_RPC_URL=$ZG_RPC_URL
ZG_INDEXER_URL=$ZG_INDEXER_URL
AXL_PEM_PATH=$KEYS_DIR/axl-identity-${i}.pem
AGENT_CHALLENGE_STRING=$CHALLENGE_STRING
MIN_SLASH_USDC=500000
MAX_BOND_PCT=90
ZG_MODEL=GLM-5-FP8
${AGENT_ADDR_VAR}
ENVEOF

    echo "  Provisioning Agent ${i}..."
    OUTPUT=$(cd "$REPO_ROOT/inft-tools" && env $(cat "$ENV_FILE" | grep -v '^#' | grep -v '^$' | xargs) npx tsx src/provision.ts 2>&1) || {
      echo "  ⚠ Agent $i provision failed:"
      echo "$OUTPUT" | tail -5
      fail "Provision failed for agent $i"
    }

    TOKEN_ID=$(echo "$OUTPUT" | grep "^AGENT_TOKEN_ID=" | cut -d= -f2)
    OWNER_SIG=$(echo "$OUTPUT" | grep "^OWNER_SIGNATURE=" | cut -d= -f2)
    ROOT_HASH=$(echo "$OUTPUT" | grep "^BRAIN_ROOT_HASH=" | cut -d= -f2)

    python3 -c "
import json
with open('$PROVISION_DATA_FILE') as f: d = json.load(f)
d['agent$i'] = {'tokenId': '$TOKEN_ID', 'ownerSignature': '$OWNER_SIG', 'rootHash': '$ROOT_HASH'}
with open('$PROVISION_DATA_FILE', 'w') as f: json.dump(d, f, indent=2)
"
    echo "  ✓ Agent $i → iNFT #$TOKEN_ID (root: ${ROOT_HASH:0:16}...)"
    rm -f "$ENV_FILE"
  done
fi

# Load provision data
AGENT1_TOKEN=$(python3 -c "import json; print(json.load(open('$PROVISION_DATA_FILE'))['agent1']['tokenId'])")
AGENT1_SIG=$(python3 -c "import json; print(json.load(open('$PROVISION_DATA_FILE'))['agent1']['ownerSignature'])")
AGENT1_ROOT=$(python3 -c "import json; print(json.load(open('$PROVISION_DATA_FILE'))['agent1']['rootHash'])")

AGENT2_TOKEN=$(python3 -c "import json; print(json.load(open('$PROVISION_DATA_FILE'))['agent2']['tokenId'])")
AGENT2_SIG=$(python3 -c "import json; print(json.load(open('$PROVISION_DATA_FILE'))['agent2']['ownerSignature'])")
AGENT2_ROOT=$(python3 -c "import json; print(json.load(open('$PROVISION_DATA_FILE'))['agent2']['rootHash'])")

AGENT3_TOKEN=$(python3 -c "import json; print(json.load(open('$PROVISION_DATA_FILE'))['agent3']['tokenId'])")
AGENT3_SIG=$(python3 -c "import json; print(json.load(open('$PROVISION_DATA_FILE'))['agent3']['ownerSignature'])")
AGENT3_ROOT=$(python3 -c "import json; print(json.load(open('$PROVISION_DATA_FILE'))['agent3']['rootHash'])")

##############################################################################
# 6. GENERATE AGENT .ENV FILES
##############################################################################
echo ""
echo "━━━ [6/7] Generate agent .env files ━━━"

AGENT_DIR="$REPO_ROOT/agent"

write_agent_env() {
  local num=$1 token_id=$2 sig=$3 root_hash=$4 priv_key=$5 axl_port=$6 peer_keys=$7

  cat > "$AGENT_DIR/.env.agent${num}" << ENVEOF
# Agent $num — auto-generated by multi-agent/run.sh (two-chain setup)
# Contracts chain (Base Sepolia)
BASE_RPC_URL=$BASE_SEPOLIA_RPC
# EBBO pool reads (Anvil fork of Base mainnet)
ANVIL_RPC_URL=$ANVIL_RPC
# 0G
ZG_RPC_URL=$ZG_RPC_URL
ZG_INDEXER_URL=$ZG_INDEXER_URL

# Agent identity
AGENT_TOKEN_ID=$token_id
AGENT_CHALLENGE_STRING=$CHALLENGE_STRING
ZG_AGENT_PRIVATE_KEY=$priv_key
OWNER_SIGNATURE=$sig
BRAIN_ROOT_HASH=$root_hash
CHALLENGER_NFT_ADDRESS=$CHALLENGER_NFT_ADDRESS

# Base Sepolia contracts
FILL_REGISTRY_ADDRESS=$FILL_REGISTRY
CHALLENGER_ADDRESS=$CHALLENGER_CONTRACT
CHALLENGER_REGISTRY_ADDRESS=$CHALLENGER_REGISTRY
SOLVER_BOND_VAULT_ADDRESS=$SOLVER_BOND_VAULT

# 0G Compute
ZG_API_KEY=$ZG_API_KEY

# KeeperHub
KH_WEBHOOK_URL=$KH_WEBHOOK_URL
KH_WEBHOOK_API_KEY=$KH_WEBHOOK_API_KEY
KH_API_KEY=$KH_API_KEY

# AXL mesh
AXL_API_URL=http://127.0.0.1:$axl_port
AXL_PEER_KEYS=$peer_keys

HEADLESS_MODE=false
ENVEOF

  echo "  ✓ agent/.env.agent${num}"
}

write_agent_env 1 "$AGENT1_TOKEN" "$AGENT1_SIG" "$AGENT1_ROOT" "$AGENT1_PK" 9002 "$SPOKE_A_KEY,$SPOKE_B_KEY"
write_agent_env 2 "$AGENT2_TOKEN" "$AGENT2_SIG" "$AGENT2_ROOT" "$AGENT2_PK" 9012 "$HUB_KEY,$SPOKE_B_KEY"
write_agent_env 3 "$AGENT3_TOKEN" "$AGENT3_SIG" "$AGENT3_ROOT" "$AGENT3_PK" 9022 "$HUB_KEY,$SPOKE_A_KEY"

##############################################################################
# 7. START AGENTS
##############################################################################
echo ""
echo "━━━ [7/7] Start challenger agents ━━━"

# Kill any old agents
pkill -f "DOTENV_CONFIG_PATH=.*agent.*src/index.ts" 2>/dev/null || true
sleep 1

for i in 1 2 3; do
  DOTENV_CONFIG_PATH="$AGENT_DIR/.env.agent${i}" \
    nohup node --import tsx "$AGENT_DIR/src/index.ts" > "$LOGS_DIR/agent-${i}.log" 2>&1 &
  echo "  ✓ Agent $i started (PID: $!)"
done

# Wait for agents to boot
echo "  Waiting for agents to boot (downloading brain blobs from 0G)..."
sleep 15

# Check boot status
for i in 1 2 3; do
  if grep -q "Pipeline: triage" "$LOGS_DIR/agent-${i}.log" 2>/dev/null; then
    echo "  ✓ Agent $i: running"
  elif grep -q "Two-chain mode" "$LOGS_DIR/agent-${i}.log" 2>/dev/null; then
    echo "  ✓ Agent $i: running (two-chain mode)"
  else
    echo "  ⚠ Agent $i: still booting (check logs/agent-${i}.log)"
  fi
done

##############################################################################
# DONE
##############################################################################
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║         Multi-Agent Setup Complete (v2)             ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                    ║"
echo "║  Architecture:                                     ║"
echo "║    Anvil fork  → EBBO pool reads                   ║"
echo "║    Base Sepolia → FillRegistry, Challenger         ║"
echo "║    0G Galileo  → ChallengerNFT iNFTs               ║"
echo "║                                                    ║"
echo "║  AXL Mesh:  3 nodes (hub:9002, spoke-a:9012,      ║"
echo "║             spoke-b:9022)                          ║"
echo "║                                                    ║"
echo "║  KeeperHub: webhook challenge submission enabled   ║"
echo "║                                                    ║"
echo "║  Agents:    3 challengers listening for fills      ║"
echo "║             on Base Sepolia FillRegistry           ║"
echo "║                                                    ║"
echo "║  Logs:      multi-agent/logs/agent-{1,2,3}.log    ║"
echo "║                                                    ║"
echo "║  Pipeline:  triage → ebbo → coordinate → decide   ║"
echo "║             → submit (via KeeperHub webhook)       ║"
echo "║                                                    ║"
echo "║  To stop:   bash multi-agent/stop.sh               ║"
echo "║                                                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Watch agent activity:"
echo "  tail -f multi-agent/logs/agent-1.log"
echo "  tail -f multi-agent/logs/agent-2.log"
echo "  tail -f multi-agent/logs/agent-3.log"
