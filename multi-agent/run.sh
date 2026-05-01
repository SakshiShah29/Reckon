#!/usr/bin/env bash
##############################################################################
# Reckon Multi-Agent Setup — single command
#
#   cd multi-agent && bash run.sh
#
# What it does (in order):
#   1. Build AXL binary from source (skips if exists)
#   2. Generate 3 Ed25519 PEM keys (skips if exist)
#   3. Start 3-node AXL mesh (hub + 2 spokes)
#   4. Rebuild TypeScript packages (types + inft-tools)
#   5. Provision 3 agents on 0G Galileo (mint iNFTs)
#   6. Deploy contracts on Anvil fork
#   7. Register solver + deposit bond
#   8. Fund all 3 agents with ETH + USDC
#   9. Generate agent .env files
#  10. Start all 3 challenger agents
#  11. Submit a bad fill to trigger the pipeline
#
# Prerequisites:
#   - Go 1.25+ installed
#   - Homebrew OpenSSL on macOS (brew install openssl)
#   - Foundry (forge + cast)
#   - npm install already run at repo root
#   - Anvil fork running at ANVIL_RPC (default: http://147.182.164.208:8545)
#
# Environment overrides:
#   ANVIL_RPC          — Anvil fork URL (default: http://147.182.164.208:8545)
#   OWNER_PRIVATE_KEY  — Wallet with OG tokens on Galileo for minting
#   SKIP_PROVISION     — Set to "true" to skip 0G Galileo provisioning
#   SKIP_BAD_FILL      — Set to "true" to skip test fill submission
##############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
KEYS_DIR="$SCRIPT_DIR/keys"
CONFIGS_DIR="$SCRIPT_DIR/configs"
LOGS_DIR="$SCRIPT_DIR/logs"
AXL_DIR="$SCRIPT_DIR/axl"

# ── Config ────────────────────────────────────────────────────
ANVIL_RPC="${ANVIL_RPC:-http://147.182.164.208:8545}"
OWNER_PRIVATE_KEY="${OWNER_PRIVATE_KEY:-0xf36ab74a4872adcd123b055c56de0d0552ace17cc7f82b9db523b83cf48d2b14}"
CHALLENGER_NFT_ADDRESS="0xBfa01f3869d80Fdc45E861b4849199C581d2Ac9e"
ZG_RPC_URL="https://evmrpc-testnet.0g.ai"
ZG_INDEXER_URL="https://indexer-storage-testnet-turbo.0g.ai"
CHALLENGE_STRING="reckon-agent-auth-v1"

# Anvil well-known private keys
DEPLOYER_PK="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
AGENT2_PK="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
AGENT3_PK="0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
SOLVER_PK="0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba"

AGENT2_ADDR="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
AGENT3_ADDR="0x90F79bf6EB2c4f870365E785982E1f101E93b906"
SOLVER_ADDR="0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"

mkdir -p "$KEYS_DIR" "$CONFIGS_DIR" "$LOGS_DIR"

fail() { echo ""; echo "ERROR: $1"; exit 1; }

echo "╔══════════════════════════════════════════════════════╗"
echo "║       Reckon Multi-Agent Setup (one command)        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Anvil RPC:  $ANVIL_RPC"
echo "  Repo root:  $REPO_ROOT"
echo ""

##############################################################################
# 1. BUILD AXL
##############################################################################
echo "━━━ [1/11] Build AXL binary ━━━"

if [ -f "$AXL_DIR/node" ]; then
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
echo "━━━ [2/11] Generate Ed25519 PEM keys ━━━"

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
echo "━━━ [3/11] Start AXL mesh (hub + 2 spokes) ━━━"

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
echo "━━━ [4/11] Rebuild TypeScript packages ━━━"

(cd "$REPO_ROOT/packages/types" && npm run build) 2>&1 | tail -1
echo "  ✓ @reckon-protocol/types built"

(cd "$REPO_ROOT/inft-tools" && npm run build) 2>&1 | tail -1
echo "  ✓ @reckon-protocol/inft-tools built"

##############################################################################
# 5. PROVISION AGENTS ON 0G GALILEO
##############################################################################
echo ""
echo "━━━ [5/11] Provision agents on 0G Galileo ━━━"

