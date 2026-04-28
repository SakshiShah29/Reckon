# KeeperHub Implementation Guide for Reckon v0.10

**Source:** `https://github.com/KeeperHub/keeperhub/tree/staging/docs` (only the `docs/` folder, per scoping). Files inspected: `index.md`, `FAQ.md`, `ai-tools/mcp-server.md`, `ai-tools/agentic-wallet.md`, `ai-tools/claude-code-plugin.md`, `wallet-management/turnkey.md`, `wallet-management/gas.md`, `keepers/overview.md`, `keeper-runs/status-logs.md`, `notifications/providers.md`, `api/direct-execution.md`.
**Date compiled:** 2026-04-28
**Supersedes:** `keeperhub-implementation-guide-v0.7.md`
**Scope:** Concrete implementation guide for every place Reckon v0.10 touches KeeperHub. Three load-bearing surfaces:

1. **Webhook-triggered challenge submission workflow** (FR-8) — agent's `submit.ts` primitive fires HTTP → KeeperHub signs and broadcasts `Challenger.submit(...)` on Base mainnet with retry, gas estimation, and run logging.
2. **Schedule-triggered reputation flush workflow** (FR-7) — daily cron → reads pending reputation deltas from MongoDB → writes aggregated updates back to MongoDB `reputation_updates` collection. CCIP-Read gateway serves updated values to ENS clients on demand.
3. **`@reckon-protocol/keeperhub-skills` skill pack** (Phase 3 Day 17-18) — 5 pre-built workflow templates covering bounty Focus Area #2 ("don't make every developer redesign the same workflow").

Reckon also commits to two non-load-bearing items: a **paid workflow listing** for `EBBOOracle.computeBenchmark()` (FR-12) settling via x402+MPP, and a **Discord notification** action on slash events. And a **FEEDBACK.md** worth $500 (Phase 4 Day 27).

---

## Changelog from v0.7 guide

Key changes driven by v0.10 spec updates and refreshed KeeperHub docs:

1. **"Indexer" → "relayer"** terminology throughout (v0.10 spec change).
2. **ENS architecture overhaul.** v0.7 had L2 subname registrar + `ENSReputationWriter` contract. v0.10 uses `ReckonWildcardResolver` (ENSIP-10 + ERC-3668) on Ethereum mainnet + **virtual subnames** in MongoDB + `SolverRegistry`/`ChallengerRegistry` contracts on Base. No more `ENSReputationWriter`.
3. **Reputation flush workflow reshaped.** No longer calls `ENSReputationWriter.flushReputation()` on-chain. Now writes aggregated reputation to MongoDB; CCIP-Read gateway serves values to ENS clients. Workflow is lighter (HTTP-only, no Web3 Write).
4. **Agent architecture.** OpenClaw → SKILL.md + 5 standalone TypeScript primitives + thin orchestrator. The `submit.ts` primitive triggers the KeeperHub webhook.
5. **Wallet model clarified.** Para (MPC) has been **discontinued**; KeeperHub now uses **Turnkey** (TEE) as the sole wallet provider. The v0.7 guide's Turnkey references were correct; this guide corrects the earlier v0.10 draft that mistakenly listed Para as primary based on a stale FAQ reference.
6. **Custom RPC confirmed.** KeeperHub FAQ now explicitly says "Yes" to custom RPC endpoints per chain in Settings. Resolves a v0.7 open item.
7. **API rate limits clarified.** Authenticated API = 100 req/min. Direct Execution API = 60 req/min per key (unchanged).
8. **Gas multiplier nuance.** v0.10 spec budgets challenge submission at 1.5× default (≤ 420k post-multiplier). KeeperHub docs confirm 2.0× for time-sensitive triggers (webhook/event) on Base. Both numbers noted; real webhook cost is 2.0× (≤ 560k).
9. **Contract count.** 8 → 10 contracts. New: `SolverRegistry`, `ChallengerRegistry` on Base, `ReckonWildcardResolver` on Ethereum mainnet. Removed: `ENSReputationWriter`, L2 subname registrar.

---

## 0. Pin the framing

