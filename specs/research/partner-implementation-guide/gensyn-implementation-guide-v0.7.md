# Gensyn Implementation Guide for Reckon v0.7

**Source:** https://docs.gensyn.ai/llms-full.txt (with cross-references to `github.com/gensyn-ai/axl` README and `github.com/gensyn-ai/ree`)
**Date compiled:** 2026-04-27
**Scope:** Concrete implementation guide for every place Reckon v0.7 touches Gensyn. The bounty surface is **AXL only** — REE and Delphi are out of scope for v0.7 but documented here as a "what's next" lever (REE) and a "do not confuse" sibling (Delphi/Gensyn Testnet).

Reckon's Gensyn surface (per spec FR-8, NFR-2, Phase 0/2/3):

1. **AXL mesh** — three-node hub-and-spoke (Hetzner public hub + Fly.io US spoke + Fly.io EU spoke) for first-claim-wins challenger swarm coordination.
2. **GossipSub-pattern channel** — forked from `examples/gossipsub`, claim message schema `{orderHash, agentTokenId, claimedAt, deadline}`.
3. **`@reckon-protocol/axl-claim-broadcast`** — open-source helper package (Phase 3 Day 17-18, Builder B) that wraps the GossipSub fork pattern.

What Reckon does **not** use: Gensyn Testnet (chain 685685), the $AI token, Delphi, Verde, NoLoCo, Judge, RL Swarm. AXL is off-chain and gas-free. Pin this in README and demo script — the most common judge confusion is "are you on the Gensyn rollup?" — answer is no.

---

## 0. AXL is not a chain — pin the glossary

| Concept | What it is | Reckon usage |
|---|---|---|
| **AXL** (Agent eXchange Layer) | Off-chain encrypted P2P mesh: Yggdrasil + TLS direct peering + Ed25519 identity. App-agnostic byte transport. | **Core.** Mesh between 3 challenger agents. |
| **Gensyn Testnet** | Custom Ethereum rollup, chain ID **685685**, RPC `https://gensyn-testnet.g.alchemy.com/public`, explorer `https://gensyn-testnet.explorer.alchemy.com/`. ML protocol economics + $AI token. | **Not used.** Don't mention in README except to disclaim. |
| **REE** | Reproducible Execution Environment. Bitwise-identical AI inference across hardware. CLI: `gensyn-sdk`. | **Not used in v0.7.** Listed as "what's next." |
| **Delphi** | Information markets SDK (`@gensyn-ai/gensyn-delphi-sdk`, TS only). | **Not used.** |
| **Verde / NoLoCo / Judge** | Research papers, not products. | **Not used.** Don't mention. |
| **RL Swarm** | Testnet, **paused.** | **Not used.** Don't mention. |

The `.env` shape only needs AXL operational params — no chain RPCs, no token addresses:

```bash
# Hub (Hetzner) — public IP/IPv6, port 9001 open
AXL_HUB_LISTEN=tls://0.0.0.0:9001
AXL_HUB_PUBLIC_ADDR=tls://<HETZNER_PUBLIC_IP>:9001

# Spokes (Fly.io US, Fly.io EU)
AXL_SPOKE_PEERS=tls://<HETZNER_PUBLIC_IP>:9001

# Per-node Ed25519 identity (generated once, stored in iNFT brain blob on 0G Storage)
AXL_PRIVATE_KEY_PATH=/data/axl/private.pem
```

---

## 1. AXL: build, identity, topology (Builder B, Phase 0 Day 1)

### 1.1 No releases — build from source

AXL has **zero tagged releases.** Repo: `https://github.com/gensyn-ai/axl`. Languages: Go 72%, Python 27%. Build:

```bash
git clone https://github.com/gensyn-ai/axl.git
cd axl
git checkout <PINNED_SHA>          # pin in CI; do not track HEAD
make build                          # ~10 min on Hetzner
```

**Go version requirement: 1.25.5+.** The repo's `go.mod` pins the toolchain; `make build` will fail-loud on older Go.

**Pin the commit SHA in CI.** `gensyn-ai/axl` has 29 commits, 2 open PRs, no releases — breaking changes between commits are realistic. Add to `.github/workflows/ci.yml`:

```yaml
env:
  AXL_COMMIT_SHA: <40-char-sha>
```

Re-test on every bump. If a bump breaks us mid-week, lock to the previous SHA; we're not in the AXL maintenance business.

### 1.2 Identity: Ed25519 per node

Each node generates its own Ed25519 keypair locally on first boot:

```bash
openssl genpkey -algorithm ed25519 -out /data/axl/private.pem
```

