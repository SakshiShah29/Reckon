# Gensyn Implementation Guide for Reckon v0.10

**Source:** https://docs.gensyn.ai/llms-full.txt (with cross-references to `github.com/gensyn-ai/axl` README and `github.com/gensyn-ai/ree`)
**Date compiled:** 2026-04-28
**Scope:** Concrete implementation guide for every place Reckon v0.10 touches Gensyn. The bounty surface is **AXL only** — REE and Delphi are out of scope for v0.10 but documented here as a "what's next" lever (REE) and a "do not confuse" sibling (Delphi/Gensyn Testnet).

Reckon's Gensyn surface (per spec FR-8, NFR-2, Phase 0/2/3):

1. **AXL mesh** — three-node hub-and-spoke (Hetzner public hub + Fly.io US spoke + Fly.io EU spoke) for first-claim-wins challenger swarm coordination.
2. **GossipSub-pattern channel** — forked from `examples/python-client/gossipsub/gossipsub.py`, claim message schema `{orderHash, agentTokenId, claimedAt, deadline}`.
3. **`coordinate.ts` primitive** — one of the 5 standalone TypeScript scripts in the SKILL.md-defined agent loop. Wraps AXL GossipSub broadcast + 0G Storage KV claim state management. ~150 LoC.
4. **`@reckon-protocol/axl-claim-broadcast`** — open-source helper package (Phase 3 Day 17-18, Builder B) that extracts the coordination pattern from `coordinate.ts` into a reusable library.

What Reckon does **not** use: Gensyn Testnet (chain 685685), the $AI token, Delphi, Verde, NoLoCo, Judge, RL Swarm, SAPO, BlockAssist, CodeAssist, CheckFree, SkipPipe. AXL is off-chain and gas-free. Pin this in README and demo script — the most common judge confusion is "are you on the Gensyn rollup?" — answer is no.

---

## 0. AXL is not a chain — pin the glossary

| Concept | What it is | Reckon usage |
|---|---|---|
| **AXL** (Agent eXchange Layer) | Off-chain encrypted P2P mesh: Yggdrasil overlay + TLS direct peering + Ed25519 identity. Application-agnostic byte transport with a local HTTP API at `localhost:9002`. | **Core.** Mesh between 3 challenger agents. |
| **Gensyn Testnet** | Custom Ethereum rollup, chain ID **685685**, RPC `https://gensyn-testnet.g.alchemy.com/public`, explorer `https://gensyn-testnet.explorer.alchemy.com/`. ML protocol economics + $AI token. | **Not used.** Don't mention in README except to disclaim. |
| **REE** | Reproducible Execution Environment. Bitwise-identical AI inference across hardware. CLI: `gensyn-sdk`. | **Not used in v0.10.** Listed as "what's next." |
| **Delphi** | Information markets SDK (`@gensyn-ai/gensyn-delphi-sdk`, TS only). | **Not used.** |
| **Verde / NoLoCo / CheckFree / SkipPipe / Judge** | Research papers, not products. | **Not used.** Don't mention. |
| **RL Swarm** | Testnet, **paused.** | **Not used.** Don't mention. |
| **SAPO / BlockAssist / CodeAssist** | Research/demo projects, not load-bearing. | **Not used.** Don't mention. |

The `.env` shape only needs AXL operational params — no chain RPCs, no token addresses:

```bash
# Hub (Hetzner) — public IP, port 9001 open for peering
AXL_HUB_LISTEN=tls://0.0.0.0:9001
AXL_HUB_PUBLIC_ADDR=tls://<HETZNER_PUBLIC_IP>:9001

# Spokes (Fly.io US, Fly.io EU)
AXL_SPOKE_PEERS=tls://<HETZNER_PUBLIC_IP>:9001

# Per-node Ed25519 identity (generated once, stored in iNFT brain blob on 0G Storage)
AXL_PRIVATE_KEY_PATH=/data/axl/private.pem
```

---

## 1. AXL: build, identity, topology, local HTTP API (Builder B, Phase 0 Day 1)

### 1.1 No releases — build from source

AXL has **zero tagged releases.** Repo: `https://github.com/gensyn-ai/axl`. Languages: Go 72%, Python 27%. Build:

```bash
git clone https://github.com/gensyn-ai/axl.git
cd axl
git checkout <PINNED_SHA>          # pin in CI; do not track HEAD
go build -o node ./cmd/node/       # produces a single binary called `node`
```

**Go version requirement: 1.25.x.** The repo's `go.mod` pins `toolchain go1.25.5`. **Go 1.26+ has build tag conflicts with the `gvisor.dev/gvisor` dependency.** If you only have Go 1.26+, prefix the build:

```bash
GOTOOLCHAIN=go1.25.5 go build -o node ./cmd/node/
```

Alternatively, install Go 1.25 alongside:

```bash
go install golang.org/dl/go1.25.5@latest
go1.25.5 download
go1.25.5 build -o node ./cmd/node/
```

**Pin the commit SHA in CI.** `gensyn-ai/axl` has no releases — breaking changes between commits are realistic. Add to `.github/workflows/ci.yml`:

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

