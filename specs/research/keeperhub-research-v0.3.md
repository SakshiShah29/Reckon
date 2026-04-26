# KeeperHub Research Notes for Reckon v0.3

**Source:** `https://github.com/KeeperHub/keeperhub/tree/staging/docs` (read-only research; only the `docs/` folder, not the rest of the repo). Files inspected: `index.md`, `FAQ.md`, `workflows/paid-workflows.md`, `ai-tools/overview.md`, `ai-tools/mcp-server.md`, `ai-tools/agentic-wallet.md`, `ai-tools/claude-code-plugin.md`, `wallet-management/turnkey.md`, `wallet-management/gas.md`.
**Date compiled:** 2026-04-26
**Purpose:** Validate the KeeperHub assumptions baked into `reckon-spec-v0.3.md` and surface concrete spec edits.

The spec leans on KeeperHub for **two load-bearing behaviors** (FR-7, FR-8): (a) submit challenger transactions with retry/gas-optimization/audit; (b) batch-flush reputation updates daily. It also commits to a third deliverable for KeeperHub bounty Focus Area #2: **`@reckon-protocol/keeperhub-openclaw` connector**. Most of the directional choices are right, but several specifics are wrong, and one architectural assumption (paying workflows in x402 USDC) misuses what x402 actually means in KeeperHub.

---

## 1. What KeeperHub actually is — pin the framing

From `index.md`: *"KeeperHub is the execution and reliability layer for AI agents operating onchain. Build visual workflows that monitor onchain state, execute transactions, and send notifications -- without writing code or managing infrastructure."*

Workflow model: **Trigger → Actions → Conditions/Branching → outputs**, with template references `{{@nodeId:Label.field}}` for cross-step data flow.

**Trigger types** (this matters for FR-7 / FR-8):
| Trigger | When it fires |
|---|---|
| Manual | Click Run in the builder |
| Schedule | Recurring interval (every N minutes / hourly / daily) |
| Webhook | External HTTP request |
| Blockchain Event | Specific contract event emitted onchain |
| Block Interval | At regular block intervals on a specific chain |

**Action types include:** Web3 (read/write contracts, ERC-20 transfers, balance checks, log queries), Notifications (Discord / Telegram / SendGrid), System (HTTP, conditionals, loops, Collect aggregation, templates), Math (sum / count / average / median / min / max / product).

**Spec changes required:** Pin in FR-8 that the "auto-submit challenge" workflow uses a **Webhook trigger** (agent fires HTTP → KeeperHub submits tx). Pin in FR-7 that the daily reputation flush uses a **Schedule trigger** (every 24h). The spec currently leaves trigger type unspecified in both places.

---

## 2. Networks — Unichain is **not** supported. Decision needed.

From `FAQ.md`: *"Ethereum Mainnet, Base, Arbitrum, Polygon, Optimism, and Sepolia (testnet)."*
From `wallet-management/turnkey.md`: *"currently supports Ethereum Mainnet and Sepolia Testnet."* (Older page; FAQ is more recent and broader.)

**Unichain Sepolia is not in the supported list.** The spec's Phase 0 commits to *"Unichain Sepolia for development, Base Sepolia as fallback."* If we go Unichain, **KeeperHub doesn't reach our contracts**, which kills FR-7 and FR-8.

This isn't a small footnote — it changes Phase 0's chain decision. The straightforward fix:

- **Use Base Sepolia for development** (KeeperHub-supported, UniswapX-friendly).
- Keep Unichain Sepolia as a "nice-to-have second deployment" only if time allows.
- For Phase 4 mainnet, **Base mainnet** stays as planned (KeeperHub supported, UniswapX live there).

**Spec changes required:**
- Phase 0 Day 1: flip the order — *"Base Sepolia for development; Unichain Sepolia only if KeeperHub adds support before Phase 2."*
- Pre-build checklist: add "Confirm KeeperHub supports our target dev chain. Currently: Ethereum, Base, Arbitrum, Polygon, Optimism, Sepolia. Unichain not supported."
- Risk #2 (UniswapX testnet availability): note that even if UniswapX is on Unichain, we still can't use Unichain because KeeperHub isn't there.