| Concept | What it is | Reckon usage |
|---|---|---|
| **KeeperHub** | "Execution and reliability layer for AI agents operating onchain." Visual workflows: **trigger → actions → conditions** with `{{@nodeId:Label.field}}` template references. | Core. Gas-paid signing + retry + audit log + run history. |
| **Trigger types** | Manual, Schedule, Webhook, Blockchain Event, Block Interval. | Webhook (FR-8 challenge submission), Schedule (FR-7 reputation flush), Event (§5 Discord slash notification). |
| **Action types** | Web3 (read/write contracts, ERC-20, balance, log queries), Notifications (Discord/Telegram/SendGrid email/generic Webhook), System (HTTP, conditional, loops, Collect, templates), Math (sum/count/avg/median/min/max/product). | Web3 write for tx submission; Discord notification on slash; HTTP for MongoDB writes and paid-workflow facilitator pings. |
| **Wallet model** | **Turnkey** — hardware-enclave (TEE) key storage. Org wallet shared across the org. Pays gas in **native chain currency (ETH on Base)**. Para (MPC) has been **discontinued** — KeeperHub transitioned to Turnkey as the sole wallet provider. | Reckon's KeeperHub org wallet (Turnkey) pays Base ETH gas for our own workflow runs. |
| **Agentic wallet** | Separate skill+npm package (`@keeperhub/wallet`); per-wallet Turnkey sub-org; HMAC-authenticated; agent holds **no private key**. Hard-capped at 100 USDC/tx, 200 USDC/day. Three-tier safety hook (auto/ask/block) via `PreToolUse`. | **Not used** for solver/challenger bonds (caps conflict with our 1000 USDC base bond). Used only as the recipient/payer on x402+MPP paid-workflow flows. |
| **Supported chains** | Ethereum, Base, Arbitrum, Polygon, Optimism, Sepolia (testnet). | Base (mainnet target); Anvil-forked Base mainnet during dev — see §1.2 for the dev-vs-prod mapping. |
| **Custom RPC** | Yes — per FAQ: "In Settings, set a primary and fallback RPC URL per chain. Your custom endpoints replace the platform defaults." | **Confirmed usable** for pointing chain 8453 at our Anvil fork RPC during dev. Resolves v0.7 open item. |
| **MCP endpoint** | `https://app.keeperhub.com/mcp` (HTTP). Auth: OAuth 2.1 (interactive) or `kh_`-prefixed bearer (headless). 19 tools exposed. | Headless `kh_` per agent. Org-scoped only. |
| **API key prefixes** | `kh_` = organisation (REST + MCP + plugin); `wfb_` = user (webhook triggers only). | Generate `kh_` once per org for MCP; one `kh_` per challenger agent encoded into the iNFT brain blob. |
| **Rate limits** | Authenticated API: **100 req/min**. Direct Execution API: **60 req/min per API key**. | Webhook trigger inside a workflow is our preferred shape, not Direct Execution — but worth knowing limits. |
| **Gas multipliers** | Per FAQ: Base/Arbitrum = **1.5× normally**, **2.0× for time-sensitive triggers** (events, webhooks). Ethereum/Polygon = 2.0× normally, 2.5× for time-sensitive. Override possible via Advanced section (absolute gas limit, bypasses multiplier). | Webhook trigger means **2.0× multiplier** applies to challenge submission. Pre-multiplier budget ≤ 280k → post ≤ 560k on Base. v0.10 spec budgets conservatively at 1.5× (≤ 420k); real webhook cost is within the 560k envelope. |

---

## 1. Webhook-triggered challenge submission (FR-8, Builder A Phase 2 Day 12-13)

### 1.1 Workflow shape

```
[Webhook Trigger]
    │  (auth: kh_ bearer; payload validated against JSON schema)
    ▼
[Web3 Write: Challenger.submit(...)]
    │  (Turnkey-signed; Base mainnet; 2.0× gas multiplier auto for webhook trigger)
    ▼
[Conditional: tx.status == 1 ?]
    │ ┌─────────── true ───────────┐    ┌──────── false ────────┐
    │ ▼                            │    ▼                       │
    │ [HTTP POST → MongoDB write   │    [Retry handler (KH default exponential backoff)]
    │  challenges collection]      │    │
    │ │                            │    ▼
    │ ▼                            │    [HTTP POST → MongoDB log "challenge_submit_failed"]
    │ [Discord: "challenger X      │
    │  submitted for orderHash Y"] │
    └──────────────────────────────┘
```

Build this through MCP — Builder A invokes `create_workflow` from Claude Code with the canonical shape above. The skill pack (§3) ships this as a deployable template.

