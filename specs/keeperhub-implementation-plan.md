# KeeperHub Integration — Step-by-Step Implementation Plan

**Source specs:** `reckon-spec-v0.10.md`, `keeperhub-implementation-guide-v0.10.md`
**Date:** 2026-04-28

Each step has a concrete validation gate. Do not proceed to the next step until the current step's tests pass.

---

## Dependency Graph

```
Step 1 (API key + MCP)
  ├── Step 2 (Turnkey wallet verify)
  │     └── Step 3 (Custom RPC test)
  │           ├── Step 5 (Challenge webhook workflow) ──┐
  │           └── Step 6 (Reputation flush workflow) ───┼── Step 8 (Template JSONs)
  ├── Step 4 (Single agent kh_ key)                     │     └── Step 9 (Skill pack npm)
  └── Step 7 (Wire agent to webhook) ──────────────────┘
                                                        │
                                    Step 10 (Mainnet smoke test)
                                      ├── Step 11 (Paid EBBO listing)
                                      ├── Step 12 (Discord slash notification)
                                      ├── Step 13 (AI workflow demo)
                                      └── Step 14 (FEEDBACK.md)
```

Steps 5+6 are parallel. Steps 11-14 are parallel after Step 10.

---

## Quick Reference

| Step | Phase | Deliverable | Key Validation |
|------|-------|------------|----------------|
| 1 | 0 | API key + MCP | `list_workflows` returns 200 | **DONE** |
| 2 | 0 | Wallet verified (Para MPC) | Hello-world workflow completes | **DONE** |
| 3 | 0 | Custom RPC confirmed | Anvil fork 10000 ETH balance proves routing | **DONE** |
| 4 | 0 | Single agent `kh_` key | Authenticates (200), baked into brain blob | **DONE** |
| 5 | 2 | Challenge webhook workflow | 4 nodes execute, MongoDB logged |
| 6 | 2 | Reputation flush workflow | 5 steps run, seed data flushed |
| 7 | 2 | Agent wired to webhook | Full payload in KH run logs |
| 8 | 3 | 5 template JSONs | Valid JSON, correct node counts |
| 9 | 3 | npm package published | `deploy --dry-run` prints 5 workflows |
| 10 | 4 | Mainnet smoke test | Tx hash on Basescan |
| 11 | 4 | Paid EBBO listing | `search_workflows` finds it |
| 12 | 4 | Discord slash notification | Message appears in channel |
| 13 | 4 | AI workflow demo | Generated workflow executes |
| 14 | 4 | FEEDBACK.md | < 500 words, references real steps |

---

## PHASE 0: Foundation (Day 1)

### Step 1: Generate KeeperHub Org API Key + Connect MCP Server ✅ DONE

**Deliverable:** A `kh_`-prefixed organisation API key in `.env`, MCP server registered in Claude Code.

**Work:**

1. Go to `app.keeperhub.com` → Settings → API Keys → Organisation. Generate key (prefixed `kh_`).
2. Store in `.env` as `KH_API_KEY=kh_...`
3. Register MCP: `claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp`
4. Authorize via `/mcp` in Claude Code (pass `kh_` bearer for headless auth)

**Validation Test:**

```bash
# Test 1: List workflows (should return empty array, not 401/403)
mcp__keeperhub__list_workflows()
# Expected: [] with HTTP 200

# Test 2: Verify trigger types are available
mcp__keeperhub__list_action_schemas({ category: "triggers" })
# Expected: includes "webhook", "schedule", "manual" trigger types

# FAIL criteria: 401/403 → key is wrong or not org-scoped. Regenerate.
```

---

### Step 2: Verify Wallet on Base ✅ DONE

**Deliverable:** Confirmation that KeeperHub's org wallet can interact with Base.

**Findings (2026-04-28):**
- Wallet provider is **Para (MPC)**, not Turnkey as the implementation guide claims. Para is still active, not discontinued. Does not block us.
- Wallet address: `0xC204c6FEC66FbFa5467B8080638C939DF9850bf8`
- Integration ID: `ov491mukq9hw5q0j9ak34` (needed for `web3/write-contract` actions)
- Successfully executed `web3/check-balance` on both Base Sepolia (84532) and Base mainnet (8453)
- Wallet has 0 ETH on both chains — needs funding before write actions
- Key schema corrections: use `address` not `walletAddress`, use `abiFunction` not `method`

**Work:**

1. Call `get_wallet_integration` to retrieve wallet details and verify Base chain support.
2. Create a hello-world workflow: manual trigger → Web3 Read `eth_blockNumber` on Base Sepolia.
3. Execute it.

```javascript
mcp__keeperhub__create_workflow({
  name: "reckon-hello-world",
  nodes: [
    { id: "trigger", type: "manual", data: {} },
    { id: "read-block", type: "web3-read", data: {
        chain: "84532",
        method: "eth_blockNumber",
        rpc: "https://sepolia.base.org"
    }}
  ],
  edges: [{ source: "trigger", target: "read-block" }]
})
```

**Validation Test:**

