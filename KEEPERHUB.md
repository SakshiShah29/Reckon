# Reckon Protocol — KeeperHub Integration

## Project Overview

Reckon is an autonomous EBBO (Execution Best Bid Offer) enforcement protocol for UniswapX. AI-powered challenger agents monitor solver fills, detect price violations against on-chain benchmarks, and submit slashing challenges — all without human intervention.

KeeperHub serves as the **on-chain execution and automation layer** for Reckon's challenger agents, handling both write transactions (challenge submissions) and read operations (EBBO benchmark price queries) through webhook-triggered workflows.

## How KeeperHub Is Used

### 1. Challenge Submission Workflow

**Workflow ID:** `krgoqq0af5urb1k8vnww7`

When the agent detects a slashable fill, it needs to call `Challenger.submit()` on-chain. Rather than submitting directly from the agent's hot wallet, the agent delegates transaction execution to KeeperHub:

1. The agent pre-signs a **Permit2 EIP-712 signature** authorizing the challenger bond transfer
2. The agent POSTs the signed payload (orderHash, bond amount, permit, signature) to the KeeperHub webhook
3. KeeperHub's wallet (`0xC204c6FEC66FbFa5467B8080638C939DF9850bf8`) calls `Challenger.submit()` as a **delegate** on behalf of the agent owner
4. The agent polls KeeperHub's execution logs API to retrieve the transaction hash

This pattern separates **signing authority** (agent wallet holds Permit2 signature) from **execution authority** (KeeperHub wallet submits the transaction), improving security and reliability.

