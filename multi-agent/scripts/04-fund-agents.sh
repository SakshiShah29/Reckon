#!/usr/bin/env bash
set -euo pipefail

echo "=== Step 4: Fund Agent Wallets with USDC on Anvil Fork ==="

ANVIL_RPC="http://147.182.164.208:8545"
USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# Agent addresses
AGENT1_ADDR="0xbfC3d90156F2FF0412dEd13f6B26C2bF6C936976"
AGENT2_ADDR="0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
AGENT3_ADDR="0x90F79bf6EB2c4f870365E785982E1f101E93b906"

# USDC uses a mapping at slot computed from: keccak256(abi.encode(address, uint256(9)))
# for Circle's FiatTokenV2 proxy on Base

echo "[fund] Computing USDC storage slots..."

# Compute storage slot for each address
# USDC on Base: balanceOf mapping is at slot 9
# slot = keccak256(abi.encodePacked(bytes32(address), bytes32(9)))

# Agent 1 — already funded (from your step 3)
echo "[fund] Agent 1 ($AGENT1_ADDR) — already funded"

# Agent 2
SLOT2=$(cast index address "$AGENT2_ADDR" 9)
echo "[fund] Agent 2 ($AGENT2_ADDR) slot: $SLOT2"
cast rpc anvil_setStorageAt "$USDC" "$SLOT2" \
  "0x000000000000000000000000000000000000000000000000000000174876e800" \
  --rpc-url "$ANVIL_RPC"
echo "[fund] Agent 2 funded with 100,000 USDC"

# Agent 3
SLOT3=$(cast index address "$AGENT3_ADDR" 9)
echo "[fund] Agent 3 ($AGENT3_ADDR) slot: $SLOT3"
cast rpc anvil_setStorageAt "$USDC" "$SLOT3" \
  "0x000000000000000000000000000000000000000000000000000000174876e800" \
  --rpc-url "$ANVIL_RPC"
echo "[fund] Agent 3 funded with 100,000 USDC"

# Also give them ETH for gas
echo ""
echo "[fund] Funding ETH for gas..."
for ADDR in "$AGENT2_ADDR" "$AGENT3_ADDR"; do
  cast rpc anvil_setBalance "$ADDR" "0x56BC75E2D63100000" --rpc-url "$ANVIL_RPC" > /dev/null 2>&1
  echo "[fund] $ADDR funded with 100 ETH"
done

# Verify balances
echo ""
echo "[fund] Verifying USDC balances..."
for ADDR in "$AGENT1_ADDR" "$AGENT2_ADDR" "$AGENT3_ADDR"; do
  BAL=$(cast call "$USDC" "balanceOf(address)(uint256)" "$ADDR" --rpc-url "$ANVIL_RPC" 2>/dev/null || echo "0")
  echo "  $ADDR: $BAL USDC (atomic)"
done

echo ""
echo "[fund] Done!"