**v0.10 change:** `Challenger.submit()` now verifies the challenger's subname registration via `ChallengerRegistry.isRegistered(namehash)` (not via ENS reverse-lookup as in v0.7). The contract also verifies `agentTokenId` ownership via `OwnerRegistry.ownerOf(agentTokenId)` on Base. The workflow shape is unchanged — these are internal contract-side checks, not workflow-level changes.

### 1.2 The dev-vs-prod chain story

Reckon develops against an Anvil fork of Base mainnet. KeeperHub does not know about Anvil forks — there's no "Anvil fork" entry in its supported-chains list. However, **KeeperHub now confirms custom RPC support** per FAQ:

> "In Settings, set a primary and fallback RPC URL per chain. Your custom endpoints replace the platform defaults. Delete the preference to revert."

This resolves the v0.7 uncertainty. The dev-vs-prod mapping simplifies:

- **During Phase 2 development:** target **Base Sepolia** for the KeeperHub workflow PoC. Same Solidity bytecode, KeeperHub-supported. Verify wallet signing + retry + run-log shape.
- **During Phase 3 integration testing:** configure a **custom RPC URL** in KeeperHub Settings pointing chain 8453 at the **Hetzner-hosted long-running Anvil fork's RPC URL**. The agent fires the webhook against the real KeeperHub Base mainnet workflow, but transactions route through the Anvil fork. Chain ID stays 8453 because the fork mirrors mainnet.
- **Phase 4 mainnet deploy:** delete the custom RPC preference in Settings to revert to KeeperHub defaults, or set a production Base mainnet RPC. One config change.

**Fallback** (unlikely now): if the custom RPC override on chain 8453 is rejected in practice despite the FAQ confirming it, fall back to "demo against Base Sepolia for the webhook leg, run a parallel locally-signed `submit()` against the Anvil fork for the EBBO-math leg." Document as a known gap, raise during Phase 0 verification.

### 1.3 Webhook payload schema

Pin in `@reckon-protocol/types/keeperhub.ts`:

```typescript
interface ChallengeWebhookPayload {
  orderHash:     `0x${string}`;
  challengerBondAmount: string;     // bigint as decimal string, USDC 6-dec
  beneficiary:   `0x${string}`;     // EOA receiving 60% restitution (the swapper)
  agentTokenId:  string;            // bigint as decimal string
  permit:        {                  // Permit2 signature payload for the bond pull
    permitted: { token: string; amount: string };
    nonce:     string;
    deadline:  string;
  };
  signature:     `0x${string}`;     // Permit2 signature
}
```

Webhook URL is auto-generated by KeeperHub at workflow creation time (per `keepers/overview.md`); we capture it at deploy time and bake it into the agent's iNFT brain blob alongside the `kh_` API key.