PROVISION_DATA_FILE="$SCRIPT_DIR/provision-data.json"

if [ "${SKIP_PROVISION:-false}" = "true" ] && [ -f "$PROVISION_DATA_FILE" ]; then
  echo "  ✓ Skipping provision (SKIP_PROVISION=true, using cached data)"
else
  # Create provision env files
  for i in 1 2 3; do
    ENV_FILE="$SCRIPT_DIR/.env.provision-${i}"
    AGENT_ADDR_VAR=""
    if [ "$i" = "2" ]; then AGENT_ADDR_VAR="AGENT_ADDRESS=$AGENT2_ADDR"; fi
    if [ "$i" = "3" ]; then AGENT_ADDR_VAR="AGENT_ADDRESS=$AGENT3_ADDR"; fi

    cat > "$ENV_FILE" << ENVEOF
PRIVATE_KEY=$OWNER_PRIVATE_KEY
CHALLENGER_NFT_ADDRESS=$CHALLENGER_NFT_ADDRESS
ZG_RPC_URL=$ZG_RPC_URL
ZG_INDEXER_URL=$ZG_INDEXER_URL
AXL_PEM_PATH=$KEYS_DIR/axl-identity-${i}.pem
AGENT_CHALLENGE_STRING=$CHALLENGE_STRING
MIN_SLASH_USDC=500000
MAX_BOND_PCT=90
ZG_MODEL=qwen/qwen-2.5-7b-instruct
${AGENT_ADDR_VAR}
ENVEOF
  done

  # Run provision for each agent and capture output
  echo '{}' > "$PROVISION_DATA_FILE"

  for i in 1 2 3; do
    echo "  Provisioning Agent ${i}..."
    ENV_FILE="$SCRIPT_DIR/.env.provision-${i}"
    OUTPUT=$(cd "$REPO_ROOT/inft-tools" && env $(cat "$ENV_FILE" | grep -v '^#' | grep -v '^$' | xargs) npx tsx src/provision.ts 2>&1) || {
      echo "  ⚠ Agent $i provision failed:"
      echo "$OUTPUT" | tail -5
      fail "Provision failed for agent $i"
    }

    TOKEN_ID=$(echo "$OUTPUT" | grep "^AGENT_TOKEN_ID=" | cut -d= -f2)
    OWNER_SIG=$(echo "$OUTPUT" | grep "^OWNER_SIGNATURE=" | cut -d= -f2)
    ROOT_HASH=$(echo "$OUTPUT" | grep "^BRAIN_ROOT_HASH=" | cut -d= -f2)

    # Save to JSON
    python3 -c "
import json
with open('$PROVISION_DATA_FILE') as f: d = json.load(f)
d['agent$i'] = {'tokenId': '$TOKEN_ID', 'ownerSignature': '$OWNER_SIG', 'rootHash': '$ROOT_HASH'}
with open('$PROVISION_DATA_FILE', 'w') as f: json.dump(d, f, indent=2)
"
    echo "  ✓ Agent $i → iNFT #$TOKEN_ID (root: ${ROOT_HASH:0:16}...)"
  done

  # Cleanup temp env files
  rm -f "$SCRIPT_DIR/.env.provision-"*
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
# 6. DEPLOY CONTRACTS ON ANVIL FORK
##############################################################################
echo ""
echo "━━━ [6/11] Deploy contracts on Anvil fork ━━━"

# Derive agent 1 address from owner key
AGENT1_ADDR=$(cast wallet address "$OWNER_PRIVATE_KEY" 2>/dev/null)
echo "  Agent 1 addr: $AGENT1_ADDR"

DEPLOY_OUTPUT=$(cd "$REPO_ROOT/packages/contracts" && \
  ANVIL=true \
  SOLVER="$SOLVER_ADDR" \
  AGENT_1="$AGENT1_ADDR" \
  AGENT_2="$AGENT2_ADDR" \
  RELAYER_PK="$DEPLOYER_PK" \
  SOLVER_PK="$SOLVER_PK" \
  forge script script/DeployBase.s.sol \
    --rpc-url "$ANVIL_RPC" \
    --broadcast \
    --private-key "$DEPLOYER_PK" 2>&1) || fail "Contract deployment failed"

