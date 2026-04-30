#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MULTI_AGENT_DIR="$(dirname "$SCRIPT_DIR")"
AXL_DIR="$MULTI_AGENT_DIR/axl"

echo "=== Step 1: Build AXL from source ==="

if [ -f "$AXL_DIR/node" ]; then
  echo "[axl] Binary already exists at $AXL_DIR/node"
  "$AXL_DIR/node" --help 2>&1 | head -3 || true
  echo "[axl] Skipping build. Delete $AXL_DIR/node to rebuild."
  exit 0
fi

# Clone if not present
if [ ! -d "$AXL_DIR" ]; then
  echo "[axl] Cloning gensyn-ai/axl..."
  git clone https://github.com/gensyn-ai/axl.git "$AXL_DIR"
fi

cd "$AXL_DIR"

# Check Go version — AXL needs Go 1.25.x, Go 1.26+ has gvisor conflicts
GO_VERSION=$(go version | grep -oE 'go[0-9]+\.[0-9]+' | head -1)
echo "[axl] Go version: $GO_VERSION"

echo "[axl] Building with GOTOOLCHAIN=go1.25.5 (required for gvisor compat)..."
# This will auto-download Go 1.25.5 if needed
GOTOOLCHAIN=go1.25.5 go build -o node ./cmd/node/ 2>&1 || {
  echo ""
  echo "[axl] GOTOOLCHAIN auto-download failed. Trying manual install..."
  echo "[axl] Installing Go 1.25.5 alongside..."
  go install golang.org/dl/go1.25.5@latest
  "$(go env GOPATH)/bin/go1.25.5" download
  "$(go env GOPATH)/bin/go1.25.5" build -o node ./cmd/node/
}

echo ""
echo "[axl] Build successful!"
ls -la "$AXL_DIR/node"
echo ""
"$AXL_DIR/node" --help 2>&1 | head -5 || echo "[axl] Binary ready (no --help output)"