---

## 3. The wallet model — Turnkey, not Para. And signing isn't free.

The docs are mid-rename. `index.md` (newest): *"Every account is secured with a Turnkey wallet using hardware-backed key storage."* `FAQ.md` (older sections): *"Para wallet... uses MPC."* The `agentic-wallet.md` page resolves it: **creator wallets are Turnkey sub-orgs**.

**Spec says (Phase 1 Day 6-7):** *"Confirm Turnkey signing works. Confirm x402 billing on workflow execution."*

Turnkey signing is fine — that's what the docs describe. But **"x402 billing on workflow execution" misunderstands x402 in KeeperHub**. See §4.

**Spec says (multiple places):** *"KeeperHub workflow paid in x402 USDC"* (FR-7), *"submits challenges via KeeperHub workflow (x402 paid)"* (architecture diagram).

This is wrong. **You don't pay x402 to KeeperHub to run your own workflow.** Your own workflow runs against your own wallet, which pays gas in ETH on the target chain. x402/MPP only applies when an *external agent* calls a workflow you've **listed for sale** as a paid workflow.

**Spec changes required (large):**
- Strike "x402 USDC for execution" / "(x402 paid)" anywhere it appears as the cost of *us* running our own challenger or reputation workflow. We pay **gas in ETH/Base ETH**. Use the org's Turnkey-backed wallet.
- If we want an x402 angle, the right framing is: **list our `EBBOOracle.computeBenchmark()` view as a paid workflow** (~$0.005/call) so other agents/dashboards can query our benchmark. That's a real x402/MPP integration story and matches `paid-workflows.md` exactly. Optional bonus item.

---

## 4. Paid workflows — the actual x402/MPP semantics

From `workflows/paid-workflows.md`:
- Two settlement protocols: **x402 on Base USDC** *and* **MPP on Tempo USDC.e**. Spec only mentions x402.
- *"The calling agent chooses which protocol to use based on what its wallet holds."* Dual-chain, no creator config required.
- Recommended pricing: **$0.001 to $0.10 per call**.
- Discoverable via **x402scan** and **mppscan** automatically.
- Earnings split into separate Base USDC and Tempo USDC.e creator balances.

The agentic wallet for *paying* workflows has hard server-side limits enforced by Turnkey policies (`agentic-wallet.md`):
- Contract allowlist: only Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) and Tempo USDC.e (`0x20C000000000000000000000B9537D11c60E8b50`).
- Per-transfer cap: **100 USDC**.
- Approval cap: **100 USDC**.
- Daily cap: **200 USDC per UTC day**.
- Chain allowlist: Base (8453), Tempo mainnet (4217), Tempo testnet (4218).

These limits matter for Reckon: **our `baseBond = 1000 USDC` (FR-1) cannot be moved through the KeeperHub agentic wallet** — it's 10× the per-transfer cap and 5× the daily cap. The KeeperHub agentic wallet is for *paying for workflow calls*, not for *bonding solvers/challengers*. Solver/challenger USDC bonding flows through normal EOA approvals, not through the agentic wallet.

**Spec changes required:**
- Remove "x402" framing from anywhere we describe our own challenger txs. If we want to keep an x402 hook for narrative purposes, do it **once** as an optional paid-workflow listing (see §3 above).
- Clarify in FR-1 / FR-5 that solver and challenger bond movements are **direct USDC `transferFrom` from their EOA → SolverBondVault**, not through any KeeperHub-managed wallet.

---

## 5. MCP server — what we actually integrate against