# Parse deployed addresses
FILL_REGISTRY=$(echo "$DEPLOY_OUTPUT" | grep "FillRegistry:" | awk '{print $NF}')
CHALLENGER_CONTRACT=$(echo "$DEPLOY_OUTPUT" | grep "Challenger:" | awk '{print $NF}')
CHALLENGER_REGISTRY=$(echo "$DEPLOY_OUTPUT" | grep "ChallengerRegistry:" | awk '{print $NF}')
SOLVER_BOND_VAULT=$(echo "$DEPLOY_OUTPUT" | grep "SolverBondVault:" | awk '{print $NF}')
SOLVER_REGISTRY=$(echo "$DEPLOY_OUTPUT" | grep "SolverRegistry:" | awk '{print $NF}')
EBBO_ORACLE=$(echo "$DEPLOY_OUTPUT" | grep "EBBOOracle:" | awk '{print $NF}')

echo "  ✓ FillRegistry:       $FILL_REGISTRY"
echo "  ✓ Challenger:         $CHALLENGER_CONTRACT"
echo "  ✓ ChallengerRegistry: $CHALLENGER_REGISTRY"
echo "  ✓ SolverBondVault:    $SOLVER_BOND_VAULT"
echo "  ✓ EBBOOracle:         $EBBO_ORACLE"

# Save for later use
cat > "$SCRIPT_DIR/contracts.env" << EOF
FILL_REGISTRY_ADDRESS=$FILL_REGISTRY
CHALLENGER_ADDRESS=$CHALLENGER_CONTRACT
CHALLENGER_REGISTRY_ADDRESS=$CHALLENGER_REGISTRY
SOLVER_BOND_VAULT_ADDRESS=$SOLVER_BOND_VAULT
SOLVER_REGISTRY_ADDRESS=$SOLVER_REGISTRY
EBBO_ORACLE_ADDRESS=$EBBO_ORACLE
EOF

##############################################################################
# 7. REGISTER SOLVER + DEPOSIT BOND
##############################################################################
echo ""
echo "━━━ [7/11] Register solver + deposit bond ━━━"

SOLVER_NODE=$(cast keccak "demo-solver.solvers.reckon.eth")

cast send "$SOLVER_REGISTRY" "register(bytes32,address)" "$SOLVER_NODE" "$SOLVER_ADDR" \
  --private-key "$DEPLOYER_PK" --rpc-url "$ANVIL_RPC" > /dev/null 2>&1
echo "  ✓ Solver registered"

# Fund solver with USDC
SOLVER_USDC_SLOT=$(cast keccak "$(printf '%064s%064s' "$(echo "$SOLVER_ADDR" | sed 's/0x//' | tr '[:upper:]' '[:lower:]')" "9" | sed 's/ //g; s/^/0x/')")
cast rpc anvil_setStorageAt \
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" \
  "$SOLVER_USDC_SLOT" \
  "0x000000000000000000000000000000000000000000000000000000174876e800" \
  --rpc-url "$ANVIL_RPC" > /dev/null 2>&1

# Approve + deposit
cast send "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" "approve(address,uint256)" "$SOLVER_BOND_VAULT" 50000000000 \
  --private-key "$SOLVER_PK" --rpc-url "$ANVIL_RPC" > /dev/null 2>&1
cast send "$SOLVER_BOND_VAULT" "deposit(uint256)" 50000000000 \
  --private-key "$SOLVER_PK" --rpc-url "$ANVIL_RPC" > /dev/null 2>&1
echo "  ✓ Solver bonded (50,000 USDC)"

##############################################################################
# 8. FUND AGENTS WITH ETH + USDC
##############################################################################
echo ""
echo "━━━ [8/11] Fund agents on Anvil fork ━━━"

USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

