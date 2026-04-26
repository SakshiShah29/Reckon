# Gensyn Research Notes for Reckon v0.3

**Source:** https://docs.gensyn.ai/llms-full.txt (plus deep dives into the AXL tech page and the `gensyn-ai/axl` GitHub repo)
**Date compiled:** 2026-04-26
**Purpose:** Validate the Gensyn assumptions baked into `reckon-spec-v0.3.md` and surface concrete spec edits.

The spec leans on Gensyn in one load-bearing place: **AXL is the mesh that lets challenger agents on separate VPS nodes deduplicate work** (FR-8, NFR-2, Phase 2 Day 10-11). The bounty narrative is "AXL mesh for cryptographically-required challenger swarm deduplication across separate VPS nodes." Most of what the spec says is directionally right, but several details are wrong and one foundational architecture choice (Yggdrasil) is missing entirely.

---

## 1. AXL is built on Yggdrasil — the spec doesn't acknowledge this

**What the docs say:**
- AXL stands for **"Agent eXchange Layer"** (the spec uses "AXL" without expansion — fine, but worth pinning for the README and demo video).
- Definition: *"A peer-to-peer communication primitive that lets AI agents, ML pipelines, and applications exchange data directly between machines. It is encrypted, decentralised, and without a central server."*
- It is *"application-agnostic, meaning it moves bytes between peers and has no opinion about what those bytes mean."*
- Underneath, AXL is a **Yggdrasil mesh network** with a userspace network stack from gVisor. Two-layer encryption: **TLS for the direct peering link, and Yggdrasil's end-to-end encryption for the full path**. Intermediate nodes cannot decrypt.
- NAT/firewall traversal: *"works behind NATs and firewalls without any extra configuration"* — relevant for spec Risk #8 (conference Wi-Fi).
- Built-in support for **MCP (Model Context Protocol)** and **A2A (Agent-to-Agent)** communication.

**What the spec says (Phase 2 Day 10-11):**
> "first one to detect a slashable fill broadcasts an 'I'm taking this' message over A2A"

That's correct framing — A2A is one of the two example app patterns AXL ships. But the spec never mentions Yggdrasil, TLS, or the encryption model, which is exactly the kind of substance Gensyn judges will want to see in the demo video / README.

**Spec changes required:**
- Add a one-paragraph "AXL stack" note: AXL = Yggdrasil mesh + TLS direct peering + end-to-end Yggdrasil encryption. Our challenger nodes use the **A2A example app** pattern with **GossipSub** for the "I'm claiming this fill" broadcast.
- NFR-2 (Adversarial robustness) currently says "Challenger collusion mitigated by AXL deduplication + first-valid-challenge-wins" — strengthen by noting that messages are e2e encrypted and that intermediate nodes cannot censor or modify the broadcast.

---

## 2. AXL is Go-based and pre-release — the spec needs to budget for this

**What the docs say:**
- Repo: `https://github.com/gensyn-ai/axl`
- Languages: **Go (72%) + Python (27%)**. Build requires **Go 1.25.5+**.
- Installation:
  ```
  make build
  openssl genpkey -algorithm ed25519 -out private.pem
  ./node -config node-config.json
  ```
- Identity: **Ed25519 keypair** generated locally via OpenSSL.
- Discovery: **No libp2p, no DHT.** Nodes connect via **explicit peer TLS addresses** in JSON config (e.g., `"tls://192.168.0.22:9001"`). "At least one public node" is required to bootstrap a connection. **Hub-and-spoke topology** is the standard pattern for small meshes.
- Release status: **"No releases published," 29 commits, 2 open PRs — actively developed, not stabilized.** This is real risk.
- Example apps: MCP router, A2A server, test client (Python services in `examples/`).

**What the spec says (Phase 2 Day 10-11, Phase 0 Day 1):**
> "Confirm Gensyn AXL binary runs on both our VPS providers"
> "Verify AXL mesh works across two physically separate VPS nodes (Hetzner + Fly.io)"
> "Document the AXL bootstrap process — Gensyn judges will check"

The spec says "binary" as if there's a downloadable release. **There isn't.** We will be **building from source** with Go 1.25.5. That's a real Phase 0 task that the spec under-describes.

**Spec changes required:**
- Phase 0 Day 1: replace "Confirm Gensyn AXL binary runs on both our VPS providers" with: "Clone `gensyn-ai/axl`, install Go 1.25.5+, run `make build` on both Hetzner and Fly.io. Generate Ed25519 identity keys per node. Pre-compute peer TLS addresses and exchange them between nodes."
- Phase 2 Day 10-11: explicitly mention **hub-and-spoke topology with one public node** as the bootstrap pattern. Hetzner = public hub; Fly.io = spoke. (Or run a third tiny VPS purely as a public hub — cheap insurance.)
- Risk list: add **"AXL is pre-release Go code with no stable version. Breaking changes between commits are possible. Pin to a specific commit SHA in CI."** (severity LOW-MEDIUM, probability MEDIUM)