From `ai-tools/mcp-server.md`:
- Endpoint: **`https://app.keeperhub.com/mcp`** (HTTP transport, OAuth 2.1 or API key).
- Authentication: **OAuth 2.1** (1-hour access tokens, 30-day refresh) **or `kh_` API keys** as Bearer tokens for headless.
- **19 tools** covering workflow CRUD, execution, plugin discovery, template deployment, integration management.
- **Org-scoped only** — *"There is no way to access another org's resources from the same connection."*
- API key prefix matters: **`kh_` = organisation-scoped (REST + MCP + plugin)**, **`wfb_` = user-scoped (webhook triggers only)**. Spec doesn't mention this; if Builder B grabs the wrong key prefix, MCP will reject.

For Claude Code specifically (`ai-tools/claude-code-plugin.md`):
```bash
claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp
```
Then `/mcp` in Claude Code to authorize. No CLI install needed. There's a separate plugin (`/plugin install keeperhub@keeperhub-plugins`) with skills `workflow-builder`, `template-browser`, `execution-monitor`, `plugin-explorer` if we want richer dev ergonomics.

**Spec changes required:**
- Pre-build checklist: add "Generate a `kh_`-prefixed organisation API key (not `wfb_`) at app.keeperhub.com → Settings → API Keys → Organisation."
- Phase 1 Day 6-7: pin MCP endpoint and auth flow. Bearer `kh_...` for the agent runtime; OAuth for dev sessions.

---

## 6. The OpenClaw connector — does it need to exist?

**Spec says (Phase 3 Day 17-18):** Build `@reckon-protocol/keeperhub-openclaw` — *"a thin npm package that wraps KeeperHub's MCP server for OpenClaw agents"* — to satisfy KeeperHub bounty Focus Area #2 ("build the bridge").

**Reality from the docs:** KeeperHub's MCP server is **already a bridge** — anything that speaks MCP can use it natively. If OpenClaw speaks MCP (as most modern agent frameworks do), there is **no integration gap to fill** — adding `keeperhub` as an MCP server in OpenClaw's config is the entire integration.

This doesn't kill the connector idea, but it changes what it should *be*:

- **Bad version (what the spec implies):** wrap the MCP server's tools in TypeScript, re-expose them. KeeperHub judges will see this as redundant — they already shipped this layer.
- **Good version (what would actually score):** ship a small OpenClaw **skill pack** that pre-fills KeeperHub workflow templates for common patterns (challenge submission, reputation flush, scheduled reads). One-line `npm install @reckon-protocol/keeperhub-skills` → OpenClaw agents have ready-made workflows. This is the spirit of Focus Area #2 — *don't make every developer redesign the same workflow*.

**Spec changes required:**
- Phase 3 Day 17-18: redefine the deliverable. Replace "thin npm package that wraps KeeperHub's MCP server" with "skill pack with 3-5 pre-built workflow templates (challenge submission, reputation flush, fill audit query, paid EBBO oracle listing)." Keep the ~300 LoC budget. Open-source.

---

## 7. The "30% gas savings" claim is fabricated

