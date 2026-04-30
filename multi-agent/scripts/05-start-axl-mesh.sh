#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MULTI_AGENT_DIR="$(dirname "$SCRIPT_DIR")"
AXL_DIR="$MULTI_AGENT_DIR/axl"
KEYS_DIR="$MULTI_AGENT_DIR/keys"
CONFIGS_DIR="$MULTI_AGENT_DIR/configs"
LOGS_DIR="$MULTI_AGENT_DIR/logs"

echo "=== Step 5: Start AXL Mesh (3 nodes, hub-and-spoke) ==="

# Check AXL binary
if [ ! -f "$AXL_DIR/node" ]; then
  echo "[axl] ERROR: AXL binary not found. Run 01-build-axl.sh first"
  exit 1
fi

# Check keys
if [ ! -f "$KEYS_DIR/axl-identity-1.pem" ]; then
  echo "[axl] ERROR: Keys not found. Run 02-generate-keys.sh first"
  exit 1
fi

mkdir -p "$CONFIGS_DIR" "$LOGS_DIR"

# Kill any existing AXL nodes
echo "[axl] Killing any existing AXL nodes..."
for PORT in 9002 9012 9022; do
  lsof -ti :$PORT 2>/dev/null | xargs kill 2>/dev/null || true
done
# Also kill by port 9001 (hub listen port)
lsof -ti :9001 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# ── Node configs ──
# Hub (Agent 1): listens on :9001, API on :9002
cat > "$CONFIGS_DIR/hub.json" << EOF
{
  "PrivateKeyPath": "$KEYS_DIR/axl-identity-1.pem",
  "Peers": [],
  "Listen": ["tls://127.0.0.1:9001"],
  "api_port": 9002,
  "tcp_port": 7000
}
EOF

# Spoke A (Agent 2): peers to hub, API on :9012
cat > "$CONFIGS_DIR/spoke-a.json" << EOF
{
  "PrivateKeyPath": "$KEYS_DIR/axl-identity-2.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9012,
  "tcp_port": 7000
}
EOF

# Spoke B (Agent 3): peers to hub, API on :9022
cat > "$CONFIGS_DIR/spoke-b.json" << EOF
{
  "PrivateKeyPath": "$KEYS_DIR/axl-identity-3.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9022,
  "tcp_port": 7000
}
EOF

echo "[axl] Starting Hub (port 9002, listen :9001)..."
"$AXL_DIR/node" -config "$CONFIGS_DIR/hub.json" > "$LOGS_DIR/hub.log" 2>&1 &
HUB_PID=$!
echo "[axl]   Hub PID: $HUB_PID"
sleep 3

echo "[axl] Starting Spoke A (port 9012)..."
"$AXL_DIR/node" -config "$CONFIGS_DIR/spoke-a.json" > "$LOGS_DIR/spoke-a.log" 2>&1 &
SPOKE_A_PID=$!
echo "[axl]   Spoke A PID: $SPOKE_A_PID"
sleep 2

echo "[axl] Starting Spoke B (port 9022)..."
"$AXL_DIR/node" -config "$CONFIGS_DIR/spoke-b.json" > "$LOGS_DIR/spoke-b.log" 2>&1 &
SPOKE_B_PID=$!
echo "[axl]   Spoke B PID: $SPOKE_B_PID"
sleep 3

# Save PIDs
cat > "$MULTI_AGENT_DIR/axl-pids.txt" << EOF
HUB=$HUB_PID
SPOKE_A=$SPOKE_A_PID
SPOKE_B=$SPOKE_B_PID
EOF

# ── Verify mesh ──
echo ""
echo "[axl] Verifying mesh connectivity..."

verify_node() {
  local name=$1
  local port=$2
  local resp
  resp=$(curl -s --max-time 5 "http://127.0.0.1:${port}/topology" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$resp" ]; then
    echo "  $name (port $port): FAILED — node not responding"
    return 1
  fi

  local pubkey
  local peers
  pubkey=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin).get('our_public_key','??'))" 2>/dev/null)
  peers=$(echo "$resp" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('peers',[])))" 2>/dev/null)
  echo "  $name (port $port): pubkey=${pubkey:0:16}... peers=$peers"
  return 0
}

verify_node "Hub" 9002
verify_node "Spoke A" 9012
verify_node "Spoke B" 9022

# ── Test message routing ──
echo ""
echo "[axl] Testing message routing (Spoke A → Spoke B via Hub)..."

SPOKE_B_KEY=$(curl -s "http://127.0.0.1:9022/topology" | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")

curl -s -X POST "http://127.0.0.1:9012/send" \
  -H "X-Destination-Peer-Id: $SPOKE_B_KEY" \
  -d '{"test":"multi-agent-mesh-check","ts":"'$(date +%s)'"}' \
  --max-time 5

sleep 1

RECV=$(curl -s --max-time 5 "http://127.0.0.1:9022/recv")
if echo "$RECV" | grep -q "multi-agent-mesh-check" 2>/dev/null; then
  echo "  PASS: Message routed Spoke A → Hub → Spoke B"
else
  echo "  WARN: Message not received (mesh may need more time to stabilize)"
  echo "  Received: $RECV"
fi

# ── Output public keys for agent .env files ──
echo ""
echo "=== AXL Mesh Public Keys ==="
HUB_KEY=$(curl -s "http://127.0.0.1:9002/topology" | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")
SPOKE_A_KEY=$(curl -s "http://127.0.0.1:9012/topology" | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")
SPOKE_B_KEY=$(curl -s "http://127.0.0.1:9022/topology" | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")

echo "  Hub     (Agent 1): $HUB_KEY"
echo "  Spoke A (Agent 2): $SPOKE_A_KEY"
echo "  Spoke B (Agent 3): $SPOKE_B_KEY"

# Save for env generation
cat > "$MULTI_AGENT_DIR/axl-pubkeys.env" << EOF
HUB_KEY=$HUB_KEY
SPOKE_A_KEY=$SPOKE_A_KEY
SPOKE_B_KEY=$SPOKE_B_KEY
EOF

echo ""
echo "=== AXL Peer Keys (for agent .env files) ==="
echo "  Agent 1 AXL_PEER_KEYS=$SPOKE_A_KEY,$SPOKE_B_KEY"
echo "  Agent 2 AXL_PEER_KEYS=$HUB_KEY,$SPOKE_B_KEY"
echo "  Agent 3 AXL_PEER_KEYS=$HUB_KEY,$SPOKE_A_KEY"

echo ""
echo "[axl] Mesh running! Logs in: $LOGS_DIR/"
echo "[axl] To stop: bash scripts/stop-axl-mesh.sh"