The private key path is referenced in `node-config.json` (§1.3). The corresponding public TLS address is announced to peers via `Listen` and consumed by remote `Peers` entries.

**Storage:** for the challenger agents (which are iNFTs), the Ed25519 private key is part of the **brain blob on 0G Storage** (see `0g-implementation-guide-v0.7.md` §2.3). On agent boot:

1. Decrypt brain blob via AES-256-GCM.
2. Write `axl_ed25519_secret` field out to `private.pem` on the local FS.
3. Launch `./node -config node-config.json`.
4. On graceful shutdown, scrub `private.pem` (the canonical copy is on 0G Storage).

This makes the AXL identity portable with iNFT ownership: when an iNFT transfers to a new owner, the new owner inherits the AXL identity automatically — same node, same peer addresses, same gossip reputation.

### 1.3 Topology: hub-and-spoke, 3 nodes

AXL has **no libp2p, no DHT, no automatic peer discovery.** Nodes connect via **explicit TLS addresses in JSON config.** At least one **public node** is required to bootstrap — that's the hub.

Reckon's topology:

```
                    Hetzner hub (public IP)
                    tls://<HETZNER_IP>:9001
                          /          \
                         /            \
                Fly.io US spoke      Fly.io EU spoke
                (no listen)          (no listen)
```

**Hub config** (`node-config.json` on Hetzner):

```json
{
  "PrivateKeyPath": "/data/axl/private.pem",
  "Peers": [],
  "Listen": ["tls://0.0.0.0:9001"]
}
```

**Spoke config** (each Fly.io region):

```json
{
  "PrivateKeyPath": "/data/axl/private.pem",
  "Peers": ["tls://<HETZNER_PUBLIC_IP>:9001"],
  "Listen": []
}
```

Three-node mesh launches with one command per node:

```bash
./node -config node-config.json
```

**Why 3 nodes, not 2:** GossipSub semantics only meaningfully kick in at N≥3. Two nodes is a point-to-point link with extra ceremony. Three nodes is a real mesh and visibly more legitimate in the demo video. Cost: ~$5/month total infra (Hetzner CX11 + 2 × Fly.io free tier).

### 1.4 Encryption — what to say in the demo

AXL is **two-layer encrypted**:

- **TLS** on the direct peering link.
- **Yggdrasil end-to-end encryption** for the full path. Intermediate nodes cannot decrypt, modify, or censor messages.