**Smart contract support:** The [`Challenger.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/Challenger.sol) contract was extended with a delegation mechanism (`agentDelegate` mapping + `setAgentDelegate()`) specifically to enable KeeperHub wallet execution. The `_preflight()` function validates that `msg.sender` is either the agent owner or an authorized delegate, while `_pullBond()` always pulls the Permit2 bond from the agent owner's pre-signed permit — not from `msg.sender`.

**Agent code:** [`agent/sentinel/src/submit.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/submit.ts) | [`agent/warden/src/submit.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/submit.ts) — The `submitViaKeeperHub()` function constructs the webhook payload, fires it to KeeperHub, and polls `GET /api/workflows/executions/{runId}/logs` to extract the transaction hash from the completed execution.

### 2. EBBO Benchmark Read Workflow

**Workflow ID:** `mz0199aw1djkmld7gqxyw`

Before challenging a fill, the agent needs the EBBO benchmark price to determine if the solver's execution was worse than the on-chain oracle price. This read is routed through KeeperHub:

1. The agent POSTs `{ tokenIn, tokenOut }` to the KeeperHub webhook
2. KeeperHub calls `EBBOOracle.computeBenchmark(tokenIn, tokenOut)` on Base Sepolia via `web3/read-contract`
3. The agent polls execution logs to retrieve the benchmark price (uint256, 1e18 precision)
4. The agent uses this price locally to determine slashability

This offloads RPC read operations to KeeperHub's infrastructure, centralizing all on-chain interactions through a single provider.

**Agent code:** [`agent/sentinel/src/ebbo.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/ebbo.ts) | [`agent/warden/src/ebbo.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/ebbo.ts) — The `computeEBBOViaKeeperHub()` function handles the webhook call and result polling. Falls back to direct RPC reads via `computeEBBO()` when KeeperHub is not configured.

### 3. Fill Listener Workflow

**Workflow ID:** `q2k5q61vpxbwnhh6m2qtj`

The agent needs to detect new solver fills on-chain to begin the challenge pipeline. This event monitoring is handled by KeeperHub:

1. KeeperHub watches for `FillRecorded` events on the FillRegistry contract (Base Sepolia) using a blockchain event trigger
2. When a fill is detected, KeeperHub calls `FillRegistry.fills(orderHash)` via `web3/read-contract` to fetch full fill details (token pair, amounts, tolerance, deadline)
3. The complete fill data is forwarded to the agent to enter the challenge pipeline

This eliminates the need for the agent to continuously poll the chain for new events, offloading event monitoring entirely to KeeperHub's infrastructure.

### 4. Orchestrator Wiring

[`agent/sentinel/src/index.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/index.ts) | [`agent/warden/src/index.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/index.ts) — The main orchestrator conditionally enables KeeperHub for both workflows based on environment variables. The agent supports dual-mode operation: KeeperHub-routed or direct on-chain, configured per-workflow.

```
Pipeline: FillRecorded (KeeperHub) → triage (0G Compute) → ebbo (KeeperHub) → coordinate (AXL) → decide → submit (KeeperHub)
```

## Architecture

```
                              Reckon Agent
                                   |
          +------------------------+------------------------+
          |                        |                        |
  [Fill Listener]        [EBBO Benchmark Read]     [Challenge Submit]
          |                        |                        |
  Event trigger              POST /webhook            POST /webhook
  FillRecorded               {tokenIn, tokenOut}      {orderHash, bond,
          |                        |                   permit, signature}
          v                        v                        v
+-------------------+    +-------------------+    +-------------------+
| KeeperHub Workflow |    | KeeperHub Workflow |    | KeeperHub Workflow |
| Event trigger      |    | web3/read-contract |    | web3/write-contract|
| + web3/read-contract|    | EBBOOracle         |    | Challenger.submit()|
| FillRegistry.fills()|    | .computeBenchmark()|    | (as delegate)      |
+-------------------+    +-------------------+    +-------------------+
          |                        |                        |
          v                        v                        v
    Base Sepolia             Base Sepolia             Base Sepolia
  (detect + read fill)      (read price)         (submit challenge tx)
```

## Key Files

| File | Role |
|------|------|
| [`agent/sentinel/src/submit.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/submit.ts) | KeeperHub webhook challenge submission + execution log polling |
| [`agent/warden/src/submit.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/submit.ts) | KeeperHub webhook challenge submission + execution log polling |
| [`agent/sentinel/src/ebbo.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/ebbo.ts) | KeeperHub webhook EBBO benchmark reads |
| [`agent/warden/src/ebbo.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/ebbo.ts) | KeeperHub webhook EBBO benchmark reads |
| [`agent/sentinel/src/index.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/index.ts) | Orchestrator wiring for both KeeperHub workflows |
| [`agent/warden/src/index.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/index.ts) | Orchestrator wiring for both KeeperHub workflows |
| [`agent/.env.example`](https://github.com/SakshiShah29/Reckon/blob/main/agent/.env.example) | KeeperHub configuration (webhook URLs, API keys) |
| [`packages/contracts/src/Challenger.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/src/Challenger.sol) | Delegation support enabling KeeperHub wallet execution |
| [`packages/contracts/test/E2E.t.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/test/E2E.t.sol) | Delegation test suite (5 tests covering delegate submit, auth, bond flow) |
| [`packages/contracts/script/SetDelegate.s.sol`](https://github.com/SakshiShah29/Reckon/blob/main/packages/contracts/script/SetDelegate.s.sol) | Deployment script to set KeeperHub wallet as delegate |

## Configuration

For Sentinel:

```env
# KeeperHub — challenge submission
KH_WEBHOOK_URL=https://app.keeperhub.com/api/workflows/llob0l755i4ltbxn43pwu/webhook
KH_FILL_WEBHOOK_URL=https://app.keeperhub.com/api/workflows/q2k5q61vpxbwnhh6m2qtj/webhook
KH_EBBO_WEBHOOK_URL=https://app.keeperhub.com/api/workflows/mz0199aw1djkmld7gqxyw/webhook
KH_WEBHOOK_API_KEY=wfb_...
KH_API_KEY=kh_...
```

For Warden:

```env
# KeeperHub — challenge submission
KH_WEBHOOK_URL=https://app.keeperhub.com/api/workflows/eu7e5jr73yevj9ld9dqyc/webhook
KH_FILL_WEBHOOK_URL=https://app.keeperhub.com/api/workflows/q2k5q61vpxbwnhh6m2qtj/webhook
KH_EBBO_WEBHOOK_URL=https://app.keeperhub.com/api/workflows/mz0199aw1djkmld7gqxyw/webhook
KH_WEBHOOK_API_KEY=wfb_...
KH_API_KEY=kh_...
```

## Setup

1. Deploy contracts to Base Sepolia (see [`specs/docs/deployment-order.md`](https://github.com/SakshiShah29/Reckon/blob/main/specs/docs/deployment-order.md))
2. Create a KeeperHub org and wallet at [app.keeperhub.com](https://app.keeperhub.com)
3. Set the KeeperHub wallet as delegate on the Challenger contract:
   ```
   Challenger.setAgentDelegate(agentTokenId, keeperHubWalletAddress)
   ```
4. Create the two workflows (submit + EBBO read) via KeeperHub MCP tools or UI
5. Set `KH_WEBHOOK_URL`, `KH_FILL_WEBHOOK_URL` `KH_EBBO_WEBHOOK_URL`, and API keys in the agent's `.env`
6. Run the agent — it will automatically route through KeeperHub when configured

## Team

- **Project:** Reckon Protocol
- **Repository:** [github.com/SakshiShah29/Reckon](https://github.com/SakshiShah29/Reckon)