---

## 3. GossipSub and Convergecast are example patterns, not built-in primitives

**What the docs say:**
AXL ships *example applications* including:
- **MCP-based agent collaboration**
- **Distributed inference** (msgpack tensors)
- **GossipSub: pub/sub message propagation across the mesh**
- **Convergecast: tree-based data aggregation using the network's spanning tree**

These are reference apps in `examples/`, not first-class library APIs. AXL itself is "application-agnostic."

**What the spec says (FR-8, Phase 2 Day 10-11):**
The spec refers to "AXL mesh for cryptographically-required challenger swarm deduplication" and "broadcasts an 'I'm taking this' message over A2A" as if these are turn-key features. They aren't — we're going to fork or copy the GossipSub example and adapt it to our claim-broadcasting pattern.

**Implication for gas/work budget:**
Builder B's Phase 2 Day 10-11 budget is "Set up a 2-node AXL mesh for challenger deduplication" — that needs to also include "fork the GossipSub example app, swap message format to `{orderHash, agentTokenId, claimedAt}`, define backoff/timeout semantics." Realistic add: ~4-6 hours. Still feasible in the day, but worth being honest about.

**The "0G Storage KV as shared claim state" plan from spec FR-8 / Phase 2 Day 13 is a smart hedge:** AXL gossip is best-effort; KV gives us the durable layer. Keep that design — it's actually one of the stronger architectural moves in v0.3.

**Spec changes required:**
- FR-8: clarify "Agents broadcast claim intent over an AXL **GossipSub-pattern channel** (forked from the AXL example apps); shared claim state is durably persisted to **0G Storage KV** as backup truth."
- Phase 2 Day 10-11: add subtask "fork AXL `examples/gossipsub`, define our claim message schema."

---

## 4. Network info — no chain dependency for AXL itself

**Important clarification:** AXL is a **mesh networking protocol**, not a blockchain. It doesn't sit on a chain and has no chain ID, no RPC URL, no on-chain registry. Our spec implicitly treats it correctly (FR-8 doesn't claim chain dependency), but the demo video and README should not confuse "Gensyn AXL" with "Gensyn Testnet / Mainnet" — those are separate things:

- **Gensyn Testnet** (separate product): custom Ethereum rollup, chain ID **685685**, RPC `https://gensyn-testnet.g.alchemy.com/public`, explorer `https://gensyn-testnet.explorer.alchemy.com/`. **Reckon does not need this.** It's for ML protocol economics ($AI token), not for AXL communications.
- **AXL**: pure off-chain mesh; no token, no chain, no gas.

The spec doesn't make this mistake but it's worth pinning so we don't accidentally introduce it in the README ("we use Gensyn Testnet for AXL coordination" would be wrong).

**Spec changes required:**
- Add to the "Pre-build checklist" or a glossary: "AXL = off-chain encrypted mesh (Yggdrasil + TLS). It does **not** require Gensyn Testnet (chain 685685) or the $AI token. Our usage is gas-free."

---

## 5. Other Gensyn products — confirm we're not promising things we won't ship

The Gensyn product family per docs:

| Product | Status | Reckon relevance |
|---|---|---|
| **AXL** | Active / live (pre-release) | **Core dependency** for challenger swarm |
| **Delphi** | Active / live | Information markets — not used. SDK: `@gensyn-ai/gensyn-delphi-sdk` (TS only) |
| **REE** | Active (Reproducible Execution Environment) | Bitwise-reproducible ML inference. Not used; could be a "what's next" |
| **Verde** | Research | Not used |
| **NoLoCo** | Research | Not used |
| **Judge** | Research | Not used |
| **RL Swarm** | Testnet, **paused** | Not used |

The spec correctly scopes Gensyn to AXL only. **Don't mention Verde, Judge, or NoLoCo as integrations** — they're not shippable. If we want extra surface area for the bounty narrative, **REE** is the one production-ready piece worth a "future work" bullet ("reproducible challenger inference via REE so disputes are bit-identical").

---

## 6. Spec text that's wrong or weak — line-level fixes