This is the **adversarial property NFR-2 leans on.** A hostile relay (e.g., a compromised Fly.io spoke trying to suppress an honest agent's claim broadcast) cannot read the message and cannot fabricate a valid one without the originator's Ed25519 key. The 5-second packet-capture in the demo video (Phase 4 Day 22-23) should show both TLS and Yggdrasil headers — judges recognize the distinction.

**NAT/firewall traversal:** Yggdrasil "works behind NATs and firewalls without any extra configuration." This downgrades Risk #12 (conference Wi-Fi) to LOW/LOW. We do not need to special-case the Fly.io regions or the Hetzner firewall beyond opening port 9001 inbound on the hub.

**Userspace network stack:** AXL uses gVisor for the userspace stack. Practical implication: no kernel modules, no `CAP_NET_ADMIN` required. Runs in unprivileged Docker containers, runs on Fly.io Machines without privileged mode.

---

## 2. GossipSub claim broadcast (Builder B, Phase 2 Day 10-11)

### 2.1 GossipSub is an example app, not a first-class API

AXL ships **example applications** in `examples/`, not packaged libraries:

- **MCP router** — Model Context Protocol message routing
- **A2A server** — Agent-to-Agent request/response semantics
- **Distributed inference** — msgpack tensor exchange
- **GossipSub** — pub/sub message propagation across the mesh
- **Convergecast** — tree-based aggregation over the network's spanning tree

For Reckon's first-claim-wins dedup, **GossipSub is the right primitive** — broadcast-once, all-peers-see-it, no per-recipient request overhead. A2A is request/response, wrong shape. Convergecast is aggregation, also wrong shape.

**Plan:** fork `examples/gossipsub`, swap the message format, define our backoff/timeout semantics. Realistic budget: 4-6 hours on Day 10. The fork lives in `axl-broadcast/` in the Reckon monorepo and gets published as `@reckon-protocol/axl-claim-broadcast` (~150 LoC, Phase 3 Day 17-18).

### 2.2 Claim message schema

Pin this in the shared `@reckon-protocol/types` package:

```typescript
interface ClaimMessage {
  orderHash:    `0x${string}`;   // 32 bytes, the UniswapX fill being claimed
  agentTokenId: bigint;          // iNFT tokenId on 0G Galileo
  claimedAt:    number;          // unix seconds, sender's local clock
  deadline:     number;          // unix seconds, when this claim expires
  signature:    `0x${string}`;   // Ed25519 sig over keccak256(orderHash || tokenId || claimedAt || deadline)
}
```

The signature is over the concatenation of the four canonical fields, hashed with keccak256, signed with the sender's AXL Ed25519 key. **This signature is the authentication boundary** — receivers verify it against the sender's known peer identity and reject mismatches. AXL transport-level encryption protects against eavesdropping; the message-level signature protects against a malicious peer fabricating a claim from an identity it doesn't control.

### 2.3 Topic semantics

Single protocol-wide topic: `reckon/claim/v1`. All three nodes subscribe; all three nodes publish to it.

**Publish flow** (when an agent decides to challenge):

1. Build `ClaimMessage`, sign with local Ed25519 key.
2. Publish on `reckon/claim/v1`.
3. Set local timer = 30s (backoff window).
4. Within the window: if a competing claim with `claimedAt < ours` arrives for the same `orderHash`, yield. Log `axl_lost_race`.
5. After 30s with no losing competitor: read `kvClient.getValue(streamId, orderHash)` from 0G Storage KV (durable backup truth, see `0g-implementation-guide-v0.7.md` §2.4).
6. If KV is also clear or matches our claim: write our claim to KV via `Batcher.exec()`, then submit challenge via KeeperHub webhook.
7. If KV shows another agent already won: yield. Log `kv_collision_yielded`.

**Why both AXL gossip AND 0G KV:** AXL is fast (sub-second broadcast across 3 nodes) but ephemeral — a hub restart loses in-flight state. 0G KV is durable but slow (~1-2s for a `Batcher.exec()` round-trip). AXL is the latency layer; KV is the truth layer. Combined, they give us "fast common case + correct in failure mode."

### 2.4 Backoff and timeout constants

Pin these in `@reckon-protocol/types/constants.ts`:

```typescript
export const AXL_CLAIM_TOPIC      = "reckon/claim/v1";
export const AXL_BACKOFF_SECONDS  = 30;   // wait this long after publishing claim before submitting
export const AXL_DEADLINE_SECONDS = 60;   // claim is invalid after this; another agent may take over
export const AXL_KV_VERIFY_TIMEOUT_MS = 2500;  // if KV read exceeds this, fail closed (yield)
```

Tradeoffs:
- 30s backoff is enough for any of the 3 nodes to broadcast and be heard across geographies (Hetzner DE → Fly.io IAD ≈ 100ms RTT; budget includes margin for transient packet loss).
- 60s deadline ensures that if the winning agent crashes after claiming but before submitting, a second agent can take over within the 30-min challenge window.
- KV verify timeout fails closed: if 0G is slow, we yield rather than risk a double-submit.

### 2.5 Burst load — no rate-limit risk from AXL

AXL itself has no rate limit. The actual rate-limit concern is **KeeperHub's 60 req/min Direct Execution API cap** (FR-8). Each agent has its own `kh_`-prefixed key, so 3 agents × 60 req/min = 180 req/min headroom. NFR-2 burst test of N=20 simultaneous challenges in 60s is comfortably under the cap.

---

## 3. `@reckon-protocol/axl-claim-broadcast` helper package (Builder B, Phase 3 Day 17-18)

The bounty meta-pattern: **publish a small open-source helper that future builders can drop in**, mirroring the KeeperHub skill pack's "build the bridge so other developers don't have to" gesture. Same playbook applied to Gensyn.

### 3.1 Surface area

```typescript
import { AxlClaimBroker } from "@reckon-protocol/axl-claim-broadcast";

const broker = new AxlClaimBroker({
  nodeConfigPath:    "/data/axl/node-config.json",
  privateKeyPath:    "/data/axl/private.pem",
  topic:             "reckon/claim/v1",
  backoffSeconds:    30,
  deadlineSeconds:   60,
});

await broker.start();

// Publish a claim
const result = await broker.claim({
  orderHash:    "0x...",
  agentTokenId: 42n,
});

// result.outcome ∈ "won" | "lost_to_peer" | "lost_to_kv" | "timeout"
if (result.outcome === "won") {
  await submitChallengeViaKeeperHub(...);
}
```

### 3.2 Implementation shape

- ~150 LoC. Most of it is the GossipSub fork glue + claim signing/verification + the timer state machine.
- Spawns the AXL `./node` binary as a subprocess (we built from source in §1.1; the binary lives at `./bin/node` after `make build`).
- Communicates with the subprocess over the example app's IPC pattern (whatever `examples/gossipsub` uses — we mirror it 1:1).
- Talks to 0G Storage KV via `@0gfoundation/0g-ts-sdk` for the durable-truth verification step.
- TypeScript surface; the underlying AXL node is Go. We do **not** ship a Go SDK; the JavaScript wrapper around the subprocess is enough for v0.7.

### 3.3 Publishing checklist

- npm scope: `@reckon-protocol`
- License: MIT
- README pre-empts: "How is this different from raw AXL?" → "AXL gives you a mesh; we give you the claim semantics on top of it."
- One example: `examples/two-agent-race.ts` — boots two local AXL nodes, fires simultaneous claims for the same orderHash, demonstrates one wins deterministically.
- Bench: include a 10-line benchmark showing claim-publish-to-peer-receive latency under 200ms on the production topology.

This package is what we point Gensyn judges at when they ask "what did you contribute back?"

---

## 4. REE — what's next, not what's now

Reckon v0.7 does not use REE. But REE is the natural extension of the protocol's "objective math, no DAO discretion" thesis: if a challenger agent and the on-chain EBBO oracle disagree on a benchmark, **replay the agent's inference deterministically via REE** so the dispute is bit-identical to the original computation. That's a real differentiator and worth a "Future work" bullet.

### 4.1 What REE gives us

- **Bitwise-reproducible AI model inference across hardware.** Same prompt, same model, same weights → identical token-by-token output regardless of GPU vendor.
- **Repository:** `https://github.com/gensyn-ai/ree`
- **CLI:** `gensyn-sdk` (Python; Docker entrypoint also available).
- **Supported models up to 72B params** with pipeline parallelism. Includes Qwen3 series (matching our 0G Compute model choice — Qwen3-32B), Llama 3.x, DeepSeek-R1-Distill, Mistral.
- **Operation modes:**
  - `default` — standard PyTorch, no determinism
  - `deterministic` — same-hardware reproducibility
  - `reproducible` — cross-hardware bitwise-identical (the mode we'd want)
- **Receipts** contain hashes (`prompt_hash`, `parameters_hash`, `tokens_hash`, `receipt_hash`) but NOT weights or timing data — privacy-preserving by default.

### 4.2 What an REE integration would look like

Out of scope for v0.7. Sketch for the README "Future work" section:

```bash
# Suspicion triage replay (post-dispute)
gensyn-sdk run \
  --tasks-root /data/reckon/replay \
  --model-name Qwen/Qwen3-32B \
  --prompt-file /data/reckon/disputes/<orderHash>.jsonl \
  --operation-set reproducible

gensyn-sdk verify \
  --receipt-path /data/reckon/replay/<orderHash>/receipt.json \
  --tasks-root /data/reckon/replay
```

The receipt JSON gets pinned to 0G Storage Log alongside the fill batch; the on-chain dispute mechanism would reference the receipt hash. This is ~6 hours of work and was already listed in v0.7's "Bonus items if you have spare bandwidth" (#3).

### 4.3 Hardware notes (for if we ever do it)

- Linux NVIDIA driver **570.00+** required.
- Disk: 7GB compressed / 12GB uncompressed.
- Docker: `docker run --gpus all -v ~/.cache/gensyn:/gensyn ree run ...`.
- Container is non-root (`user: gensyn`) — fits clean inside our existing Fly.io machine setup if we add GPU class.

---

## 5. End-to-end checklist by phase

### Phase 0 Day 1 (Builder B):

- [ ] Hetzner CX11 + Fly.io US + Fly.io EU provisioned (Builder A operational, B technical)
- [ ] `git clone gensyn-ai/axl`, pin commit SHA in `.github/workflows/ci.yml`
- [ ] Go 1.25.5+ installed on all 3 nodes; `make build` succeeds on each
- [ ] `openssl genpkey -algorithm ed25519 -out private.pem` on each node
- [ ] `node-config.json` written per §1.3 (hub vs spoke shapes)
- [ ] Three-node handshake confirmed: launch each `./node -config node-config.json`, verify peer count = 2 on the hub
- [ ] Pre-compute peer TLS addresses, document in shared secrets vault
- [ ] AXL `examples/gossipsub` runs end-to-end on all 3 nodes (sanity check before forking)

### Phase 2 Day 10-11 (Builder B):

- [ ] Fork `examples/gossipsub` into `axl-broadcast/`
- [ ] Swap message format to Reckon's `ClaimMessage` schema (§2.2)
- [ ] Implement Ed25519 sig-over-message-fields verification on receive
- [ ] Pin topic name `reckon/claim/v1`, backoff (30s), deadline (60s) in `@reckon-protocol/types/constants.ts`
- [ ] Two-agent race test: simultaneous claims for same `orderHash`, exactly one wins
- [ ] Three-agent race test: same, with one agent simulated-crashed mid-claim → second agent takes over after 60s deadline
- [ ] Yggdrasil packet capture saved for demo video (Phase 4)

### Phase 2 Day 12 (Builder B, in coordination with 0G work):

- [ ] AXL gossip + 0G Storage KV interleave verified (see `0g-implementation-guide-v0.7.md` §2.4)
- [ ] `axl_lost_race` and `kv_collision_yielded` log lines plumbed to MongoDB

### Phase 3 Day 17-18 (Builder B):

- [ ] `@reckon-protocol/axl-claim-broadcast` published to npm
- [ ] README, MIT license, `examples/two-agent-race.ts`, benchmark
- [ ] Tagged release `v0.1.0` — first **stable** AXL-app helper in the ecosystem (the meta-pitch)

### Phase 4 Day 22-23 (Builder B):

- [ ] Demo video segment 0:35-1:00 — packet capture between Hetzner hub and Fly.io US, showing TLS + Yggdrasil layers, GossipSub claim broadcast
- [ ] README "Why AXL?" section: 1 paragraph each on (a) what AXL is, (b) why Yggdrasil's e2e encryption matters for adversarial robustness, (c) what we contributed back via the helper package
- [ ] Final QA: 3-node mesh has been up continuously for the 4-hour adversarial smoke test (Phase 3 Day 20-21) without restart

---

## 6. Spec deltas this guide locks in

These are commitments the spec should reference back to:

1. **Build from source, not binary.** Pin commit SHA in CI. Go 1.25.5+.
2. **Three nodes, not two.** Hetzner public hub + Fly.io US + Fly.io EU. ~$5/month total.
3. **GossipSub-pattern, not A2A.** Forked from `examples/gossipsub`. Topic `reckon/claim/v1`.
4. **Claim message includes Ed25519 signature** over `keccak256(orderHash || tokenId || claimedAt || deadline)`. Authentication is message-level, not just transport-level.
5. **AXL gossip + 0G Storage KV are co-load-bearing.** Gossip is fast; KV is durable. Algorithm in §2.3.
6. **AXL identity lives in the iNFT brain blob.** Identity travels with iNFT ownership.
7. **Backoff = 30s, deadline = 60s, KV verify timeout = 2500ms.** Pin in shared constants package.
8. **Yggdrasil's NAT traversal downgrades the conference-Wi-Fi risk** (Risk #12) to LOW/LOW.
9. **`@reckon-protocol/axl-claim-broadcast`** is the helper package we publish. ~150 LoC. Phase 3 Day 17-18.
10. **REE is "what's next," not v0.7.** Don't promise it; mention it once in README "Future work."
11. **Gensyn Testnet (chain 685685) is not used.** Disclaim in README to pre-empt judge confusion. AXL is off-chain and gas-free.
12. **Delphi, Verde, NoLoCo, Judge, RL Swarm: not used.** Don't mention.

---

## 7. Open items the docs don't resolve

The Gensyn docs are sparse on AXL implementation specifics. These are real gaps Builder B should expect to hit:

- **Full `node-config.json` schema.** Docs cover `PrivateKeyPath`, `Peers`, `Listen`. Likely additional fields (logging, metrics, gossip params) exist in the source. Workaround: read `axl/cmd/node/main.go` and the example configs in `examples/` directly. Treat the README schema as a starting point, not exhaustive.
- **GossipSub example app's IPC contract** with the AXL node binary. Docs name the example but don't specify the API surface. Workaround: read the example source (it's the canonical reference) before designing the helper package's wrapper.
- **AXL metrics / health endpoint.** No documented `/healthz` or Prometheus surface. Workaround: process supervisor (systemd / Fly.io's built-in health check) probes the TLS listen port; failure to accept TCP = dead.
- **Behavior under partition.** Docs don't describe what happens if the hub is unreachable from one spoke. Empirical test in Phase 0: kill the Hetzner hub for 30s, observe spoke behavior, document in operational runbook.
- **Cross-version compatibility.** No semver, no protocol version negotiation visible in the README. Mitigation: all 3 nodes built from the same pinned SHA. If we ever bump, bump all 3 atomically.

If any of these resolve differently in practice, update this guide in place — not a new file.