**v0.10 note:** the `submit.ts` primitive (one of 5 standalone TypeScript scripts in the agent's `agent/scripts/` directory) is the code that fires this webhook. The orchestrator spawns `submit.ts` as a child process with the webhook URL and payload passed via env vars from the decrypted iNFT brain blob.

### 1.4 Retry, gas, and idempotency

- **Retry:** "Failed steps are retried with exponential backoff" (FAQ). Configurable per-action; default works for our use case.
- **Gas multiplier:** Base webhook trigger = **2.0×** per KeeperHub docs. v0.10 spec NFR-1 budgets `Challenger.submit()` ≤ 280k pre-multiplier → ≤ 420k at the 1.5× default, ≤ 560k at the 2.0× webhook multiplier. Both are within tolerance for Base block gas.
- **Idempotency:** Docs don't mention idempotency tokens. For our webhook workflow, idempotency comes from the contract — `Challenger.submit()` reverts if the same `orderHash` has already been challenged (FR-5 behavior). On revert in retry, the run log captures the failure cleanly; no double-submit risk.
- **Observability:** the **Runs panel** (per `keeper-runs/overview.md`) records per-step inputs/outputs/transaction hashes/error messages, with `transactionLink` auto-populated. This is our primary debugging surface during demo (NFR-4).

### 1.5 Per-agent `kh_` keys — reasoning re-pinned

Direct Execution API rate cap = **60 req/min per API key.** Authenticated API = **100 req/min.** We don't use Direct Execution directly (we use webhook triggers), but the same per-key cap cascades. NFR-2 budgets N=20 simultaneous challenges in 60s. With 3 agents × 60 req/min = 180 req/min headroom we're comfortably under the cap, **provided each agent has its own `kh_` key.** Encode the per-agent `kh_` key in the iNFT brain blob (already pinned in `0g-implementation-guide-v0.7.md` §2.3, brain blob schema).

---

## 2. Schedule-triggered reputation flush (FR-7, Builder A Phase 2 Day 12)

### 2.1 Workflow shape — v0.10 (significantly changed from v0.7)

**v0.7 shape** (superseded): Schedule → HTTP GET MongoDB → Collect → **Web3 Write: `ENSReputationWriter.flushReputation()`** → Conditional → MongoDB mark flushed.

**v0.10 shape** (current):

```
[Schedule Trigger: every 24h, UTC 00:05]
    │
    ▼
[HTTP GET MongoDB → reputation_updates_pending]
    │  (read-only consumer credentials; collected since last flush)
    ▼
[System: Collect (aggregate per-solver reputation deltas)]
    │
    ▼
[HTTP POST → MongoDB: write aggregated reputation to reputation_updates collection]
    │  (update each solver's document with new reckon.reputation, reckon.totalFills,
    │   reckon.slashCount, reckon.lastSlash, reckon.bondLocked values)
    ▼
[HTTP POST → MongoDB: mark source delta records as flushed]
    │
    ▼
[Discord: "Daily reputation flush complete: N solvers updated"]
```

**Why this changed:** v0.10 replaces the on-chain `ENSReputationWriter` contract and L2 subname registrar with **virtual subnames** stored entirely in MongoDB. Reputation is no longer written to ENS text records on-chain. Instead:
- Reputation values are stored in MongoDB's `subnames` and `reputation_updates` collections
- The **CCIP-Read gateway** (Builder A's Node.js service) reads MongoDB and signs responses per ERC-3668 when any ENS client resolves a Reckon subname's text records
- External apps calling `getText("reckon.reputation")` on `bunni.solvers.reckon.eth` via viem/ethers/wagmi get the latest value transparently — they don't know it comes from MongoDB

**Impact on KeeperHub workflow:** the reputation flush workflow is now **HTTP-only** (no Web3 Write action). This means:
- No gas cost for the flush itself
- No wallet signing required
- Schedule trigger's 1.5× gas multiplier is moot — there's no on-chain transaction
- The workflow is simpler and cheaper to run
- Failure mode is simpler: if MongoDB write fails, retry; no on-chain revert to handle

### 2.2 Source of truth

Reputation deltas accumulate in MongoDB `reputation_updates` collection (FR-13). The schedule workflow reads, aggregates, and writes the final values back to MongoDB. The CCIP-Read gateway serves the latest values to ENS clients in real-time (no 24h lag for reads — the gateway always reads live from MongoDB). The 24h schedule is for *aggregation and cleanup*, not for making data available.

v0.10 NFR-3 says: "If CCIP-Read gateway is offline: ENS clients receive errors when resolving Reckon subnames. On-chain operations (slashing, etc.) are unaffected." There is no fallback "on-chain slower path" as v0.7 implied — virtual subnames don't exist on-chain at all.

---

## 3. `@reckon-protocol/keeperhub-skills` skill pack (Builder A, Phase 3 Day 17-18)

The bounty's Focus Area #2 meta-pattern: **don't make every developer redesign the same workflow.** Ship pre-built templates, deployable in one command via the MCP `deploy_template` tool.

### 3.1 The 5 templates

1. **`challenger-submit-webhook`** — webhook-triggered `Challenger.submit()` with retry/gas estimation/MongoDB logging. (§1)
2. **`reputation-flush-schedule`** — daily schedule-triggered MongoDB reputation aggregation + write-back. **v0.10 change:** no longer calls `ENSReputationWriter.flushReputation()` on-chain; purely HTTP-based MongoDB read/write operations. (§2)
3. **`fill-audit-query`** — manual-triggered query into 0G Storage Log batch by root hash; returns the JSONL batch as workflow output. Used to verify "did this fill actually happen?" via the audit trail.
4. **`paid-ebbo-oracle-listing`** — paid workflow listing for `EBBOOracle.computeBenchmark()` at $0.005/call, settling via x402 on Base USDC OR MPP on Tempo USDC.e. (§4)
5. **`discord-slash-notification`** — webhook (called from the slash event relayer) → Discord channel post: "Solver `bunni.solvers.reckon.eth` slashed for 12.4 USDC; restitution sent to swapper `0xabc...`."

Total: ~300 LoC across the 5 template JSON files + a thin TS install wrapper.

### 3.2 Distribution

- npm package: `@reckon-protocol/keeperhub-skills`. License: MIT.
- Install pattern:
  ```bash
  npm install -g @reckon-protocol/keeperhub-skills
  reckon-skills deploy --kh-key kh_xxx --network base
  ```
- Under the hood: each template JSON is loaded, parameterized with the user's contract addresses + RPC endpoints + MongoDB connection strings, then deployed via MCP's `deploy_template` tool against the user's KeeperHub org.
- README pre-empts the question "why isn't this just an MCP wrapper?" with: *"KeeperHub's MCP server is the bridge. This pack is the templates that make the bridge useful for one specific protocol — Reckon. Other protocols would ship their own pack."*

### 3.3 Why 5 templates and not 3

The first three are core to Reckon. Templates 4 and 5 are independently useful and visibly demonstrate KeeperHub surface coverage:
- Template 4 hits **paid workflows** (Focus Area: monetization story).
- Template 5 hits **notifications** (Focus Area: visible operational feedback).

Together they cover most of the action types listed in `index.md` — Web3 read, Web3 write, Notifications (Discord), HTTP, Conditional, Schedule, Webhook, paid-workflow listing. Judges who skim the templates can verify breadth quickly.

---

## 4. Paid workflow — `EBBOOracle.computeBenchmark()` listing (FR-12)

### 4.1 What we list

A read-only KeeperHub workflow whose body is one Web3 Read action against `EBBOOracle.computeBenchmark(tokenIn, tokenOut)` returning the equal-weighted geometric mean across our 3 canonical pools.

### 4.2 Pricing and protocol

Per KeeperHub docs (`ai-tools/agentic-wallet.md` and Marketplace docs):

- **Two settlement protocols simultaneously:** x402 on Base USDC AND MPP on Tempo USDC.e. **The calling agent chooses based on what its wallet holds.** If both challenge types are offered, the agentic wallet submits one MPP credential (cheaper, near-instant Tempo settlement).
- **Reckon's price:** **$0.005/call.** Most workflows cost under $0.05 per call per docs. Our price signals "non-trivial computation, not free."
- **Auto-discovery:** x402scan + mppscan crawl listings via OpenAPI/PAYMENT-REQUIRED probes. No manual registration.

### 4.3 Listing flow

Per docs:
1. Open the workflow → click **List**.
2. Set per-call price in USDC.
3. Save. Becomes callable via the MCP endpoint.

We do this once during Phase 4 Day 26-27. Capture the listing URL for the demo video and README.

**Calling agents discover and pay via two meta-tools** (per `ai-tools/agentic-wallet.md`): `search_workflows` (find by category/tag/free text, returns slug + price + inputSchema) and `call_workflow` (execute by slug). The meta-tool pattern keeps the agent's tool list small regardless of how many workflows are listed.

### 4.4 Earnings

Two creator wallet balances accumulate independently: Base USDC and Tempo USDC.e. Both are USD-pegged stablecoins. Bridging is optional. For the demo we don't expect material volume; the $$ aren't the point — the **listing** is the point (real x402+MPP integration story).

### 4.5 Where the agentic wallet fits — and where it doesn't

The KeeperHub Agentic Wallet (`@keeperhub/wallet` npm package, per `ai-tools/agentic-wallet.md`) is a separate skill+npm package for **paying** paid workflows from an agent. Hard caps (server-side Turnkey policies, not bypassable):
- **100 USDC per transfer** (`transfer()`, `transferFrom()`, `TransferWithAuthorization`)
- **100 USDC per approval** (`approve()`)
- **200 USDC per UTC day** aggregate signed payments
- **Contract allowlist:** Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) + Tempo USDC.e (`0x20C000000000000000000000B9537D11c60E8b50`) only
- **Chain allowlist:** Base (8453), Tempo mainnet (4217), Tempo testnet (4218) only

For Reckon, this means:

- **Solver and challenger USDC bonds (1000 USDC and 100 USDC respectively, per FR-1/FR-5)** flow as **direct EOA `transferFrom`** through Permit2. **Not through the agentic wallet** — solver bond exceeds the 100 USDC per-tx cap. Already pinned in spec.
- **Paying for paid workflows** (e.g., a third-party agent calling our $0.005 EBBO oracle listing) is exactly what the agentic wallet is for. We don't need to ship one — anyone calling our listing brings their own. We just need to be a recipient.

**v0.10 note:** Three alternative agentic wallets exist per KeeperHub docs: the KeeperHub wallet (Turnkey custody), agentcash (plaintext key, testing only), and Coinbase agentic-wallet-skills (CDP ecosystem). All work with KeeperHub paid workflows. Reckon doesn't mandate which callers use.

---

## 5. Discord notification on slash (Phase 4 Day 26)

5-minute add per KeeperHub notification action types (Discord webhook). Action type: Discord, configured with a webhook URL from a Reckon-controlled channel's Server Settings. Message template:

```
Slash executed: solver {{@filler:Solver.ensName}} forfeited {{@slash:Amount.usdc}} USDC.
60% to swapper {{@swapper:Address.short}}, 30% to challenger iNFT #{{@agent:TokenId}},
10% to protocol. EBBO benchmark: {{@oracle:Benchmark}} | Fill: {{@fill:Output}}
```

Variable interpolation syntax matches KeeperHub's templating (`{{@nodeId:Label.field}}`). Triggered by an Event trigger on `Slashed(...)` event from `Challenger.sol` on Base mainnet (or Anvil-fork during dev).

Visually memorable in the demo video (Phase 4 Day 22-23 segment 0:55-1:20 per v0.10 video script). Listed as `discord-slash-notification` in the skill pack (§3.1, template 5).

---

## 6. AI workflow generation as a demo flourish (Phase 4 Day 26-27)

The MCP server exposes `ai_generate_workflow` (per `ai-tools/mcp-server.md`'s 19-tool list and FAQ's "describe what you want" capability). 30 seconds of demo footage:

> *"Watch us generate the daily reputation flush workflow from a one-line description."*

Already in the spec (Phase 4 Day 26-27). Concrete shape: in Claude Code with the KeeperHub MCP server attached, run:

```
> Use ai_generate_workflow to create a daily 00:05 UTC schedule that reads
> pending reputation deltas from MongoDB collection reputation_updates_pending,
> aggregates per-solver counts, and writes the updated values back to MongoDB
> reputation_updates collection.
```

**v0.10 change:** the generated workflow is now HTTP-only (MongoDB read/write), not a Web3 Write to `ENSReputationWriter`. This is actually easier to demo — no wallet funding needed, no gas estimation complexity.

KeeperHub generates the workflow JSON, we click Deploy. Cuts the time-to-build from ~20 minutes to ~30 seconds; the **point of the demo isn't the time saving, it's that real product capability exists and we use it.**

---

## 7. FEEDBACK.md — the $500 bounty deliverable (Phase 4 Day 27)

Bounty pays $500 specifically for high-quality, actionable feedback. The spec already commits. To maximize EV, structure as concrete and specific — not generic:

### 7.1 Topic suggestions (pick 3-5; under 500 words total)

1. **MCP key prefix discoverability** — `kh_` vs `wfb_` is documented in FAQ but easy to confuse initially. Suggest: a single API-keys page that shows side-by-side which prefix to use for which surface, with a visual flow diagram.
2. ~~**Custom RPC override on supported chains**~~ — **RESOLVED.** KeeperHub FAQ now explicitly confirms custom RPC support per chain in Settings. No longer a feedback item; instead, commend the feature and suggest documenting it more prominently on the gas/chain configuration pages.
3. **Skill-pack ergonomics** — once we shipped `@reckon-protocol/keeperhub-skills`, the natural next ask is a `KH-deploy-pack` first-class CLI command that takes a single npm package and deploys all its templates with one config block. The current path (loop over `deploy_template` per template) works but is verbose.
4. **Webhook trigger schema validation** — auto-generated webhook URLs accept any JSON; we'd benefit from optional JSON Schema attached to the trigger that 400s on shape violations before consuming a workflow run.
5. **Turnkey wallet supported-chains documentation inconsistency** — `wallet-management/turnkey.md` lists only "Ethereum Mainnet and Sepolia Testnet" as supported networks, but the platform clearly operates on Base, Arbitrum, Polygon, and Optimism (per FAQ and `index.md`). Suggest: update the Turnkey docs page to list all supported chains, matching reality.
6. **Run-log retention policy** — Runs panel is excellent for debugging but docs don't quote a retention period. For teams using it as an audit trail, a documented retention policy would help.

Submit by Phase 4 Day 27.

---

## 8. End-to-end checklist by phase

### Phase 0 Day 1 (Builder A):

- [ ] Generate `kh_`-prefixed organisation API key at `app.keeperhub.com → Settings → API Keys → Organisation`. **Not** `wfb_`.
- [ ] `claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp`
- [ ] `/mcp` in Claude Code → authorize via OAuth, OR pass bearer for headless
- [ ] Hello-world workflow: schedule trigger → Web3 Read on Base Sepolia → Discord notification
- [ ] Confirm `kh_` key works for both MCP and webhook trigger surfaces
- [ ] Set up org wallet (Turnkey) and confirm signing works on Base Sepolia (small test tx)
- [ ] **Test custom RPC override:** in Settings, set a custom RPC URL for chain 8453 pointing at a known Base mainnet RPC. Run a Web3 Read workflow. Confirm it uses the custom RPC. Then test with the Anvil fork RPC URL. This validates the dev-vs-prod chain story (§1.2)
- [ ] Verify supported-chains list includes **Base** (mainnet target). Reckon doesn't need Unichain.
- [ ] Provision **3 additional `kh_` keys** (one per challenger agent) for Phase 1 — these get baked into iNFT brain blobs by Builder B

### Phase 1 (Builder A):

- [ ] No KeeperHub work yet — Phase 1 is contracts + relayer + ENS wildcard resolver + MongoDB

### Phase 2 Day 12-13 (Builder A):

- [ ] **`challenger-submit-webhook`** workflow PoC on Base Sepolia
  - Webhook trigger with payload schema from §1.3
  - Web3 Write action: `Challenger.submit(...)` with all 6 params
  - Conditional on tx success
  - HTTP POST to MongoDB on success
  - Confirm 2.0× gas multiplier auto-applied (webhook trigger per KeeperHub FAQ)
  - Confirm Runs panel logs per-step inputs/outputs/tx hash
- [ ] **`reputation-flush-schedule`** workflow PoC
  - Schedule trigger: daily 00:05 UTC
  - HTTP GET MongoDB pending reputation deltas
  - System: Collect (aggregate per-solver)
  - HTTP POST MongoDB: write aggregated reputation values
  - HTTP POST MongoDB: mark source records flushed
  - **No Web3 Write** — reputation is stored in MongoDB, served by CCIP-Read gateway
- [ ] Document the workflow JSON for both — these become skill pack templates

### Phase 3 Day 17-18 (Builder A):

- [ ] `@reckon-protocol/keeperhub-skills` published to npm
  - 5 templates: §3.1
  - Installer wraps MCP `deploy_template` calls
  - README + MIT license
- [ ] Pin against Base mainnet (not Sepolia) in template defaults
- [ ] Discord webhook URL configured in `discord-slash-notification` template
- [ ] Confirm `reputation-flush-schedule` template uses HTTP-only MongoDB pattern (no `ENSReputationWriter` reference)

### Phase 4 (Builder A):

- [ ] Day 22-23: Switch challenger-submit workflow's RPC config from Anvil fork to real Base mainnet (delete custom RPC preference or set production RPC in Settings)
- [ ] Day 24-25: Mainnet smoke test — trigger a low-quality fill, observe webhook fire via `submit.ts` primitive, KeeperHub Runs panel shows the full run, slash executes, Discord posts the notification
- [ ] Day 26-27: List `EBBOOracle.computeBenchmark()` as paid workflow at $0.005/call. Verify x402scan + mppscan crawl picks it up.
- [ ] Day 26-27: Record AI-workflow-generation demo clip (30s) — generate the reputation flush workflow from a one-line description
- [ ] Day 27: Submit `FEEDBACK.md` per §7

---

## 9. Spec deltas this guide locks in

These are commitments the spec should reference back to:

1. **Webhook trigger** for FR-8 challenge submission. **Schedule trigger** for FR-7 reputation flush. (Preserved from v0.7.)
2. **Per-agent `kh_` keys** baked into iNFT brain blobs to stay under 60 req/min Direct Execution cap.
3. **Base mainnet** is the production target. **Base Sepolia** for Phase 2 KeeperHub PoC. **Custom RPC override on chain 8453** (now confirmed supported by KeeperHub FAQ) for dev integration testing against the Anvil fork.
4. **Webhook trigger gas multiplier = 2.0×** on Base per KeeperHub docs. Pre-multiplier challenge-submit budget ≤ 280k → ≤ 560k post-multiplier. v0.10 spec budgets at 1.5× default (≤ 420k) — the spec is conservative; real webhook cost is within the 560k envelope.
5. **Schedule trigger gas multiplier is moot** for v0.10 reputation flush — workflow is HTTP-only (no on-chain tx). If future versions add on-chain writes, Base schedule default 1.5× applies.
6. **5-template skill pack** is the Focus Area #2 deliverable, not a generic MCP wrapper. ~300 LoC. (Preserved from v0.7.)
7. **Paid workflow lists at $0.005/call** with both x402 and MPP enabled by default — caller picks. Auto-discoverable via meta-tools `search_workflows` + `call_workflow`.
8. **Solver/challenger bonds bypass the agentic wallet** (caps incompatible). Direct Permit2 EOA flow. (Preserved from v0.7.)
9. **Runs panel = primary debugging surface** during demo (NFR-4).
10. **Discord notification on slash** is a 5-min add via Discord webhook action.
11. **`ai_generate_workflow`** is real and demoable. 30s of footage worth the prep. v0.10 demo prompt updated to reflect HTTP-only reputation flush (no `ENSReputationWriter`).
12. **FEEDBACK.md is concrete and specific** per §7 topic suggestions. Submit by Day 27. Topic #2 (custom RPC) resolved; replaced with Turnkey chain-support docs inconsistency and retention policy topics.
13. **Reputation flush is now HTTP-only** — writes to MongoDB, CCIP-Read gateway serves values. No on-chain gas cost for reputation updates.

---

## 10. Open items the docs don't resolve

These are real gaps Builder A should expect to hit:

- ~~**Custom RPC override behavior on supported chains.**~~ **RESOLVED.** KeeperHub FAQ explicitly confirms: "In Settings, set a primary and fallback RPC URL per chain." Docs do not specify validation behavior (chain ID checking, RPC health validation). Phase 0 task: confirm it works with an Anvil fork URL (chain 8453 with non-canonical RPC), and test with an intentionally wrong chain ID to understand validation boundaries.
- ~~**MongoDB HTTP action authentication.**~~ **RESOLVED.** KeeperHub's HTTP/webhook plugin confirms support for Bearer tokens in headers, JSON POST bodies, and `{{NodeName.field}}` variable interpolation. Use MongoDB Atlas Data API (`https://data.mongodb-api.com/app/<app-id>/endpoint/data/v1/action/...`) with `Authorization: Bearer <atlas-data-api-key>` header and JSON body. Phase 0 task: enable Atlas Data API on the M0 cluster and confirm a KeeperHub HTTP action can read/write documents.
- **Webhook trigger payload schema enforcement.** (Confirmed undocumented as of 2026-04-28.) No JSON Schema attachment capability exists for webhook triggers. Docs imply auto-generated webhook URLs accept any JSON. We implement schema validation client-side in `submit.ts` before firing. If KeeperHub later adds JSON Schema attachment, migrate.
- **Idempotency on retried writes.** (Confirmed undocumented as of 2026-04-28.) Docs don't mention idempotency tokens or deduplication mechanisms. Idempotency comes from the contract (`Challenger.submit()` reverts on duplicate `orderHash`). Confirmed safe; document the reasoning in NFR-3.
- **Run-log retention period.** (Confirmed undocumented as of 2026-04-28.) Docs say "Run history is stored for each workflow and persists across sessions" but quote no retention timeframe. Mitigation: write fills/challenges/slashes independently to MongoDB Atlas (already FR-13); the Runs panel is for live debugging, not the system of record.
- **Concurrency semantics under multiple simultaneous webhook hits to the same workflow.** (Confirmed undocumented as of 2026-04-28.) Docs don't specify if multiple parallel invocations queue or run concurrently. Per-key 60/min cap is the only documented bound. Empirical Phase 3 Day 20 test: N=20 concurrent challenges, observe.
- **Turnkey wallet chain support inconsistency.** `wallet-management/turnkey.md` says "Ethereum Mainnet and Sepolia Testnet" only, but FAQ and `index.md` list Base/Arbitrum/Polygon/Optimism as supported. The newer pages are authoritative — Base works with the Turnkey org wallet. If Phase 0 hello-world fails on Base Sepolia with the org wallet, that's the canary; raise immediately.

If any of these resolve differently in practice, update this guide in place — not a new file.