| Spec location | Current text | Issue | Fix |
|---|---|---|---|
| Bounty strategy table | "AXL mesh for cryptographically-required challenger swarm deduplication" | "Cryptographically-required" overstates it — AXL gives e2e encryption, not deduplication. Dedup is **ours** to build atop GossipSub + 0G KV | "AXL mesh (Yggdrasil + TLS) for encrypted peer messaging; we build first-claim-wins dedup on top via GossipSub-pattern broadcasts and 0G Storage KV as durable claim state" |
| FR-8 | "Agents communicate with peer agents over Gensyn AXL across separate VPS nodes" | OK, but doesn't say *how* | Add: "AXL nodes built from `gensyn-ai/axl` (Go 1.25.5+); hub-and-spoke topology with one public Hetzner hub and one Fly.io spoke; Ed25519 identity keys; messages over a GossipSub-pattern channel forked from AXL example apps" |
| Phase 0 Day 1 | "Confirm Gensyn AXL binary runs on both our VPS providers" | No binary exists | "Build AXL from source on both VPS providers (Go 1.25.5+, ~10 min). Generate Ed25519 identity per node and exchange peer TLS addresses." |
| Phase 2 Day 10 | "first one to detect a slashable fill broadcasts an 'I'm taking this' message over A2A" | "A2A" is one of two example apps; what we actually want is GossipSub. A2A is request/response semantics, GossipSub is broadcast | "broadcasts an 'I'm taking this' message over a GossipSub-pattern channel" |
| Risk #8 | "AXL mesh stability over conference Wi-Fi (LOW severity, MEDIUM probability if in-person). Mitigation: nodes on public-IPv6-enabled VPS, never on local laptops" | The mitigation is right, but Yggdrasil itself "works behind NATs and firewalls without any extra configuration" so this risk is even smaller than stated | Downgrade to LOW/LOW. Note Yggdrasil's NAT-traversal property as part of the mitigation |
| Risk list | (no entry for AXL pre-release status) | Missing | Add new risk: "AXL is pre-release (no tagged releases, 29 commits). Pin to a specific commit SHA, lock the commit in CI, retest on bumps. Severity MEDIUM, probability MEDIUM" |
| Bounty EV section | "our AXL usage is 'use the tool well,' not 'extend AXL.'" | Honest and correct, no change | (keep) |
| Pre-build checklist | "Confirm Gensyn AXL binary runs on both our VPS providers" | duplicate of Phase 0 issue | Same fix as above |

---

## 7. What strengthens the Gensyn bounty case

Honest read: the spec's Gensyn integration is **load-bearing but thin**. To improve placement (currently spec EV: $1,000-$2,500 of the $5,000 pool), in priority order:

1. **Run 3 nodes, not 2.** Three nodes makes the mesh "actually a mesh" — the GossipSub semantics only matter at N≥3. One Hetzner hub + two Fly.io regions (US + EU) is cheap and visibly more legitimate. ~$5/month total infra. Update Phase 2 Day 10-11.
2. **Use REE for one challenger's deterministic verification path.** "If the on-chain math and the AXL-coordinated agent disagree, replay deterministically via REE." Token-cheap framing, real differentiation. Bonus item, not core.
3. **Demo the encryption layer explicitly.** In the demo video, packet-capture between two nodes and show TLS + Yggdrasil layers. Five seconds. Memorable.
4. **Open-source a small `@reckon-protocol/axl-claim-broadcast` helper** alongside the OpenClaw connector — same playbook as the KeeperHub focus area #2 ("build the bridge so other developers don't have to"). Gensyn judges will recognize the same gesture.

---

## Summary — concrete spec edits, prioritized

1. **(Factual, must-fix)** AXL is pre-release Go (no binary). Phase 0 budgets a build-from-source step. Pin to a commit SHA.
2. **(Factual, must-fix)** A2A is the wrong primitive for our use case; the dedup broadcast is **GossipSub-pattern**. Update FR-8 and Phase 2 Day 10.
3. **(Factual, must-fix)** Add Yggdrasil + TLS + Ed25519 identity to the AXL description. The spec describes *what we do with it* but never *what it is*.
4. **(Architecture)** Move to **3 nodes** (Hetzner hub + Fly.io US + Fly.io EU). N=2 is technically a mesh but visually thin.
5. **(Honesty)** "Cryptographically-required deduplication" overstates AXL's contribution. Reword: encryption + transport from AXL, dedup logic is ours, durable claim state on 0G KV.
6. **(Risk add)** AXL pre-release version churn. Mitigation: pin commit SHA in CI.
7. **(Risk downgrade)** Conference Wi-Fi risk (#8): downgrade to LOW/LOW thanks to Yggdrasil's documented NAT traversal.
8. **(Glossary / pre-build)** Clarify AXL ≠ Gensyn Testnet (chain 685685). Reckon's AXL usage is off-chain and gas-free.
9. **(Bonus, optional)** REE as a "what's next" bullet for deterministic re-execution.
10. **(Bonus, optional)** Publish a tiny `@reckon-protocol/axl-claim-broadcast` package — mirrors the KeeperHub connector pattern.
