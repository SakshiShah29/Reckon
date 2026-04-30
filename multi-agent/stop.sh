#!/usr/bin/env bash
##############################################################################
# Stop all multi-agent processes (agents + AXL mesh)
#   cd multi-agent && bash stop.sh
##############################################################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Stopping Reckon Multi-Agent ==="

# Stop agents
echo "[agents] Stopping challenger agents..."
pkill -f "src/index.ts" 2>/dev/null && echo "  ✓ Agents stopped" || echo "  (no agents running)"

# Stop AXL mesh
echo "[axl] Stopping AXL nodes..."
if [ -f "$SCRIPT_DIR/axl-pids.txt" ]; then
  source "$SCRIPT_DIR/axl-pids.txt"
  kill "$HUB" "$SPOKE_A" "$SPOKE_B" 2>/dev/null || true
  rm -f "$SCRIPT_DIR/axl-pids.txt"
  echo "  ✓ AXL mesh stopped"
else
  for PORT in 9001 9002 9012 9022; do
    lsof -ti :$PORT 2>/dev/null | xargs kill 2>/dev/null || true
  done
  echo "  ✓ Killed processes on AXL ports"
fi

sleep 1
echo ""
echo "All processes stopped."
