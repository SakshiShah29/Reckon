#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MULTI_AGENT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Stopping AXL Mesh ==="

if [ -f "$MULTI_AGENT_DIR/axl-pids.txt" ]; then
  source "$MULTI_AGENT_DIR/axl-pids.txt"
  kill "$HUB" "$SPOKE_A" "$SPOKE_B" 2>/dev/null || true
  echo "[axl] Sent SIGTERM to PIDs: $HUB, $SPOKE_A, $SPOKE_B"
  rm -f "$MULTI_AGENT_DIR/axl-pids.txt"
else
  echo "[axl] No PID file found, killing by port..."
  for PORT in 9001 9002 9012 9022; do
    lsof -ti :$PORT 2>/dev/null | xargs kill 2>/dev/null || true
  done
fi

sleep 1
echo "[axl] Mesh stopped."