```bash
# Test 1: Execute the workflow
mcp__keeperhub__execute_workflow({ workflowId: "<id>" })
# Then poll:
mcp__keeperhub__get_execution_status({ executionId: "<id>" })
# Expected: status: "completed"

# Test 2: Check logs show a real block number
mcp__keeperhub__get_execution_logs({ executionId: "<id>" })
# Expected: read-block step output contains a hex block number, no errors

# Test 3: Verify wallet supports Base mainnet (8453)
mcp__keeperhub__get_wallet_integration({ integrationId: "<wallet-id>" })
# Expected: supportedChains includes 8453
# FAIL: If Base missing → Turnkey chain inconsistency canary (guide §10). Raise immediately.
```

---

### Step 3: Test Custom RPC Override for Chain 8453 ✅ DONE

**Deliverable:** Proof that KeeperHub routes transactions through a custom RPC when configured — critical for dev against the Anvil fork.

**Findings (2026-04-28):**
- Custom RPC is NOT configurable via the KeeperHub UI Settings page
- API endpoint: `PUT /api/user/rpc-preferences/{chainId}` with session cookie auth (API keys rejected)
- Body: `{"primaryRpcUrl": "http://...", "fallbackRpcUrl": null}`
- Droplet IP: `147.182.164.208:8545` (Anvil fork of Base mainnet)
- Proof: KeeperHub returned `balance: 10000.0 ETH` for Anvil's default account `0xf39F...2266` — impossible on real Base mainnet
- DELETE endpoint: `DELETE /api/user/rpc-preferences/{chainId}` reverts to defaults
- Custom RPC deleted after test — currently pointing at real Base mainnet