**macOS note:** The default `openssl` on macOS is LibreSSL, which does **not** support `ed25519`. Use Homebrew's OpenSSL:

```bash
brew install openssl
/opt/homebrew/opt/openssl/bin/openssl genpkey -algorithm ed25519 -out /data/axl/private.pem
```

The private key is referenced in `node-config.json` (§1.3). The node derives a deterministic IPv6 address and a 64-character hex public key from this keypair. **The public key IS the node's identity on the mesh** — it replaces IP-based addressing entirely.

**Storage:** for the challenger agents (which are iNFTs), the Ed25519 private key is part of the **brain blob on 0G Storage** (see `0g-implementation-guide`). On agent boot:

1. Decrypt brain blob via AES-256-GCM.
2. Write `axl_ed25519_secret` field out to `private.pem` on the local FS.
3. Launch `./node -config node-config.json`.
4. On graceful shutdown, scrub `private.pem` (the canonical copy is on 0G Storage).

This makes the AXL identity portable with iNFT ownership: when an iNFT transfers to a new owner, the new owner inherits the AXL identity automatically — same node, same public key, same mesh reputation.

### 1.3 Topology: hub-and-spoke, 3 nodes

AXL has **no libp2p, no DHT, no automatic peer discovery.** Nodes connect via **explicit TLS addresses in JSON config.** At least one **public node** (exposed port) is required to bootstrap — that's the hub. Once connected, the Yggdrasil mesh routes messages by public key across any number of hops.

Reckon's topology:

```
                    Hetzner hub (public IP)
                    tls://<HETZNER_IP>:9001
                    API: localhost:9002
                          /          \
                         /            \
                Fly.io US spoke      Fly.io EU spoke
                API: localhost:9002   API: localhost:9002
                (no listen)          (no listen)
```

**Hub config** (`node-config.json` on Hetzner):

```json
{
  "PrivateKeyPath": "/data/axl/private.pem",
  "Peers": [],
  "Listen": ["tls://0.0.0.0:9001"],
  "api_port": 9002,
  "tcp_port": 7000
}
```

**Spoke config** (each Fly.io region):

```json
{
  "PrivateKeyPath": "/data/axl/private.pem",
  "Peers": ["tls://<HETZNER_PUBLIC_IP>:9001"],
  "Listen": [],
  "api_port": 9002,
  "tcp_port": 7000
}
```

Three-node mesh launches with one command per node:

```bash
./node -config node-config.json
```

On startup, you'll see:

```
Your IPv6 address is 200:abcd:...
Your public key is 1ee862344fb283395143ac9775150d2e5936efd6e78ed0db83e3f290d3d539ef
```

**Verify the mesh is connected** from any node:

```bash
curl -s http://127.0.0.1:9002/topology | python3 -c "import sys,json; d=json.load(sys.stdin); print('Peers:', len(d.get('peers', []))); print('Tree:', len(d.get('tree', [])))"
```

The hub should see `Peers: 2` once both spokes connect.

**Why 3 nodes, not 2:** GossipSub semantics only meaningfully kick in at N≥3. Two nodes is a point-to-point link with extra ceremony. Three nodes is a real mesh and visibly more legitimate in the demo video. Cost: ~$5/month total infra (Hetzner CX11 + 2 × Fly.io free tier).

### 1.4 AXL's local HTTP API — how `coordinate.ts` talks to the node

AXL exposes a **local HTTP interface at `http://127.0.0.1:9002`**. This is the only way applications interact with the node. The node handles all P2P transport, encryption, and routing behind the scenes.

Key endpoints our `coordinate.ts` primitive uses:

| Endpoint | Method | Purpose | Headers |
|---|---|---|---|
| `/send` | POST | Send bytes to a peer | `X-Destination-Peer-Id: <64-char-hex-pubkey>` |
| `/recv` | GET | Poll for incoming messages | Response includes `X-From-Peer-Id` header |
| `/topology` | GET | Get node identity and connected peers | — |

**Application ↔ Node flow:**

```
coordinate.ts ──HTTP POST──► localhost:9002/send ──encrypted mesh──► remote AXL node
                                                                          │
remote coordinate.ts ◄──HTTP GET── localhost:9002/recv ◄──────────────────┘
```

This is a critical architecture distinction vs the v0.7 guide's assumption of subprocess IPC. AXL nodes are **standalone processes** with an HTTP bridge. Our TypeScript primitives make standard HTTP requests to localhost — no Go FFI, no subprocess pipes, no custom IPC protocol.

**Security note:** `bridge_addr` defaults to `127.0.0.1`, meaning only the local machine can reach the HTTP API. **Do not change this to `0.0.0.0`** — anyone who can reach that port can send messages as your node.

### 1.5 Encryption — what to say in the demo

AXL is **two-layer encrypted**:

- **Layer 1: TLS** on the direct peering link (hop-by-hop). Secures the connection between your node and its direct peer.
- **Layer 2: Yggdrasil end-to-end encryption** for the full path. Uses keys derived from both nodes' Ed25519 keypairs. If Node A sends to Node C via Node B, Node B sees only ciphertext it cannot decrypt.