fund_agent() {
  local name=$1 addr=$2
  # ETH
  curl -s -X POST "$ANVIL_RPC" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"anvil_setBalance\",\"params\":[\"$addr\",\"0x56BC75E2D63100000\"],\"id\":1}" > /dev/null
  # USDC — compute storage slot
  local slot
  slot=$(cd "$REPO_ROOT" && npx tsx -e "
    import { keccak256 } from 'viem';
    const addr = '$addr';
    const s = keccak256(('0x' + addr.slice(2).toLowerCase().padStart(64, '0') + (9).toString(16).padStart(64, '0')) as \`0x\${string}\`);
    console.log(s);
  " 2>/dev/null)
  curl -s -X POST "$ANVIL_RPC" -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"anvil_setStorageAt\",\"params\":[\"$USDC\",\"$slot\",\"0x00000000000000000000000000000000000000000000000000000002540be400\"],\"id\":1}" > /dev/null
  echo "  ✓ $name ($addr): 100 ETH + 10,000 USDC"
}

fund_agent "Agent 1" "$AGENT1_ADDR"
fund_agent "Agent 2" "$AGENT2_ADDR"
fund_agent "Agent 3" "$AGENT3_ADDR"

##############################################################################
# 9. GENERATE AGENT .ENV FILES
##############################################################################
echo ""
echo "━━━ [9/11] Generate agent .env files ━━━"

AGENT_DIR="$REPO_ROOT/agent"

write_agent_env() {
  local num=$1 token_id=$2 sig=$3 root_hash=$4 priv_key=$5 axl_port=$6 peer_keys=$7

  cat > "$AGENT_DIR/.env.agent${num}" << ENVEOF
# Agent $num — auto-generated by multi-agent/run.sh
BASE_RPC_URL=$ANVIL_RPC
ZG_RPC_URL=$ZG_RPC_URL
ZG_INDEXER_URL=$ZG_INDEXER_URL

AGENT_TOKEN_ID=$token_id
AGENT_CHALLENGE_STRING=$CHALLENGE_STRING
ZG_AGENT_PRIVATE_KEY=$priv_key
OWNER_SIGNATURE=$sig
BRAIN_ROOT_HASH=$root_hash
CHALLENGER_NFT_ADDRESS=$CHALLENGER_NFT_ADDRESS

ZG_COMPUTE_PROVIDER_ADDRESS=0x0000000000000000000000000000000000000000

FILL_REGISTRY_ADDRESS=$FILL_REGISTRY
CHALLENGER_ADDRESS=$CHALLENGER_CONTRACT
CHALLENGER_REGISTRY_ADDRESS=$CHALLENGER_REGISTRY
SOLVER_BOND_VAULT_ADDRESS=$SOLVER_BOND_VAULT

AXL_API_URL=http://127.0.0.1:$axl_port
AXL_PEER_KEYS=$peer_keys

HEADLESS_MODE=false
ENVEOF

  echo "  ✓ agent/.env.agent${num}"
}

write_agent_env 1 "$AGENT1_TOKEN" "$AGENT1_SIG" "$AGENT1_ROOT" "$OWNER_PRIVATE_KEY" 9002 "$SPOKE_A_KEY,$SPOKE_B_KEY"
write_agent_env 2 "$AGENT2_TOKEN" "$AGENT2_SIG" "$AGENT2_ROOT" "$AGENT2_PK" 9012 "$HUB_KEY,$SPOKE_B_KEY"
write_agent_env 3 "$AGENT3_TOKEN" "$AGENT3_SIG" "$AGENT3_ROOT" "$AGENT3_PK" 9022 "$HUB_KEY,$SPOKE_A_KEY"

##############################################################################
# 10. START AGENTS
##############################################################################
echo ""
echo "━━━ [10/11] Start challenger agents ━━━"

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
sleep 12

# Check boot status
ALL_BOOTED=true
for i in 1 2 3; do
  if grep -q "Pipeline: triage" "$LOGS_DIR/agent-${i}.log" 2>/dev/null; then
    echo "  ✓ Agent $i: running"
  else
    echo "  ⚠ Agent $i: still booting (check logs/agent-${i}.log)"
    ALL_BOOTED=false
  fi
done

##############################################################################
# 11. SUBMIT BAD FILL
##############################################################################
echo ""

if [ "${SKIP_BAD_FILL:-false}" = "true" ]; then
  echo "━━━ [11/11] Skipped bad fill (SKIP_BAD_FILL=true) ━━━"
else
  echo "━━━ [11/11] Submit bad fill to trigger pipeline ━━━"

  # Write inline bad fill script
  cat > "$SCRIPT_DIR/_bad-fill.ts" << 'TSEOF'
import {
  createPublicClient, createWalletClient, http, keccak256, toHex,
  type Address, type Hex, parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { USDC_BASE, WETH_BASE } from "@reckon-protocol/types";

const RPC = process.env.ANVIL_RPC!;
const FILL_REGISTRY = process.env.FILL_REGISTRY_ADDRESS! as Address;
const EBBO_ORACLE = process.env.EBBO_ORACLE_ADDRESS! as Address;
const DEPLOYER_KEY = process.env.DEPLOYER_PK! as `0x${string}`;
const SOLVER_ADDR = process.env.SOLVER_ADDR! as Address;

const abi = parseAbi([
  "function recordFill(bytes32 orderHash, address filler, address swapper, address tokenIn, address tokenOut, uint128 inputAmount, uint128 outputAmount, uint16 eboTolerance, uint8 outputsLength, uint64 fillBlock) external",
  "function computeBenchmark(address tokenIn, address tokenOut) external view returns (uint256)",
]);

async function main() {
  const deployer = privateKeyToAccount(DEPLOYER_KEY);
  const client = createPublicClient({ chain: base, transport: http(RPC) });
  const wallet = createWalletClient({ chain: base, transport: http(RPC), account: deployer });

  const benchmark = await client.readContract({
    address: EBBO_ORACLE, abi, functionName: "computeBenchmark",
    args: [WETH_BASE as Address, USDC_BASE as Address],
  });

  const inputAmount = 10n ** 16n;
  const fairOutput = ((benchmark as bigint) * inputAmount) / 10n ** 18n;
  const badOutput = fairOutput / 2n;
  const currentBlock = await client.getBlockNumber();
  const orderHash = keccak256(toHex(`bad-fill-${Date.now()}-${Math.random()}`));

  console.log(`  Benchmark: ${benchmark}, fair: ${Number(fairOutput)/1e6} USDC, bad: ${Number(badOutput)/1e6} USDC (50%)`);

  const tx = await wallet.writeContract({
    address: FILL_REGISTRY, abi, functionName: "recordFill",
    args: [
      orderHash, SOLVER_ADDR,
      "0x000000000000000000000000000000000000dEaD" as Address,
      WETH_BASE as Address, USDC_BASE as Address,
      inputAmount, badOutput, 100, 1, currentBlock,
    ],
  });
  const receipt = await client.waitForTransactionReceipt({ hash: tx });
  console.log(`  ✓ Bad fill recorded: ${orderHash.slice(0, 18)}... (block ${receipt.blockNumber})`);
}
main().catch(e => { console.error(e); process.exit(1); });
TSEOF

  ANVIL_RPC="$ANVIL_RPC" \
  FILL_REGISTRY_ADDRESS="$FILL_REGISTRY" \
  EBBO_ORACLE_ADDRESS="$EBBO_ORACLE" \
  DEPLOYER_PK="$DEPLOYER_PK" \
  SOLVER_ADDR="$SOLVER_ADDR" \
    npx tsx "$SCRIPT_DIR/_bad-fill.ts" 2>/dev/null

  rm -f "$SCRIPT_DIR/_bad-fill.ts"
fi

##############################################################################
# DONE
##############################################################################
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              Multi-Agent Setup Complete             ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                    ║"
echo "║  AXL Mesh:  3 nodes (hub:9002, spoke-a:9012,      ║"
echo "║             spoke-b:9022)                          ║"
echo "║                                                    ║"
echo "║  Agents:    3 challengers listening for fills      ║"
echo "║                                                    ║"
echo "║  Logs:      multi-agent/logs/agent-{1,2,3}.log    ║"
echo "║                                                    ║"
echo "║  Pipeline:  triage → ebbo → coordinate → decide   ║"
echo "║             → submit                               ║"
echo "║                                                    ║"
echo "║  To stop:   bash multi-agent/stop.sh               ║"
echo "║  Bad fill:  SKIP_BAD_FILL=false bash run.sh        ║"
echo "║                                                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Watch agent activity:"
echo "  tail -f multi-agent/logs/agent-1.log"
echo "  tail -f multi-agent/logs/agent-2.log"
echo "  tail -f multi-agent/logs/agent-3.log"
