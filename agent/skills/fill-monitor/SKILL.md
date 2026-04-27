---
name: fill-monitor
description: Monitor FillRecorded events from the Reckon FillRegistry contract on Base mainnet and trigger the challenge pipeline.
version: 0.1.0
metadata:
  openclaw:
    requires:
      env:
        - BASE_RPC_URL
        - FILL_REGISTRY_ADDRESS
      bins:
        - node
    primaryEnv: BASE_RPC_URL
    emoji: "eyes"
---

## Instructions

This skill continuously monitors the FillRegistry contract for `FillRecorded` events. For each new fill, it triggers the analysis pipeline: triage → EBBO → decide → challenge.

### Event signature

```
event FillRecorded(
  bytes32 indexed orderHash,
  bytes32 indexed fillerNamehash,
  address indexed swapper,
  uint256 fillBlock
)
```

### Monitoring approach

- **HTTP RPC polling** every 2 seconds (works with Anvil fork and Base mainnet)
- Tracks `lastProcessedBlock` to avoid reprocessing
- On each poll: fetch logs from `lastProcessedBlock + 1` to current block
- For each log: read full fill details from the `fills(orderHash)` mapping on the contract
- Check challenge deadline: skip fills past the 1800-block (~30 min) challenge window

### Fill record fields

Each fill provides: `orderHash`, `filler`, `fillerNamehash`, `swapper`, `tokenIn`, `tokenOut`, `inputAmount`, `outputAmount`, `eboToleranceBps`, `fillBlock`, `challengeDeadline`, `txHash`.

### Error handling

- RPC errors: log and retry on next poll cycle
- Handler errors (downstream skill failures): log and continue to next fill
- Fills past challenge deadline: skip silently with log message