**Spec says (Risk #7):** *"Their public docs mention 30% gas savings vs baseline; we should verify on actual workflow execution before committing demo to mainnet."*

**Docs say:** Nothing of the sort. `wallet-management/gas.md` describes the gas estimation model (estimate × multiplier — Ethereum/Polygon 2.0×, Base/Arbitrum 1.5×) and gives FAQ on overrides. There is no "30% gas savings" claim anywhere in the docs we inspected.

**Spec changes required:**
- Remove the 30% claim. Replace Risk #7 with the real concern: *"KeeperHub applies a 1.5× gas-limit multiplier on Base by default (2.0× for time-sensitive event/webhook triggers). For our challenge submission workflow on Base mainnet, gas headroom is healthy; verify our `Challenger.submit()` estimate × 1.5 is still ≤ NFR-1's 280k budget."*

---

## 8. Rate limits and execution caps — relevant to NFR-1 / NFR-4

From `FAQ.md`:
| Limit | Value |
|---|---|
| API rate limit (authenticated) | 100 req/min |
| API rate limit (unauthenticated) | 10 req/min |
| Direct Execution API | **60 req/min per API key** |
| Code Plugin timeout | 1-120s (default 60s) |
| Batch Read Contract | 5,000 calls per execution |
| Batch size per RPC request | 1-500 (default 100) |

**60 executions/min per API key matters for Reckon.** Worst case during a busy period: many fills get challenged simultaneously. We could hit this if:
- Many agents share one API key (don't do this — provision one key per agent), or
- Reputation flush + challenge submission collide on the same key.

**Spec changes required:**
- NFR-2 / Phase 3 adversarial tests: add scenario "burst of N=20 fills challenged in 60s, verify each agent's KeeperHub workflow executes without 429."
- Phase 0: provision **one `kh_` key per challenger agent**, not a shared one. Document in iNFT brain encryption schema.

---

## 9. Smaller items worth pinning

- **Failure handling:** *"When a step fails, KeeperHub retries with configurable behavior. Failed runs are logged with full error context in the Runs panel."* Good — covers FR-8's "retry, audit log" claim. No spec change.
- **Soft delete:** account deletion is a soft delete; data preserved. Not relevant to Reckon directly but worth knowing for cleanup.
- **No version history / CI/CD:** workflow versioning is manual via download/upload. If we want versioning of our reputation-flush workflow, we'd wire MCP `create_workflow` / `update_workflow` into a tiny GitOps script. Bonus item, not required.
- **AI workflow generation:** *"`ai_generate_workflow` tool"* exists. Could be a nice demo flourish — "ask the AI to generate the challenger submission workflow from a one-line description" — but adds nothing to the bounty score.
- **Defender migration guide exists:** OpenZeppelin Defender shuts down July 1, 2026, and Gelato Web3 Functions shut down March 31, 2026. KeeperHub's positioning is partly "the Defender successor." Mention this in the demo if there's room — it strengthens the "real product, real users" story.

---

## 10. Spec text that's wrong or weak — line-level fixes

| Spec location | Current text | Issue | Fix |
|---|---|---|---|
| Bounty strategy table | "Challenge submission and reputation flush as KeeperHub workflows + connector" | Right shape, but specify trigger types | "Challenge submission as **webhook-triggered** workflow; reputation flush as **schedule-triggered (24h)** workflow + skill-pack template bundle" |
| FR-7 | "Reputation update batched once per day via KeeperHub workflow paid in x402 USDC" | x402 misuse; we don't pay x402 to run our own workflow | "Reputation update batched once per day via KeeperHub schedule-triggered workflow; gas paid from org's Turnkey-backed wallet (Base ETH)" |
| FR-8 | "Agents use KeeperHub workflow for actual challenge submission tx" | Right but underspecified | Add: "...via webhook trigger; KeeperHub handles gas estimation (Base 1.5× multiplier), nonce management, retry on revert, run logging" |
| Architecture diagram | "submits challenges via KeeperHub workflow (x402 paid)" | x402 misuse | "submits challenges via KeeperHub workflow (gas paid from org wallet; optional x402-listed paid workflows for external EBBO queries)" |
| Phase 0 Day 1 | "Confirm KeeperHub testnet account, x402 facilitator config" | Sequencing wrong | "Generate `kh_`-prefixed org API key. Add KeeperHub MCP via `claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp`. Confirm Base Sepolia is selected as our dev chain (Unichain not supported)." |
| Phase 0 Day 1 (chain) | "Unichain Sepolia for development, Base Sepolia as fallback" | KeeperHub doesn't support Unichain | Flip: "Base Sepolia for development; Unichain only if added by Phase 2" |
| Phase 1 Day 6-7 | "Confirm x402 billing on workflow execution" | Misuse — see above | "Confirm Turnkey signing works on a write-action workflow on Base Sepolia. (No x402 billing for our own workflow runs — gas paid from our org wallet.)" |
| Phase 3 Day 17-18 | "thin npm package that wraps KeeperHub's MCP server" | KeeperHub's MCP already does this; redundant | "Skill pack of 3-5 pre-built workflow templates for challenger flows (submission, reputation flush, fill audit, optional paid EBBO oracle listing). Open-source as `@reckon-protocol/keeperhub-skills`." |
| Risk #7 | "Their public docs mention 30% gas savings vs baseline" | Not in the docs | "KeeperHub applies 1.5× gas-limit multiplier on Base by default (2.0× for event/webhook triggers). Verify `Challenger.submit()` estimate × 1.5 ≤ NFR-1's 280k budget" |
| Pre-build checklist | "Confirm KeeperHub testnet account works and we can create workflows via MCP" | Right; add specifics | "Generate `kh_`-prefixed org API key (not `wfb_`). Test `claude mcp add --transport http keeperhub https://app.keeperhub.com/mcp`. Confirm 60 req/min rate cap is comfortable for our agent count." |
| NFR-1 | (no mention of KeeperHub gas multiplier) | Missing | Add: "Quoted gas budgets are pre-multiplier; KeeperHub applies a 1.5× safety multiplier on Base for non-time-sensitive triggers (challenge submission)." |
| NFR-4 | (no mention of run logs) | Underspecified | Add: "KeeperHub Runs panel provides per-step inputs/outputs/transaction hashes/error messages — primary debugging surface during the demo." |

---

## 11. Optional uplift — what would strengthen the KeeperHub bounty case

In priority order:

1. **List `EBBOOracle.computeBenchmark()` as a paid workflow** ($0.005/call, settles via x402 on Base USDC OR MPP on Tempo USDC.e). Real x402 + MPP integration story. Auto-discoverable via x402scan + mppscan. ~3 hours.
2. **Skill pack with templates** (already in §6). ~6-8 hours, replaces the planned "thin connector" wrapper.
3. **High-quality FEEDBACK.md** — concrete, specific, actionable. The bounty pays $500 for it; spec already commits to writing it. Make it specifically about the agent integration UX (MCP setup friction, OAuth-vs-API-key tradeoffs, skill-pack ergonomics). Don't let it become a generic "things I liked / didn't like" doc.
4. **Use Discord notification action** for the demo's slash event ("Solver `bunni.solvers.reckon.eth` slashed for 12.4 USDC; restitution sent to swapper") — visually memorable for judges, ~30 minutes of work.
5. **Use AI workflow generation** in the demo video — *"watch us ask KeeperHub to generate the daily reputation flush workflow from a sentence"* — 30 seconds of demo time, real product capability.

---

## Summary — concrete spec edits, prioritized

1. **(Architecture, must-fix)** Switch dev chain from Unichain Sepolia → **Base Sepolia**. KeeperHub doesn't support Unichain.
2. **(Factual, must-fix)** Remove "x402 USDC paid" from anywhere we describe our own challenger / reputation workflow runs. We pay gas, not x402, for our own workflows. Keep one optional paid-workflow listing for external EBBO queries.
3. **(Factual, must-fix)** Wallet model is **Turnkey** (not Para in current docs); creator wallets and the org wallet are Turnkey sub-orgs.
4. **(Factual)** Pin **`kh_`** API keys (not `wfb_`) and the MCP endpoint `https://app.keeperhub.com/mcp` in pre-build checklist.
5. **(Factual)** Trigger types: webhook for challenge submission, schedule for reputation flush. Pin in FR-7/FR-8.
6. **(Connector redefinition)** Replace "thin MCP wrapper for OpenClaw" with **skill-pack of pre-built workflow templates** as `@reckon-protocol/keeperhub-skills`. Same time budget; better fit for Focus Area #2.
7. **(Factual)** Remove the "30% gas savings" claim from Risk #7. Real concern is the 1.5×/2.0× gas-limit multiplier on Base.
8. **(Architecture)** Provision **one `kh_` API key per challenger agent** to stay under 60 req/min limit; encode in iNFT brain config.
9. **(Bonding flow clarification)** Solver/challenger USDC bond movements use direct EOA `transferFrom`, not the KeeperHub agentic wallet (which has 100 USDC per-tx and 200 USDC daily caps that conflict with our 1000 USDC base bond).
10. **(NFR-4 polish)** Reference the Runs panel as the primary debugging surface for the demo.