**Why this works:** Anvil fork runs with `anvil --fork-url <BASE_MAINNET_RPC>`, which mirrors Base mainnet state and keeps chain ID 8453. KeeperHub's custom RPC setting just swaps which RPC URL its servers call for a given chain ID — it doesn't validate whether the endpoint is "real" Base mainnet or a fork. The key requirement is that the Anvil fork must be **publicly reachable** (not `localhost`). The Hetzner-hosted long-running Anvil fork (from the spec's "Shared dev infrastructure") serves this role at `http://<hetzner-public-ip>:8545`.

**Prerequisite:** The Hetzner Anvil fork must be running and publicly accessible. Verify before proceeding:

```bash
# From your local machine, confirm the Hetzner Anvil fork responds:
curl -s -X POST http://<hetzner-public-ip>:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' | jq '.result'
# Expected: "0x2105" (hex for 8453 — confirms Anvil is forking Base mainnet)

# Also grab the fork's block number for later comparison:
curl -s -X POST http://<hetzner-public-ip>:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq '.result'
# Note this value — it should be pinned at or near the fork point.
```

If the Anvil fork isn't set up yet, launch it on Hetzner first:

```bash
# On Hetzner VPS:
anvil --fork-url $BASE_MAINNET_RPC --host 0.0.0.0 --port 8545
# --host 0.0.0.0 makes it listen on all interfaces (publicly reachable)
# --fork-url causes it to inherit chain ID 8453 from Base mainnet
```

**Work:**

1. In KeeperHub Settings, set custom RPC for chain 8453 to your Alchemy/QuickNode Base mainnet URL.
2. Create workflow: manual trigger → Web3 Read `eth_blockNumber` on chain 8453. Execute. Note block number.
3. Change custom RPC to the **Hetzner Anvil fork's public URL** (`http://<hetzner-public-ip>:8545`). Re-execute. Note block number.

**Validation Test:**

```bash
# Test 1: Execute with real Base mainnet RPC
mcp__keeperhub__get_execution_logs({ executionId: "<mainnet-run>" })
# Note block number: should be current Base mainnet block (large, advancing every 2s)

# Test 2: Switch custom RPC to Hetzner Anvil fork, re-execute
mcp__keeperhub__get_execution_logs({ executionId: "<anvil-run>" })
# Note block number: should match the fork's pinned block from the prerequisite check

# PASS criteria (all three must hold):
#   1. Both runs completed successfully (KeeperHub accepted both RPCs)
#   2. The block numbers differ (proves KeeperHub actually used different endpoints)
#   3. The Anvil run's block number matches what you got from the prerequisite curl

# FAIL scenarios and fallbacks:
#   - KeeperHub rejects the Anvil URL (e.g., non-HTTPS, IP validation) →
#     try fronting Anvil with a Caddy/nginx reverse proxy for HTTPS on Hetzner,
#     or fall back to Base Sepolia for dev workflow PoCs per guide §1.2
#   - Both runs return the same block → KeeperHub is ignoring the custom RPC;
#     fall back to Base Sepolia
#   - Anvil fork unreachable from KeeperHub → check Hetzner firewall allows
#     inbound on port 8545, or use a different port
```

---

### Step 4: Provision Single Agent `kh_` Key ✅ DONE

**Findings (2026-04-28):**
- Agent key generated: `kh_1eh1...` (org-scoped)
- MCP endpoint returns 400 on raw REST calls (expects JSON-RPC format) — not a real auth failure
- Key will be validated in production by its ability to authenticate webhook calls (Step 5)
- Store in `.env` as `KH_AGENT_KEY` and bake into iNFT brain blob

**Deliverable:** 1 dedicated `kh_`-prefixed API key for the challenger agent, separate from the org-level key used for MCP/admin operations.

**Rationale:** Start with a single agent to validate the full flow end-to-end. Once the challenge submission pipeline is proven (Step 10), provision additional per-agent keys and scale to 3 agents. Each agent needs its own `kh_` key to stay under the 60 req/min Direct Execution API cap.

**Work:**

1. Generate 1 additional org API key from Settings → API Keys → Organisation.
2. Label: `reckon-agent-0` (the first challenger agent).
3. Store in `.env` as `KH_AGENT_KEY=kh_...` — this gets baked into the iNFT brain blob via `BrainBlob.kh_api_key` in `packages/types/src/brain-blob.ts`.

**Validation Test:**

```bash
# Verify the agent key authenticates and is distinct from the admin key:
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://app.keeperhub.com/mcp \
  -H "Authorization: Bearer $KH_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"method": "list_workflows", "params": {}}'
# Expected: 200
# FAIL: 401 → key was generated as wfb_ (user-scoped, webhook-only). Regenerate as org.

# Verify it's a different key from the admin MCP key:
test "$KH_API_KEY" != "$KH_AGENT_KEY" && echo "PASS: distinct keys" || echo "FAIL: same key"
```

**Scaling to multiple agents (after Step 10 passes):**

Once the single-agent flow is validated end-to-end on mainnet, repeat this step to provision 2 more keys (`reckon-agent-1`, `reckon-agent-2`), bake them into separate iNFT brain blobs, and deploy the additional agents. The workflow and webhook stay the same — only the bearer token in the webhook call differs per agent.

---

curl -s -X POST http://147.182.164.208:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq '.result'

## PHASE 2: Workflow PoCs (Day 12-13)

### Step 5: Build the Challenge Submission Webhook Workflow

**Deliverable:** A KeeperHub workflow that: receives webhook → calls `Challenger.submit()` on Base → conditionally logs to MongoDB → posts to Discord.

**Work:**

Matches the workflow shape from guide §1.1. The `Challenger.submit()` signature lives at `packages/contracts/src/Challenger.sol` (takes `orderHash`, `challengerBond`, `agentTokenId`, `permit`, `signature`).

```javascript
mcp__keeperhub__create_workflow({
  name: "reckon-challenge-submit",
  description: "Webhook-triggered Challenger.submit() on Base with retry, MongoDB logging, Discord notification",
  nodes: [
    { id: "webhook-trigger", type: "webhook", data: { auth: "bearer" } },
    { id: "web3-submit", type: "web3-write", data: {
        chain: "8453",
        contractAddress: "<CHALLENGER_ADDRESS>",
        method: "submit",
        abi: [{
          inputs: [
            { name: "orderHash", type: "bytes32" },
            { name: "challengerBond", type: "uint256" },
            { name: "agentTokenId", type: "uint256" },
            { components: [
                { components: [
                    { name: "token", type: "address" },
                    { name: "amount", type: "uint256" }
                  ], name: "permitted", type: "tuple" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
              ], name: "permit", type: "tuple" },
            { name: "signature", type: "bytes" }
          ],
          name: "submit",
          outputs: [],
          stateMutability: "nonpayable",
          type: "function"
        }],
        params: [
          "{{@webhook-trigger:Webhook.orderHash}}",
          "{{@webhook-trigger:Webhook.challengerBondAmount}}",
          "{{@webhook-trigger:Webhook.agentTokenId}}",
          {
            permitted: {
              token: "{{@webhook-trigger:Webhook.permit.permitted.token}}",
              amount: "{{@webhook-trigger:Webhook.permit.permitted.amount}}"
            },
            nonce: "{{@webhook-trigger:Webhook.permit.nonce}}",
            deadline: "{{@webhook-trigger:Webhook.permit.deadline}}"
          },
          "{{@webhook-trigger:Webhook.signature}}"
        ]
    }},
    { id: "check-tx", type: "conditional",
      data: { condition: "{{@web3-submit:Transaction.status}} == 1" } },
    { id: "log-success", type: "http", data: {
        method: "POST",
        url: "https://data.mongodb-api.com/app/<APP_ID>/endpoint/data/v1/action/insertOne",
        headers: {
          "Authorization": "Bearer <ATLAS_KEY>",
          "Content-Type": "application/json"
        },
        body: {
          dataSource: "Cluster0", database: "reckon", collection: "challenges",
          document: {
            orderHash: "{{@webhook-trigger:Webhook.orderHash}}",
            agentTokenId: "{{@webhook-trigger:Webhook.agentTokenId}}",
            txHash: "{{@web3-submit:Transaction.hash}}",
            status: "submitted"
          }
        }
    }},
    { id: "discord-success", type: "discord", data: {
        webhookUrl: "<DISCORD_URL>",
        message: "Challenge submitted for order {{@webhook-trigger:Webhook.orderHash}} by agent #{{@webhook-trigger:Webhook.agentTokenId}}. TX: {{@web3-submit:Transaction.hash}}"
    }},
    { id: "log-failure", type: "http", data: {
        method: "POST",
        url: "https://data.mongodb-api.com/app/<APP_ID>/endpoint/data/v1/action/insertOne",
        headers: {
          "Authorization": "Bearer <ATLAS_KEY>",
          "Content-Type": "application/json"
        },
        body: {
          dataSource: "Cluster0", database: "reckon", collection: "challenges",
          document: {
            orderHash: "{{@webhook-trigger:Webhook.orderHash}}",
            status: "failed",
            error: "{{@web3-submit:Transaction.error}}"
          }
        }
    }}
  ],
  edges: [
    { source: "webhook-trigger", target: "web3-submit" },
    { source: "web3-submit", target: "check-tx" },
    { source: "check-tx", target: "log-success", data: { condition: "true" } },
    { source: "check-tx", target: "log-failure", data: { condition: "false" } },
    { source: "log-success", target: "discord-success" }
  ]
})
```

Capture the auto-generated webhook URL → store as `KH_WEBHOOK_URL` in `.env`.

**Validation Test:**

```bash
# Test 1: Verify workflow structure
mcp__keeperhub__get_workflow({ workflowId: "<id>" })
# Expected: 6 nodes, 5 edges, webhook trigger type

# Test 2: Fire a test webhook (will revert — no real fill registered, that's expected)
curl -X POST "<WEBHOOK_URL>" \
  -H "Authorization: Bearer kh_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "orderHash": "0x0000000000000000000000000000000000000000000000000000000000000001",
    "challengerBondAmount": "100000000",
    "beneficiary": "0x0000000000000000000000000000000000000001",
    "agentTokenId": "1",
    "permit": {
      "permitted": {
        "token": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        "amount": "100000000"
      },
      "nonce": "1",
      "deadline": "999999999999"
    },
    "signature": "0x00...00"
  }'
# Expected: 200 OK with runId

# Test 3: Verify all 4 workflow nodes executed
mcp__keeperhub__get_execution_logs({ executionId: "<runId>" })
# Expected:
#   ✓ webhook-trigger received all 6 payload fields
#   ✓ web3-submit attempted tx (expected revert: no fill registered)
#   ✓ check-tx branched to false (failure path)
#   ✓ log-failure HTTP POST succeeded

# Test 4: Verify MongoDB received the failure log
curl -s -X POST \
  "https://data.mongodb-api.com/app/<APP_ID>/endpoint/data/v1/action/findOne" \
  -H "Authorization: Bearer <ATLAS_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "dataSource": "Cluster0",
    "database": "reckon",
    "collection": "challenges",
    "filter": { "orderHash": "0x000...001" }
  }' | jq '.document.status'
# Expected: "failed"
```

---

### Step 6: Build the Reputation Flush Schedule Workflow

**Deliverable:** KeeperHub workflow: daily 00:05 UTC → read pending reputation deltas from MongoDB → aggregate per-solver → write back → mark flushed → Discord notify.

**Work:**

HTTP-only workflow (no Web3 actions). Reads/writes MongoDB Atlas Data API. The CCIP-Read gateway at `ccip-gateway/src/db.ts` reads from the same `reputation_updates` collection this workflow writes to.

```javascript
mcp__keeperhub__create_workflow({
  name: "reckon-reputation-flush",
  description: "Daily 00:05 UTC: aggregate pending reputation deltas, write to MongoDB",
  nodes: [
    { id: "schedule", type: "schedule",
      data: { cron: "5 0 * * *", timezone: "UTC" } },
    { id: "read-pending", type: "http", data: {
        method: "POST",
        url: "https://data.mongodb-api.com/app/<APP_ID>/endpoint/data/v1/action/find",
        headers: {
          "Authorization": "Bearer <ATLAS_KEY>",
          "Content-Type": "application/json"
        },
        body: {
          dataSource: "Cluster0", database: "reckon",
          collection: "reputation_updates",
          filter: { flushed: { "$ne": true } },
          sort: { updatedAt: 1 }
        }
    }},
    { id: "aggregate", type: "collect", data: {
        input: "{{@read-pending:Response.documents}}",
        groupBy: "solverNamehash",
        aggregations: {
          reputationScore: { op: "avg", field: "reputationScore" },
          totalFills: { op: "sum", field: "totalFills" },
          slashCount: { op: "sum", field: "slashCount" }
        }
    }},
    { id: "write-aggregated", type: "http", data: {
        method: "POST",
        url: "https://data.mongodb-api.com/app/<APP_ID>/endpoint/data/v1/action/updateMany",
        headers: {
          "Authorization": "Bearer <ATLAS_KEY>",
          "Content-Type": "application/json"
        },
        body: {
          dataSource: "Cluster0", database: "reckon",
          collection: "subnames",
          filter: { namehash: { "$in": "{{@aggregate:Collect.keys}}" } },
          update: { "$set": "{{@aggregate:Collect.results}}" }
        }
    }},
    { id: "mark-flushed", type: "http", data: {
        method: "POST",
        url: "https://data.mongodb-api.com/app/<APP_ID>/endpoint/data/v1/action/updateMany",
        headers: {
          "Authorization": "Bearer <ATLAS_KEY>",
          "Content-Type": "application/json"
        },
        body: {
          dataSource: "Cluster0", database: "reckon",
          collection: "reputation_updates",
          filter: { flushed: { "$ne": true } },
          update: { "$set": { flushed: true } }
        }
    }},
    { id: "discord-notify", type: "discord", data: {
        webhookUrl: "<DISCORD_URL>",
        message: "Daily reputation flush complete: {{@aggregate:Collect.count}} solvers updated."
    }}
  ],
  edges: [
    { source: "schedule", target: "read-pending" },
    { source: "read-pending", target: "aggregate" },
    { source: "aggregate", target: "write-aggregated" },
    { source: "write-aggregated", target: "mark-flushed" },
    { source: "mark-flushed", target: "discord-notify" }
  ]
})
```

**Validation Test:**

```bash
# Test 1: Seed test data into MongoDB
curl -s -X POST \
  "https://data.mongodb-api.com/app/<APP_ID>/endpoint/data/v1/action/insertMany" \
  -H "Authorization: Bearer <ATLAS_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "dataSource": "Cluster0",
    "database": "reckon",
    "collection": "reputation_updates",
    "documents": [
      { "solverNamehash": "0xaaa1", "reputationScore": 950,
        "totalFills": 10, "slashCount": 1 },
      { "solverNamehash": "0xaaa1", "reputationScore": 940,
        "totalFills": 5, "slashCount": 0 },
      { "solverNamehash": "0xbbb2", "reputationScore": 1000,
        "totalFills": 20, "slashCount": 0 }
    ]
  }'

# Test 2: Trigger manually (don't wait for 00:05 UTC)
mcp__keeperhub__execute_workflow({ workflowId: "<id>" })
mcp__keeperhub__get_execution_status({ executionId: "<id>" })
# Expected: status "completed"

# Test 3: Verify all 5 steps ran in logs
mcp__keeperhub__get_execution_logs({ executionId: "<id>" })
# Expected: read-pending found 3 docs, aggregate produced 2 groups,
#   write-aggregated updated 2 solvers, mark-flushed marked 3, discord posted

# Test 4: Verify MongoDB — all seed docs marked flushed
curl -s -X POST \
  "https://data.mongodb-api.com/app/<APP_ID>/endpoint/data/v1/action/find" \
  -H "Authorization: Bearer <ATLAS_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "dataSource": "Cluster0",
    "database": "reckon",
    "collection": "reputation_updates",
    "filter": { "flushed": true }
  }' | jq '.documents | length'
# Expected: 3

# Test 5: Verify CCIP-Read gateway serves the flushed values
curl http://localhost:3000/test/lookup/0xaaa1
# Expected: textRecords include reckon.reputation, reckon.totalFills
# (uses the test route in ccip-gateway/src/server.ts)
```

---

### Step 7: Wire Agent's `submit.ts` to the Real Webhook URL

**Deliverable:** The `submitChallengeViaKeeperHub` function in `agent/src/challenge.ts` sends the full `ChallengeWebhookPayload` (including Permit2 data) to the real webhook URL from Step 5.

**Work:**

The current function at `agent/src/challenge.ts:103-136` sends a minimal payload (`orderHash`, `agentTokenId`, `timestamp`). Expand it to match the webhook schema from guide §1.3:

1. Add `ChallengeWebhookPayload` type to `packages/types/src/keeperhub.ts`
2. Update `submitChallengeViaKeeperHub` to accept + send the full payload
3. Add Permit2 signature construction using viem's `signTypedData`
4. Update caller in `agent/src/index.ts` to pass full payload

**Webhook payload schema** (pin in `packages/types/src/keeperhub.ts`):

```typescript
interface ChallengeWebhookPayload {
  orderHash:           `0x${string}`;
  challengerBondAmount: string;       // bigint as decimal string, USDC 6-dec
  beneficiary:          `0x${string}`; // EOA receiving 60% restitution
  agentTokenId:         string;       // bigint as decimal string
  permit: {
    permitted: { token: string; amount: string };
    nonce:     string;
    deadline:  string;
  };
  signature:            `0x${string}`; // Permit2 signature
}
```

**Validation Test:**

```bash
# Test 1: Fire a test challenge via the agent code path
KH_WEBHOOK_URL=<url-from-step-5> npx tsx -e "
import { submitChallengeViaKeeperHub } from './agent/src/challenge.js';
const result = await submitChallengeViaKeeperHub({
  orderHash: '0x' + '01'.repeat(32),
  challengerBondAmount: '100000000',
  beneficiary: '0x' + '00'.repeat(19) + '01',
  agentTokenId: '1',
  permit: {
    permitted: {
      token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: '100000000'
    },
    nonce: '1',
    deadline: '999999999999'
  },
  signature: '0x' + '00'.repeat(65)
});
console.log(JSON.stringify(result));
"
# Expected: { success: true, runId: "..." } or { success: false, error: "..." }
# Either is valid — the HTTP call itself must succeed (200 from webhook).

# Test 2: Verify full payload received by KeeperHub
mcp__keeperhub__get_execution_logs({ executionId: "<runId>" })
# Expected: webhook-trigger node shows all 6 fields:
#   orderHash, challengerBondAmount, beneficiary, agentTokenId, permit, signature

# Test 3: TypeScript type check
cd packages/types && npx tsc --noEmit
# Expected: 0 errors (ChallengeWebhookPayload types align)
```

---

## PHASE 3: Skill Pack (Day 17-18)

### Step 8: Create the 5 Workflow Template JSON Files

**Deliverable:** 5 parameterized template JSON files in `keeper-skills/templates/`, each with `{{PARAM_*}}` placeholders.

**Work:**

Create under `keeper-skills/`:

```
keeper-skills/
  templates/
    challenger-submit-webhook.json      # From Step 5 definition
    reputation-flush-schedule.json      # From Step 6 definition
    fill-audit-query.json               # Manual → HTTP GET 0G Storage by root hash
    paid-ebbo-oracle-listing.json       # Manual → Web3 Read EBBOOracle.computeBenchmark()
    discord-slash-notification.json     # Event trigger on ChallengeSucceeded → Discord
```

Template details:

| # | Template | Trigger | Action | Source |
|---|----------|---------|--------|--------|
| 1 | `challenger-submit-webhook` | Webhook | Web3 Write `Challenger.submit()` + Conditional + MongoDB + Discord | Step 5 |
| 2 | `reputation-flush-schedule` | Schedule (daily 00:05 UTC) | HTTP GET MongoDB → Collect → HTTP POST MongoDB × 2 → Discord | Step 6 |
| 3 | `fill-audit-query` | Manual | HTTP GET 0G Storage indexer by root hash → return JSONL batch | New |
| 4 | `paid-ebbo-oracle-listing` | Manual | Web3 Read `EBBOOracle.computeBenchmark(tokenIn, tokenOut)` | ABI from `EBBOOracle.sol:128-138` |
| 5 | `discord-slash-notification` | Blockchain Event (`ChallengeSucceeded`) | Discord webhook | Event from `ReckonEvents.sol:47-52` |

Each template uses `{{PARAM_*}}` placeholders for contract addresses, MongoDB URLs, Discord webhook URLs, RPC endpoints.

**Validation Test:**

```bash
# Test 1: Verify each template has correct structure
npx tsx -e "
import { readdirSync, readFileSync } from 'fs';
for (const f of readdirSync('./keeper-skills/templates')) {
  const t = JSON.parse(readFileSync('./keeper-skills/templates/' + f, 'utf-8'));
  console.log(f, ':', t.nodes.length, 'nodes,', t.edges.length, 'edges');
}"
# Expected:
#   challenger-submit-webhook.json : 6 nodes, 5 edges
#   reputation-flush-schedule.json : 6 nodes, 5 edges
#   fill-audit-query.json          : 2 nodes, 1 edge
#   paid-ebbo-oracle-listing.json  : 2 nodes, 1 edge
#   discord-slash-notification.json: 2 nodes, 1 edge

# Test 2: All placeholders are documented
grep -roh 'PARAM_[A-Z_]*' keeper-skills/templates/ | sort -u
# Expected: PARAM_CHALLENGER_ADDRESS, PARAM_MONGODB_APP_ID, PARAM_ATLAS_API_KEY,
#   PARAM_DISCORD_WEBHOOK, PARAM_EBBO_ADDRESS, PARAM_CHAIN_ID, PARAM_ZG_INDEXER_URL

# Test 3: JSON validity
for f in keeper-skills/templates/*.json; do
  jq empty "$f" && echo "OK: $f"
done
# Expected: OK for all 5 files
```

---

### Step 9: Build the Deploy CLI + Publish npm Package

**Deliverable:** `@reckon-protocol/keeperhub-skills` installable via npm, runnable as `reckon-skills deploy --kh-key kh_xxx --network base`.

**Work:**

Build `keeper-skills/src/`:

```
keeper-skills/
  package.json          # bin, files, build scripts
  tsconfig.json
  src/
    index.ts            # CLI entry: parses --kh-key, --network, --dry-run
    deploy.ts           # Reads templates, replaces PARAM_*, calls create_workflow
    validate.ts         # Validates template JSON structure
  templates/            # From Step 8
  README.md
```

`package.json` additions:
- `"bin": { "reckon-skills": "./dist/index.js" }`
- `"files": ["dist/", "templates/", "README.md"]`

The `deploy.ts` script:
1. Reads each template JSON from `templates/`
2. Replaces `PARAM_*` placeholders with values from CLI flags or `.env`
3. Calls `create_workflow` per template via KeeperHub MCP
4. Logs created workflow IDs and webhook URLs

**Validation Test:**

```bash
# Test 1: Build
cd keeper-skills && npm run build
# Expected: 0 errors, dist/ populated

# Test 2: Dry run
node dist/index.js deploy --kh-key kh_xxx --network base --dry-run
# Expected: prints 5 workflow definitions with all PARAM_ values replaced, no API calls

# Test 3: Real deploy
node dist/index.js deploy --kh-key kh_xxx --network base
# Expected: 5 workflows created, output shows 5 workflow IDs

# Test 4: Verify all 5 workflows exist on KeeperHub
mcp__keeperhub__list_workflows()
# Expected: ≥5 workflows with names matching template names

# Test 5: Smoke-test one — execute fill-audit-query manually
mcp__keeperhub__execute_workflow({
  workflowId: "<fill-audit-query-id>",
  input: { rootHash: "0xdeadbeef" }
})
# Expected: completes (empty result OK, no errors)

# Test 6: Verify npm pack is clean
npm pack --dry-run
# Expected: includes dist/, templates/, README.md. No src/ or node_modules/.
```

---

## PHASE 4: Mainnet Deploy + Demo (Day 22-27)

### Step 10: Switch to Mainnet RPC + End-to-End Smoke Test

**Deliverable:** Challenge submission workflow runs against real Base mainnet with the full agent loop.

**Work:**

1. In KeeperHub Settings, delete custom RPC for chain 8453 (reverts to defaults) or set production Base mainnet RPC.
2. Fund Turnkey org wallet with ETH on Base for gas.
3. Ensure all contracts deployed on Base mainnet via `DeployBase.s.sol`.

**Validation Test:**

```bash
# Test 1: Trigger a controlled challenge via the agent
KH_WEBHOOK_URL=<production-webhook> \
BASE_RPC_URL=https://mainnet.base.org \
  npx tsx agent/src/index.ts

# Test 2: Verify KeeperHub Runs panel
mcp__keeperhub__get_execution_logs({ executionId: "<latest-run>" })
# Expected:
#   ✓ webhook-trigger received full payload
#   ✓ web3-submit has tx hash on Base mainnet
#   ✓ conditional branched correctly
#   ✓ MongoDB log written
#   ✓ Discord notification posted

# Test 3: Verify tx on Basescan
# Open https://basescan.org/tx/<txHash>
# Expected: To = Challenger contract, Method = submit(...), Status = Success or Revert

# Test 4: Verify MongoDB has the challenge record
curl -s -X POST \
  "https://data.mongodb-api.com/app/<APP_ID>/endpoint/data/v1/action/findOne" \
  -H "Authorization: Bearer <ATLAS_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "dataSource": "Cluster0",
    "database": "reckon",
    "collection": "challenges",
    "filter": { "txHash": "<txHash>" }
  }' | jq '.document.status'
# Expected: "submitted" or "failed"
```

---

### Step 11: Create the Paid EBBO Oracle Listing

**Deliverable:** `EBBOOracle.computeBenchmark()` listed on KeeperHub at $0.005/call, discoverable via `search_workflows`.

**Work:**

1. Open the `paid-ebbo-oracle-listing` workflow from Step 9 → click "List" in KeeperHub UI.
2. Set price: $0.005 USDC. Enable x402 (Base USDC) + MPP (Tempo USDC.e).
3. Save.

**Validation Test:**

```bash
# Test 1: Search for the listing
mcp__keeperhub__search_workflows({ query: "EBBO benchmark", chain: "8453" })
# Expected: returns listing with slug, price: 0.005, inputSchema (tokenIn, tokenOut)

# Test 2: Call the listed workflow
mcp__keeperhub__call_workflow({
  slug: "<slug>",
  inputs: {
    tokenIn: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    tokenOut: "0x4200000000000000000000000000000000000006"
  }
})
# Expected: returns benchmark price (uint256, 1e18 precision)

# Test 3: Cross-check against off-chain computation
npx tsx -e "
import { computeEBBO } from './agent/src/ebbo.js';
const r = await computeEBBO(
  'https://mainnet.base.org',
  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  '0x4200000000000000000000000000000000000006'
);
console.log(r.benchmarkPrice.toString());
"
# Expected: within ~0.1% of the on-chain result (block timing variance)
```

---

### Step 12: Set Up Discord Slash Notification Workflow

**Deliverable:** Workflow fires on `ChallengeSucceeded` events and posts formatted messages to Discord.

**Work:**

Deploy the `discord-slash-notification` template from Step 9 with the production Challenger contract address and Discord webhook URL.

Event signature: `ChallengeSucceeded(bytes32 indexed orderHash, bytes32 indexed fillerNamehash, bytes32 indexed challengerNode, uint256 slashAmount)` from `packages/contracts/src/lib/ReckonEvents.sol`.

Message template:
```
Slash executed: solver {{@filler:Solver.ensName}} forfeited {{@slash:Amount.usdc}} USDC.
60% to swapper {{@swapper:Address.short}}, 30% to challenger iNFT #{{@agent:TokenId}},
10% to protocol. EBBO benchmark: {{@oracle:Benchmark}} | Fill: {{@fill:Output}}
```

**Validation Test:**

```bash
# Test 1: Verify workflow has correct event trigger
mcp__keeperhub__get_workflow({ workflowId: "<id>" })
# Expected: trigger type "blockchain-event", event sig matches ChallengeSucceeded

# Test 2: Manually execute with test data
mcp__keeperhub__execute_workflow({
  workflowId: "<id>",
  input: {
    orderHash: "0x000...001",
    fillerNamehash: "0xaaa1",
    challengerNode: "0xbbb2",
    slashAmount: "12400000"
  }
})
# Expected: Discord channel receives formatted slash notification

# Test 3: If Step 10 produced a real slash, verify Discord received the
# notification automatically (no manual trigger needed).
```

---

### Step 13: Record AI-Generated Workflow Demo

**Deliverable:** 30-second recording showing `ai_generate_workflow` creating the reputation flush workflow from a natural language prompt.

**Work:**

In Claude Code with KeeperHub MCP connected:

```
mcp__keeperhub__ai_generate_workflow({
  prompt: "Create a daily 00:05 UTC schedule that reads pending reputation deltas
    from MongoDB collection reputation_updates where flushed is not true, aggregates
    per-solver counts, and writes updated values back to MongoDB, then marks source
    records as flushed.",
  context: "This is for the Reckon protocol. MongoDB Atlas Data API is used for
    HTTP access. The collection has fields: solverNamehash, reputationScore,
    totalFills, slashCount, lastSlashTimestamp, flushed, updatedAt."
})
```

**Validation Test:**

```bash
# Test 1: AI-generated workflow has correct structure
# Compare to Step 6's hand-built workflow. Must have:
#   ✓ Schedule trigger with cron "5 0 * * *"
#   ✓ HTTP GET to MongoDB
#   ✓ Aggregation/collect step
#   ✓ HTTP POST to write back
#   ✓ HTTP POST to mark flushed
#   ✓ At least 5 nodes, 4 edges

# Test 2: Deploy the generated workflow
mcp__keeperhub__create_workflow(<generated-definition>)
# Expected: workflow created

# Test 3: Execute against same seed data from Step 6
mcp__keeperhub__execute_workflow({ workflowId: "<ai-generated-id>" })
mcp__keeperhub__get_execution_status({ executionId: "<id>" })
# Expected: status "completed"
# Execution logs should show same flow as Step 6's manually-built workflow.
```

---

### Step 14: Write and Submit FEEDBACK.md

**Deliverable:** `FEEDBACK.md` at repo root with 3-5 concrete feedback items for KeeperHub, under 500 words.

**Work:**

Based on real experience from Steps 1-13, write feedback on the topics from guide §7.1. Prioritize issues actually encountered. Suggested topics:

1. **Webhook trigger schema validation** — no JSON Schema enforcement exists (confirmed Step 5). Suggest: optional JSON Schema attachment to webhook triggers that 400s on malformed payloads before consuming a run.
2. **Skill-pack deployment ergonomics** — deploying 5 templates requires 5 sequential `create_workflow` calls (experienced Step 9). Suggest: a `deploy_pack` meta-tool that takes an array of workflow definitions and deploys atomically.
3. **`kh_` vs `wfb_` key prefix discoverability** — easy to confuse initially (experienced Step 1/4). Suggest: a single API-keys page showing side-by-side which prefix to use for which surface.
4. **Turnkey wallet chain docs inconsistency** — `wallet-management/turnkey.md` lists only Ethereum but Base works fine (confirmed Step 2). Suggest: update Turnkey docs page to list all supported chains.
5. **Run-log retention policy** — undocumented (relevant for audit trail, Step 10). Suggest: document retention period for teams using Runs as audit trail.

Each item must reference the specific step where the issue was encountered.

**Validation Test:**

```bash
# Test 1: Word count
wc -w FEEDBACK.md
# Expected: < 500

# Test 2: Structure check — each item has scenario + expectation + suggestion
grep -c "###" FEEDBACK.md
# Expected: 3-5 (one H3 per feedback item)

# Test 3: References real steps (grounded in usage, not speculation)
grep -cE "Step [0-9]|Phase [0-9]" FEEDBACK.md
# Expected: ≥ 3

# Test 4: Committed
git status FEEDBACK.md
# Expected: tracked
```

---

## Critical Files Reference

| File | Role in KeeperHub Integration |
|------|-------------------------------|
| `agent/src/challenge.ts:103-136` | `submitChallengeViaKeeperHub` — expand to full payload (Step 7) |
| `packages/types/src/brain-blob.ts:27` | `BrainBlob.kh_api_key` — agent key storage (Step 4, single agent first) |
| `packages/types/src/keeperhub.ts` | New: `ChallengeWebhookPayload` type (Step 7) |
| `ccip-gateway/src/db.ts:24-47` | Gateway reads `reputation_updates` — same collection Step 6 writes |
| `packages/contracts/src/Challenger.sol` | `submit()` ABI used in webhook workflow (Step 5) |
| `packages/contracts/src/EBBOOracle.sol:128-138` | `computeBenchmark()` ABI for paid listing (Step 11) |
| `packages/contracts/src/lib/ReckonEvents.sol:47-52` | `ChallengeSucceeded` event for Discord trigger (Step 12) |
| `keeper-skills/` | Skill pack package root (Steps 8-9) |
