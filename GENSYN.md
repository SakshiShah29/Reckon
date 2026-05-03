# How Reckon Uses Gensyn (AXL)

## Overview

Reckon is a decentralized solver accountability protocol for UniswapX. Multiple **challenger agents** monitor on-chain fills and slash solvers who execute at prices worse than the best available (EBBO). These agents must coordinate to avoid submitting duplicate challenges for the same fill — that's where Gensyn's AXL comes in.

AXL provides the **inter-agent communication layer**: an encrypted peer-to-peer mesh that lets agents gossip claim intentions in real-time, achieving consensus on who will challenge a given fill before touching any on-chain or durable storage system.

---

## Architecture

Each challenger agent runs alongside its own AXL node on a separate machine. The agents form a mesh where all coordination happens over AXL — no centralised message broker, no shared database for consensus.

```
┌─────────── VPS 1 ───────────┐        ┌─────────── VPS 2 ───────────┐
│  AXL Node A  ←─────────────────────────→  AXL Node B               │
│  (port 9002)                │        │  (port 9002)                │
│  Listen: tls://:9001        │        │  Peers: tls://<VPS1>:9001   │
│       ↕                     │        │       ↕                     │
│  Sentinel Agent             │        │  Warden Agent               │
│  (token 0)                  │        │  (token 1)                  │
└─────────────────────────────┘        └─────────────────────────────┘
```

- Each AXL node has its own Ed25519 identity (generated PEM key)
- Node A listens on `tls://0.0.0.0:9001`; Node B connects outbound to it
- All inter-agent traffic traverses the **Yggdrasil encrypted overlay network** — no plaintext on the wire
- Nodes work behind NAT without any port forwarding (only the listening node needs a public IP)

**Node configuration:**
```json
// Node A (accepts inbound peers)
{ "PrivateKeyPath": "private.pem", "Peers": [], "Listen": ["tls://0.0.0.0:9001"], "api_port": 9002, "tcp_port": 7000 }

// Node B (connects outbound to Node A)
{ "PrivateKeyPath": "private.pem", "Peers": ["tls://<NODE_A_IP>:9001"], "Listen": [], "api_port": 9002, "tcp_port": 7000 }
```

Each agent's environment includes:
- `AXL_API_URL=http://127.0.0.1:9002` — points to its co-located AXL node
- `AXL_PEER_KEYS=<peer_pubkey>` — the other node's public key (for directed `/send`)

---

## How Coordination Works

When a `FillRecorded` event fires on-chain, both agents detect it simultaneously. Without coordination, both would submit a challenge — wasting gas and creating conflicts. AXL solves this with a **first-claim-wins protocol**:

```
FillRecorded event detected by both agents
         │
         ├─── Sentinel: signClaim() → POST /send to Node B
         └─── Warden:   signClaim() → POST /send to Node A
                    │
                    ▼
         30-second backoff window
         Each agent polls GET /recv every 200ms
         Receives and verifies peer's signed claim
                    │
                    ▼
         Deterministic tiebreaker:
           - Earlier claimedAt timestamp wins
           - Equal timestamps → lower agentTokenId wins
           - Both agents agree without further communication
                    │
                    ▼
         Winner: proceeds to challenge submission
         Loser:  yields immediately, log "claim_yielded_axl"
```

The protocol uses AXL's HTTP API directly:
- **`POST /send`** with `X-Destination-Peer-Id` header — sends a signed claim to the peer
- **`GET /recv`** — dequeues the next message, returns the sender's identity in `X-From-Peer-Id`

Each claim message is signed with Ed25519 over `keccak256(orderHash || tokenId || claimedAt || deadline)`. The signer's public key is embedded in the message so receivers can verify authenticity without needing a separate key registry.

---

## Partition Tolerance

If the AXL mesh is partitioned (network failure between nodes), gossip-based coordination degrades gracefully. The agent falls back to **0G Storage KV** as a durable truth layer:

1. After the gossip backoff window, the agent checks KV for an existing claim
2. If unclaimed, it writes its own claim to KV
3. After writing, it reads back to verify it won the race (read-after-write check)
4. If the other agent's claim is in KV, it yields with `kv_race_lost`

This dual-layer approach (AXL for speed, KV for durability) means the system never double-submits — even under network partition.

---

## Relevant Code

| File | Purpose |
|------|---------|
| [`agent/sentinel/src/coordinate.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/coordinate.ts) | Core coordination — AXL broadcast, poll, claim signing, tiebreaker, KV fallback |
| [`agent/warden/src/coordinate.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/coordinate.ts) | Same coordination logic for the warden agent variant |
| [`agent/sentinel/src/index.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/index.ts) | Agent orchestrator — wires AXL config, invokes coordinate per fill |
| [`agent/warden/src/index.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/index.ts) | Warden orchestrator — same pipeline, different agent identity |
| [`agent/sentinel/src/boot.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/sentinel/src/boot.ts) | Extracts Ed25519 signing key from iNFT brain blob |
| [`agent/warden/src/boot.ts`](https://github.com/SakshiShah29/Reckon/blob/main/agent/warden/src/boot.ts) | Same boot sequence for warden agent |
| [`packages/types/src/constants.ts`](https://github.com/SakshiShah29/Reckon/blob/main/packages/types/src/constants.ts) | AXL constants: `AXL_BACKOFF_SECONDS`, `AXL_SEND_TIMEOUT_MS`, `AXL_POLL_INTERVAL_MS` |
| [`inft-tools/src/provision.ts`](https://github.com/SakshiShah29/Reckon/blob/main/inft-tools/src/provision.ts) | Provisions iNFTs with AXL Ed25519 keys in brain blob |

### coordinate.ts Breakdown

| Lines | What it does |
|-------|-------------|
| 64-83 | `signClaim()` — Ed25519 signature over claim digest using `@noble/ed25519` |
| 85-100 | `verifyClaim()` — validates incoming claims against embedded signer public key |
| 112-175 | `createAxlTransport()` — AXL HTTP wrapper: broadcast to peer, poll for competing claims |
| 158-164 | Tiebreaker logic — timestamp comparison + tokenId fallback for deterministic consensus |
| 186-303 | `coordinate()` — full state machine: jitter → sign → broadcast → poll → KV check → KV write → verify |

---

## Why AXL

| Concern | How AXL Solves It |
|---------|-------------------|
| No double-submissions | Gossip + deterministic tiebreaker ensures exactly one agent proceeds per fill |
| No trusted intermediary | Each agent runs its own AXL node — no central server to trust or fail |
| Encrypted coordination | Yggdrasil TLS + gVisor — no plaintext claim data on the wire |
| NAT-friendly | Connecting node works behind firewalls without port forwarding |
| Partition tolerance | Falls back to 0G Storage KV if gossip fails — correctness preserved |
| Identity | Ed25519 public key is the node's identity — no external PKI needed |

A centralised message broker would be a single point of failure incompatible with a decentralized protocol. If the broker goes down, agents either all submit (wasting gas) or none submit (fills go unchallenged). AXL gives us peer-to-peer coordination with no trusted intermediary.

---

## Built During Hackathon

All AXL integration code was written during the hackathon:
- `agent/sentinel/src/coordinate.ts` and `agent/warden/src/coordinate.ts` — claim coordination protocol over AXL HTTP API
- `inft-tools/src/provision.ts` — iNFT provisioning with AXL Ed25519 keys in brain blob
- AXL protocol constants in `@reckon-protocol/types`
- Jitter + deterministic tiebreaker + read-after-write consensus mechanism