```
Node A ──[TLS]──► Bootstrap/Hub ──[TLS]──► Node B
         Layer 1                   Layer 1

Node A ═══════════[E2E Encrypted]═══════════► Node B
                    Layer 2
                 (hub can't read this)
```

This is the **adversarial property NFR-2 leans on.** A hostile relay (e.g., a compromised Fly.io spoke trying to suppress an honest agent's claim broadcast) cannot read the message content and cannot fabricate a valid one without the originator's Ed25519 key. The 5-second packet-capture in the demo video (Phase 4 Day 22-23) should show both TLS and Yggdrasil headers — judges recognize the distinction.

**What routing nodes CAN see:** that communication is happening, source/destination public keys, timing, approximate message sizes, sender's IP (direct peers only).

**What routing nodes CANNOT see:** message content, application metadata, JSON fields, what services are running, what commands are being sent.

**NAT/firewall traversal:** Yggdrasil "works behind NATs and firewalls without any extra configuration." Spokes connect outbound to the hub and receive data over the same encrypted tunnel. This downgrades Risk #12 (conference Wi-Fi) to LOW/LOW. We do not need to special-case the Fly.io regions or the Hetzner firewall beyond opening port 9001 inbound on the hub.

**Userspace network stack:** AXL uses gVisor for the userspace TCP/IP stack. No TUN device, no `CAP_NET_ADMIN`, no `sysctl`, no routing table changes. Runs in unprivileged Docker containers, runs on Fly.io Machines without privileged mode.

**Security caveat from the docs:** Yggdrasil does NOT use onion routing (unlike Tor). Traffic patterns (who talks to whom, when) are visible to routing nodes. Also, Yggdrasil has not had a formal independent security audit. And there is no access control — any node with your public key can send you messages, so **`coordinate.ts` must independently validate message senders** (which it does via Ed25519 signature verification on claim messages).

### 1.6 Full `node-config.json` schema (from docs)

All fields are optional; defaults apply for omitted fields:

| Field | Type | Default | Description |
|---|---|---|---|
| `PrivateKeyPath` | string | *(none; ephemeral identity)* | Path to ed25519 PEM key file |
| `Peers` | string[] | `[]` | Bootstrap peer URIs |
| `Listen` | string[] | `[]` | Addresses to listen for incoming peer connections |
| `api_port` | int | `9002` | HTTP interface port |
| `bridge_addr` | string | `127.0.0.1` | HTTP interface bind address |
| `tcp_port` | int | `7000` | Internal TCP listener port (gVisor) |
| `router_addr` | string | *(empty)* | MCP Router host. Empty = MCP disabled |
| `router_port` | int | `9003` | MCP Router port |
| `a2a_addr` | string | *(empty)* | A2A Server host. Empty = A2A disabled |
| `a2a_port` | int | `9004` | A2A Server port |
| `max_message_size` | int | `16777216` | Max message size in bytes (16 MB) |
| `max_concurrent_conns` | int | `128` | Max concurrent inbound TCP connections |
| `conn_read_timeout_secs` | int | `60` | Read timeout per connection (seconds) |
| `conn_idle_timeout_secs` | int | `300` | Idle timeout per connection (seconds) |

**Config casing note:** `PrivateKeyPath`, `Peers`, `Listen` are Yggdrasil settings (PascalCase). `api_port`, `tcp_port`, etc. are AXL node settings (snake_case). Both live in the same file.

For Reckon, we only need the network identity/peering fields plus `api_port` and `tcp_port`. We do **not** use MCP Router or A2A Server built-in features — we build our own GossipSub-pattern on top of `/send` and `/recv`.

---

## 2. GossipSub claim broadcast via `coordinate.ts` (Builder B, Phase 2 Day 8-12)

### 2.1 GossipSub is an example app, not a first-class API

AXL ships **example applications** in `examples/`, not packaged libraries:

- **Tensor exchange** — `examples/python-client/client.py` — PyTorch tensor exchange via msgpack
- **Remote MCP server** — MCP-based tool calling across the mesh
- **Remote A2A** — Agent-to-Agent request/response with auto-discovery
- **GossipSub** — `examples/python-client/gossipsub/gossipsub.py` — pub/sub message propagation with IHAVE/IWANT lazy forwarding, built on `send`/`recv`
- **Convergecast** — `examples/python-client/convergecast.py` — tree-based aggregation over the network's spanning tree

For Reckon's first-claim-wins dedup, **GossipSub is the right primitive** — broadcast-once, all-peers-see-it, no per-recipient request overhead. MCP/A2A are request/response (wrong shape). Convergecast is aggregation (also wrong shape).

**Plan:** fork `examples/python-client/gossipsub/gossipsub.py`, rewrite in TypeScript as `coordinate.ts` (one of the 5 agent primitives), swap the message format, define our backoff/timeout semantics. The Python GossipSub example uses `send`/`recv` HTTP endpoints — our TypeScript port does the same via `fetch()`.

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

The signature is over the concatenation of the four canonical fields, hashed with keccak256, signed with the sender's AXL Ed25519 key. **This signature is the authentication boundary** — receivers verify it against the sender's known public key (from `X-From-Peer-Id` header on `/recv`) and reject mismatches. AXL transport-level encryption protects against eavesdropping; the message-level signature protects against a malicious peer fabricating a claim from an identity it doesn't control.

**Important (from Gensyn docs):** Yggdrasil does NOT include access control. Any node with your public key can send you messages. This is why the Ed25519 message-level signature is load-bearing — transport encryption alone doesn't authenticate the sender's identity at the application level.

### 2.3 Topic semantics and the `coordinate.ts` primitive

Single protocol-wide topic: `reckon/claim/v1`. All three nodes subscribe; all three nodes publish to it.

**`coordinate.ts`** is one of the 5 standalone TypeScript primitive scripts in the SKILL.md-defined agent loop. It handles both AXL GossipSub broadcast and 0G Storage KV claim state management.

**Inputs:** `orderHash, agentTokenId, action` (acquire/release/check)
**Outputs:** JSON `{claimAcquired: bool, claimedBy: string}`
**Size:** ~150 LoC

**`coordinate.ts` talks to the local AXL node via HTTP:**

```typescript
const AXL_API = "http://127.0.0.1:9002";

// Broadcast a claim to all peers
async function broadcastClaim(claim: ClaimMessage, peerKeys: string[]) {
  for (const peerKey of peerKeys) {
    await fetch(`${AXL_API}/send`, {
      method: "POST",
      headers: { "X-Destination-Peer-Id": peerKey },
      body: JSON.stringify(claim),
    });
  }
}

// Poll for incoming claims
async function pollClaims(): Promise<{ claim: ClaimMessage; fromPeer: string } | null> {
  const resp = await fetch(`${AXL_API}/recv`);
  if (resp.status === 200) {
    const fromPeer = resp.headers.get("X-From-Peer-Id");
    const claim = await resp.json() as ClaimMessage;
    return { claim, fromPeer: fromPeer! };
  }
  return null;
}
```

**Acquire flow** (when the orchestrator runs `coordinate.ts acquire`):

1. Build `ClaimMessage`, sign with local Ed25519 key.
2. Broadcast to all known peer public keys via `POST /send`.
3. Set local timer = 30s (backoff window).
4. Poll `GET /recv` during window: if a competing claim with `claimedAt < ours` arrives for the same `orderHash`, yield. Output `{claimAcquired: false, claimedBy: "<competitor>"}`.
5. After 30s with no losing competitor: read `kvClient.getValue(streamId, orderHash)` from 0G Storage KV (durable backup truth).
6. If KV is also clear or matches our claim: write our claim to KV via `Batcher.exec()`, output `{claimAcquired: true, claimedBy: "<self>"}`.
7. If KV shows another agent already won: yield. Output `{claimAcquired: false, claimedBy: "<kvWinner>"}`.

**Check flow** (`coordinate.ts check`): queries 0G Storage KV only, returns current claimer.

**Release flow** (`coordinate.ts release`): clears claim from KV.

**Why both AXL gossip AND 0G KV:** AXL is fast (sub-second broadcast across 3 nodes) but ephemeral — the message queue is in-memory, non-persistent, empties on restart. Critically, **AXL has zero buffering or retry at the transport layer**: if the hub is unreachable, `/send` returns 502 immediately and GossipSub silently drops the message (bare `except Exception: pass` in `_send`). 0G KV is durable but slow (~1-2s for a `Batcher.exec()` round-trip). AXL is the latency layer; KV is the truth layer. Combined, they give us "fast common case + correct in failure mode."

**AXL message queue details (from source — `recv.go`):** Messages that don't match MCP/A2A streams go to an in-memory FIFO queue. Critical constraints:
- **Bounded capacity of 100 messages.** When full, the oldest message is silently evicted (`q.items = q.items[1:]`). Under burst load, claim messages can be lost.
- **Single-consumer:** each `GET /recv` dequeues one message. Returns **204 No Content immediately** when empty (no long-poll, no WebSocket, no SSE).
- **Non-persistent:** empties on node restart.
- **`coordinate.ts` must drain aggressively** during the 30s backoff window to avoid hitting the 100-message cap. Poll at ~200ms intervals (150 polls over 30s). With 3 nodes and realistic claim rates, we're well under the cap, but document the limit.
- The `X-From-Peer-Id` response header on `/recv` provides the sender's 64-char hex public key — used by `coordinate.ts` to validate claim signatures against known peer identities.

### 2.4 How `coordinate.ts` fits in the SKILL.md loop

The SKILL.md file describes the full 5-step decision loop per `FillRecorded` event:

```
FillRecorded event
  → Step 1: triage.ts (0G Compute suspicion score)
  → Step 2: ebbo.ts (deterministic benchmark math)
  → Step 3: coordinate.ts acquire (AXL GossipSub + 0G KV claim)
  → Step 4: decide.ts (cost-benefit analysis)
  → Step 5: submit.ts (KeeperHub webhook trigger)
```

The orchestrator (~80-100 LoC) spawns each primitive as a child process, passes inputs via env vars (including AXL identity data from the iNFT brain blob), and parses stdout JSON. If `coordinate.ts` returns `{claimAcquired: false}`, the orchestrator skips steps 4-5 for this fill.

**Failure handling in SKILL.md:** If `coordinate.ts` fails (AXL node down, network partition), the orchestrator logs to MongoDB `agent_errors` collection, exits gracefully on the current event, and resumes on the next `FillRecorded`. The fill goes unchallenged by this agent — another agent may pick it up if they can reach 0G KV.

### 2.5 Backoff and timeout constants

Pin these in `@reckon-protocol/types/constants.ts`:

```typescript
export const AXL_CLAIM_TOPIC      = "reckon/claim/v1";
export const AXL_BACKOFF_SECONDS  = 30;   // wait this long after publishing claim before submitting
export const AXL_DEADLINE_SECONDS = 60;   // claim is invalid after this; another agent may take over
export const AXL_KV_VERIFY_TIMEOUT_MS = 2500;  // if KV read exceeds this, fail closed (yield)
export const AXL_API_URL          = "http://127.0.0.1:9002";  // local AXL node HTTP API
export const AXL_POLL_INTERVAL_MS = 200;   // /recv poll frequency during backoff window
export const AXL_RECV_QUEUE_CAP   = 100;   // AXL's internal queue cap (from source); drain before this
```

Tradeoffs:
- 30s backoff is enough for any of the 3 nodes to broadcast and be heard across geographies (Hetzner DE → Fly.io IAD ≈ 100ms RTT; budget includes margin for transient packet loss).
- 60s deadline ensures that if the winning agent crashes after claiming but before submitting, a second agent can take over within the 30-min challenge window.
- KV verify timeout fails closed: if 0G is slow, we yield rather than risk a double-submit.

### 2.6 Burst load — no rate-limit risk from AXL

AXL itself has no rate limit (default `max_concurrent_conns` is 128, `max_message_size` is 16 MB — vastly more than we need). The actual rate-limit concern is **KeeperHub's 60 req/min Direct Execution API cap** (FR-8). Each agent has its own `kh_`-prefixed key, so 3 agents × 60 req/min = 180 req/min headroom. NFR-2 burst test of N=20 simultaneous challenges in 60s is comfortably under the cap.

---

## 3. `@reckon-protocol/axl-claim-broadcast` helper package (Builder B, Phase 3 Day 17-18)

The bounty meta-pattern: **publish a small open-source helper that future builders can drop in**, mirroring the KeeperHub skill pack's "build the bridge so other developers don't have to" gesture. Same playbook applied to Gensyn.

### 3.1 Surface area

```typescript
import { AxlClaimBroker } from "@reckon-protocol/axl-claim-broadcast";

const broker = new AxlClaimBroker({
  axlApiUrl:         "http://127.0.0.1:9002",  // local AXL HTTP API
  privateKeyPath:    "/data/axl/private.pem",
  topic:             "reckon/claim/v1",
  peerKeys:          ["<hub-pubkey>", "<spoke-pubkey>"],  // 64-char hex pubkeys
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
  // orchestrator proceeds to decide.ts → submit.ts
}
```

### 3.2 Implementation shape

- ~150 LoC. Most of it is the GossipSub fork glue (rewritten in TypeScript from the Python example) + claim signing/verification + the timer state machine.
- Communicates with the AXL node via its **local HTTP API** at `localhost:9002` using standard `fetch()` — `POST /send` to broadcast, `GET /recv` to poll for incoming claims, `GET /topology` to discover own public key.
- Talks to 0G Storage KV via `@0gfoundation/0g-ts-sdk` for the durable-truth verification step.
- Peer public keys (64-char hex strings) are passed in at construction time — AXL has **no built-in service registry or peer discovery beyond the spanning tree topology**.
- Pure TypeScript; the underlying AXL node is Go. We do **not** ship a Go SDK; the HTTP wrapper is enough for v0.10.

### 3.3 Publishing checklist

- npm scope: `@reckon-protocol`
- License: MIT
- README pre-empts: "How is this different from raw AXL?" → "AXL gives you an encrypted mesh with a local HTTP API; we give you the claim semantics (broadcast, backoff, dedup, durable verification) on top of it."
- One example: `examples/two-agent-race.ts` — boots two local AXL nodes (different `api_port` + `tcp_port`), fires simultaneous claims for the same orderHash, demonstrates one wins deterministically.
- Bench: include a 10-line benchmark showing claim-publish-to-peer-receive latency under 200ms on the production topology.

This package is what we point Gensyn judges at when they ask "what did you contribute back?"

---

## 4. REE — what's next, not what's now

Reckon v0.10 does not use REE. But REE is the natural extension of the protocol's "objective math, no DAO discretion" thesis: if a challenger agent and the on-chain EBBO oracle disagree on a benchmark, **replay the agent's inference deterministically via REE** so the dispute is bit-identical to the original computation. That's a real differentiator and worth a "Future work" bullet.

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

Out of scope for v0.10. Sketch for the README "Future work" section:

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

The receipt JSON gets pinned to 0G Storage Log alongside the fill batch; the on-chain dispute mechanism would reference the receipt hash. This is ~6 hours of work and is listed in v0.10's bonus items (#3).

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
- [ ] Go 1.25.x installed on all 3 nodes; `go build -o node ./cmd/node/` succeeds on each. If only Go 1.26+ available, verify `GOTOOLCHAIN=go1.25.5` workaround
- [ ] `openssl genpkey -algorithm ed25519 -out private.pem` on each node (use Homebrew OpenSSL on macOS)
- [ ] `node-config.json` written per §1.3 (hub vs spoke shapes, including `api_port` and `tcp_port`)
- [ ] Three-node handshake confirmed: launch each `./node -config node-config.json`, verify `curl http://127.0.0.1:9002/topology` shows expected peers on the hub
- [ ] Exchange and document 64-char hex public keys for all 3 nodes in shared secrets vault
- [ ] AXL `examples/python-client/gossipsub/gossipsub.py` runs end-to-end on all 3 nodes (sanity check before porting to TypeScript)
- [ ] **Partition test**: kill Hetzner hub for 30s, verify spokes get 502 on `/send`, verify GossipSub silently drops (no crash), verify spokes resume gossip after hub restarts, verify 0G KV catches claims lost during partition
- [ ] Draft initial SKILL.md including `coordinate.ts` step (trigger, inputs, expected JSON output, failure handling)

### Phase 2 Day 8-12 (Builder B):

- [ ] Write `coordinate.ts` (~150 LoC) — port GossipSub pattern from Python example to TypeScript, using AXL's HTTP API (`POST /send`, `GET /recv`)
- [ ] Implement claim message signing/verification (Ed25519 sig over keccak256 of canonical fields)
- [ ] Validate incoming claims against `X-From-Peer-Id` header from AXL's `/recv` response
- [ ] Pin topic name `reckon/claim/v1`, backoff (30s), deadline (60s), AXL API URL in `@reckon-protocol/types/constants.ts`
- [ ] Two-agent race test: simultaneous claims for same `orderHash`, exactly one wins (run 2 local AXL nodes with different `api_port`/`tcp_port`)
- [ ] Three-agent race test: same, with one agent simulated-crashed mid-claim → second agent takes over after 60s deadline
- [ ] Yggdrasil packet capture saved for demo video (Phase 4)

### Phase 2 Day 12 (Builder B, in coordination with 0G work):

- [ ] AXL gossip + 0G Storage KV interleave verified: `coordinate.ts` broadcasts via AXL first, then verifies/writes via KV
- [ ] Orchestrator logs `coordinate.ts` inputs/outputs to MongoDB `agent_runs` collection

### Phase 3 Day 17-18 (Builder B):

- [ ] `@reckon-protocol/axl-claim-broadcast` published to npm
- [ ] README, MIT license, `examples/two-agent-race.ts`, benchmark
- [ ] Tagged release `v0.1.0` — first **stable** AXL-app helper in the ecosystem (the meta-pitch)

### Phase 4 Day 22-23 (Builder B):

- [ ] Demo video segment 0:55-1:20 — packet capture between Hetzner hub and Fly.io US, showing TLS + Yggdrasil layers, GossipSub claim broadcast via `coordinate.ts`, followed by KeeperHub webhook submission via `submit.ts`
- [ ] SKILL.md scroll segment (0:35-0:55) — briefly shows `coordinate.ts` as step 3 in the agent's decision loop
- [ ] README "Why AXL?" section: 1 paragraph each on (a) what AXL is, (b) why Yggdrasil's e2e encryption matters for adversarial robustness, (c) what we contributed back via the helper package
- [ ] Final QA: 3-node mesh has been up continuously for the 4-hour adversarial smoke test (Phase 3 Day 20-21) without restart

---

## 6. Spec deltas this guide locks in

These are commitments the spec should reference back to:

1. **Build from source, not binary.** Pin commit SHA in CI. Go 1.25.x required; Go 1.26+ needs `GOTOOLCHAIN=go1.25.5` workaround.
2. **Three nodes, not two.** Hetzner public hub + Fly.io US + Fly.io EU. ~$5/month total.
3. **GossipSub-pattern, not MCP/A2A.** Ported from `examples/python-client/gossipsub/gossipsub.py` to TypeScript as `coordinate.ts`. Topic `reckon/claim/v1`.
4. **Claim message includes Ed25519 signature** over `keccak256(orderHash || tokenId || claimedAt || deadline)`. Authentication is message-level (via signature verification against `X-From-Peer-Id`), not just transport-level.
5. **AXL gossip + 0G Storage KV are co-load-bearing.** Gossip is fast; KV is durable. Algorithm in §2.3.
6. **AXL identity lives in the iNFT brain blob.** Identity travels with iNFT ownership.
7. **Backoff = 30s, deadline = 60s, KV verify timeout = 2500ms.** Pin in shared constants package.
8. **Yggdrasil's NAT traversal downgrades the conference-Wi-Fi risk** (Risk #12) to LOW/LOW.
9. **`coordinate.ts` is one of 5 standalone TypeScript primitives** in the SKILL.md-defined agent loop. It talks to AXL via `localhost:9002` HTTP API, not subprocess IPC.
10. **`@reckon-protocol/axl-claim-broadcast`** is the helper package we publish. ~150 LoC. Phase 3 Day 17-18.
11. **REE is "what's next," not v0.10.** Don't promise it; mention it once in README "Future work."
12. **Gensyn Testnet (chain 685685) is not used.** Disclaim in README to pre-empt judge confusion. AXL is off-chain and gas-free.
13. **Delphi, Verde, NoLoCo, CheckFree, SkipPipe, Judge, RL Swarm, SAPO, BlockAssist, CodeAssist: not used.** Don't mention.

---

## 7. Resolved items — from docs and source code review

All items from the v0.7 guide's "open items" list are now resolved. Three were resolved via the updated Gensyn docs; four more were resolved by reading the AXL source code (`gossipsub.py`, `recv.go`, `send.go`, `listener.go`, `dial/`).

### Resolved via Gensyn docs (v0.10 update):

- ✅ **Full `node-config.json` schema.** Now documented (§1.6 above). All 14 fields with types, defaults, descriptions.
- ✅ **Application ↔ node communication pattern.** HTTP API at `localhost:9002`, `/send`, `/recv`, `/topology` endpoints. No subprocess IPC.
- ✅ **AXL health endpoint.** `GET /topology` serves as a health check — if it returns, the node is alive and the HTTP bridge is reachable.

### Resolved via AXL source code review:

- ✅ **GossipSub protocol internals.** The `gossipsub.py` example implements **lazy-first forwarding**:
  - **Originator**: eager push to ALL mesh peers (full fanout on first hop).
  - **Relay node**: eager push to exactly **1 peer** (randomly selected), IHAVE (lazy announcement) to all remaining mesh peers. Near ~1.0 redundancy per relay hop.
  - **IHAVE/IWANT**: receiver checks which `msg_ids` it hasn't seen AND hasn't already requested, sends IWANT for up to 64 IDs. `_pending_iwant` set prevents duplicate requests.
  - **Heartbeat gossip** (default 1s): sends IHAVE of all recent message IDs to `D_gossip` (default 1) random **non-mesh** peers as a secondary dissemination path.
  - **Implication for `coordinate.ts`**: when porting from Python to TypeScript, preserve the lazy-first forwarding ratio (1 eager + N-1 lazy per relay hop). For our 3-node topology, this means: originator pushes to 2 peers eagerly; each relay pushes to 1 eagerly and 0 lazily (only 1 remaining peer). Effectively, all messages reach all nodes within 1 hop. The IHAVE/IWANT machinery provides value only if we scale beyond 3 nodes.

- ✅ **Behavior under partition (hub goes down).** Source code confirms: **AXL has zero buffering, retry, or store-and-forward.** Specifically:
  - `send.go`: each `/send` creates a **new TCP connection** via `dial.DialPeerConnection`. If the hub is unreachable, the dial fails and the HTTP bridge returns **502 Bad Gateway** immediately. No retry queue.
  - `gossipsub.py`: `_send` wraps the send function in bare `except Exception: pass` — errors are **silently swallowed**. Messages are dropped, not buffered.
  - `_maintain_mesh` during heartbeat does `mesh &= self.peers`, pruning disappeared peers. In hub-and-spoke with no alternative paths, the mesh shrinks to empty.
  - **Recovery**: requires the hub to restart and spokes to re-peer. No automatic reconnection in the GossipSub layer (though Yggdrasil itself may re-establish the TLS link).
  - **Implication for Reckon**: this is the strongest argument for 0G Storage KV as co-load-bearing truth layer. If the hub partitions for even 5 seconds, gossip claims are silently lost. The `coordinate.ts` flow already writes to KV as durable backup (§2.3 step 6), which covers this failure mode. Document in the operational runbook: "hub partition = gossip is degraded but KV ensures no double-submits."
  - **Mitigation added to Phase 0 checklist**: empirical partition test — kill hub for 30s, verify spokes resume gossip after hub restarts, verify KV catches any claims that were lost during partition.

- ✅ **Message ordering guarantees.** Source code confirms: **no formal ordering guarantee.** Specifically:
  - `recv.go`: `DefaultRecvQueue` is a FIFO slice with **bounded capacity of 100**. When full, oldest message is evicted (`q.items = q.items[1:]`) — **silent data loss under load**.
  - `send.go` / `dial/`: each `/send` creates a **new, independent TCP connection** (not multiplexed, not reused). Different messages may take different TCP paths with different latencies.
  - `gossipsub.py`: `random.shuffle(candidates)` introduces non-determinism in forwarding path selection.
  - **In our 3-node hub-and-spoke**: messages from Spoke A and Spoke B both route through the hub. The hub's queue receives them in TCP arrival order, which is **likely FIFO under normal conditions** but not guaranteed under concurrent sends. If Spoke A's TCP connection is slow and Spoke B's is fast, the hub may see B's message first.
  - **Implication for Reckon**: claim dedup uses `claimedAt` timestamps, not message arrival order, so ordering doesn't affect correctness. But the **100-message queue cap** is a real constraint — `coordinate.ts` must drain `/recv` aggressively (§2.3). With 3 nodes and realistic claim rates (N=20 fills/min burst), we're well under the cap, but document the limit and add a metric for queue depth monitoring.

- ✅ **`/recv` blocking vs polling.** Source code confirms: **strictly polling, no alternatives.**
  - `recv.go`: `HandleRecv` calls `DefaultRecvQueue.Pop()`. If empty, returns **204 No Content immediately** — no blocking, no timeout parameter, no long-poll.
  - No WebSocket upgrade, no SSE, no HTTP/2 streaming anywhere in the codebase. The `handler.go` router registers it as a plain `http.HandleFunc`.
  - `gossipsub.py`'s `tick()` method polls in a tight loop (`while True: result = self.recv_fn(); if result is None: break`), then waits for the next heartbeat tick.
  - **Implication for Reckon**: `coordinate.ts` should poll at **~200ms intervals** during the 30s backoff window (150 polls total). This balances latency (~200ms worst-case message detection) against CPU cost. Add a configurable `AXL_POLL_INTERVAL_MS = 200` constant. At 3 nodes generating ≤1 claim/second, this is comfortable. If we ever scale to more nodes, consider wrapping the HTTP bridge in a local WebSocket proxy.

### Remaining low-risk item:

- ⚠️ **Cross-version compatibility.** No semver, no protocol version negotiation visible in the source. The wire format is a simple 4-byte big-endian length prefix + payload — no version field. Mitigation unchanged: all 3 nodes built from the same pinned SHA. If we ever bump, bump all 3 atomically. This is a permanent constraint of using pre-release software, not something that will resolve without upstream changes.

If any of these behave differently in practice, update this guide in place — not a new file.

---

## Changelog from v0.7 guide

### Agent architecture: OpenClaw monolith → SKILL.md + `coordinate.ts` primitive
- v0.7 guide referenced "OpenClaw-based agent" with a monolithic loop. v0.10 spec defines the agent as a **SKILL.md file + 5 standalone TypeScript primitives + thin orchestrator**
- `coordinate.ts` (~150 LoC) is the primitive that wraps AXL GossipSub + 0G Storage KV. It replaces the inline claim-broadcast logic that was previously part of the monolithic agent loop
- The `@reckon-protocol/axl-claim-broadcast` helper package extracts the reusable parts of `coordinate.ts` for external consumption

### AXL communication model: subprocess IPC → HTTP API
- v0.7 guide assumed the AXL `./node` binary was spawned as a subprocess with IPC pipes to the helper package
- Gensyn docs clearly document that AXL exposes a **local HTTP API at `localhost:9002`** with `/send`, `/recv`, `/topology` endpoints
- All communication is now via standard `fetch()` calls from TypeScript — no subprocess management, no Go FFI, no custom IPC

### Build command updated
- v0.7: `make build` (~10 min)
- v0.10: `go build -o node ./cmd/node/` (per Gensyn docs)
- Added Go 1.26 compatibility note (`GOTOOLCHAIN=go1.25.5` workaround)
- Added macOS LibreSSL note for Ed25519 key generation

### Terminology: "indexer" → "relayer"
- All references to "indexer" updated to "relayer" per v0.10 spec terminology cleanup

### ENS references updated
- v0.7 guide referenced "ENS subname registrar" and "ENSReputationWriter"
- v0.10 spec uses **virtual subnames** (MongoDB + CCIP-Read gateway), `SolverRegistry` / `ChallengerRegistry` contracts, and reputation stored in MongoDB served via CCIP-Read
- Updated cross-references accordingly

### Config schema documented
- v0.7 guide listed `PrivateKeyPath`, `Peers`, `Listen` as the only known fields with a note about likely additional fields
- v0.10 guide includes the **full config schema** from Gensyn docs (§1.6): all 14 fields with types, defaults, descriptions

### Security model clarified from docs
- Added Yggdrasil limitations: no onion routing, traffic patterns visible, no access control, no formal audit
- Added explicit note that `coordinate.ts` must validate senders independently (Ed25519 signature verification)
- Added `bridge_addr` security warning

### Products glossary expanded
- Added SAPO, BlockAssist, CodeAssist, CheckFree, SkipPipe to the "not used" list (new since v0.7 compilation)

### Phase timeline updated
- Updated demo video timestamps to match v0.10 spec (SKILL.md scroll at 0:35-0:55, AXL demo at 0:55-1:20)
- Phase 0 adds SKILL.md draft task
- Phase 2 references `coordinate.ts` primitive instead of monolithic GossipSub fork
- Phase 3 helper package now extracts from `coordinate.ts` rather than wrapping a subprocess

### Open items resolved
- Marked 3 items as resolved via Gensyn docs (config schema, app-node communication, health endpoint)
- Resolved 4 more items via AXL source code review: GossipSub protocol internals (lazy-first forwarding), partition behavior (zero buffering — messages silently dropped), message ordering (no guarantees, 100-message queue cap with silent eviction), `/recv` polling model (204 No Content immediately, no long-poll/WebSocket)
- Only 1 low-risk item remains: cross-version compatibility (no semver, mitigated by pinned SHA)
