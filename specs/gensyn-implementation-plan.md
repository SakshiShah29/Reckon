# Gensyn AXL Implementation Plan — Step-by-Step with Validation Gates

**Based on:** `gensyn-implementation-guide-v0.10.md` + `0g-implementation-guide-v0.10.md` + `reckon-spec-v0.10.md`
**Owner:** Builder B
**Total estimated hours:** ~26-30 hours across Phase 1, Phase 2, Phase 3 (Phase 4 deferred)
**Principle:** Every step ends with a concrete, pass/fail test. Do not proceed to the next step until the test passes.

> **Architecture context:** A single Reckon challenger agent is formed by **Gensyn (AXL)** and **0G (Storage, KV, Compute, ChallengerNFT)** working together. This plan covers the Gensyn side. The 0G side is covered in a separate implementation plan. The two plans converge at `coordinate.ts` (Step 2.6-2.7), which is the integration seam where both providers meet, and at iNFT brain blob extraction (Step 2.0), where the AXL identity is bootstrapped from 0G Storage.
>
> | Primitive | Provider | Covered in this plan? |
> |---|---|---|
> | `triage.ts` | 0G Compute | No (0G plan) |
> | `ebbo.ts` | Neither | No (pure math) |
> | `coordinate.ts` | **Both Gensyn + 0G** | **Yes — this is the primary deliverable** |
> | `decide.ts` | Neither | No (pure logic) |
> | `submit.ts` | 0G Storage Log | No (0G plan) |

---

## Phase 1: Infrastructure Foundation (Day 1, ~5-6 hours)

### Step 1.1 — Clone and build AXL binary (local machine first)

**What:** Clone the `gensyn-ai/axl` repo, pin to a specific commit SHA, and produce the `node` binary.

**Commands:**
```bash
git clone https://github.com/gensyn-ai/axl.git
cd axl
git log --oneline -5   # pick the latest stable commit
git checkout <SHA>
go build -o node ./cmd/node/
# If Go 1.26+:
# GOTOOLCHAIN=go1.25.5 go build -o node ./cmd/node/
```

**Validation test:**
```bash
./node --help 2>&1 | head -5
# PASS: prints usage/flags without error
# FAIL: build error or "command not found"

ls -la node
# PASS: binary exists, is executable (size ~20-40MB)
```

**Exit criteria:** `./node` binary exists and is executable on your local machine.

---

### Step 1.2 — Generate Ed25519 identity key (local)

**What:** Generate a persistent Ed25519 private key for a test node.

**Commands:**
```bash
# Linux:
openssl genpkey -algorithm ed25519 -out private.pem

# macOS:
/opt/homebrew/opt/openssl/bin/openssl genpkey -algorithm ed25519 -out private.pem
```

**Validation test:**
```bash
openssl pkey -in private.pem -noout -text 2>&1 | grep -i "ed25519"
# PASS: output contains "ED25519" or "ed25519"
# FAIL: "unable to load key" or no ed25519 reference

file private.pem
# PASS: "PEM" or "ASCII text"
```

**Exit criteria:** `private.pem` exists and is a valid Ed25519 PEM key.

---

### Step 1.3 — Boot a single AXL node locally

**What:** Start one AXL node with the generated key and verify the HTTP API is reachable.

**Config (`node-config.json`):**
```json
{
  "PrivateKeyPath": "private.pem",
  "Peers": [],
  "Listen": [],
  "api_port": 9002,
  "tcp_port": 7000
}
```

**Commands:**
```bash
./node -config node-config.json &
sleep 2
```

**Validation test:**
```bash
curl -s http://127.0.0.1:9002/topology | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert 'our_public_key' in d, 'missing public key'
assert len(d['our_public_key']) == 64, f'bad key length: {len(d[\"our_public_key\"])}'
assert 'our_ipv6' in d, 'missing ipv6'
print(f'PASS: pubkey={d[\"our_public_key\"][:16]}... ipv6={d[\"our_ipv6\"]}')
"
# PASS: prints public key prefix and IPv6 address
# FAIL: connection refused, JSON parse error, or assertion failure
```

**Exit criteria:** Single node running, `/topology` returns a valid 64-char hex public key and IPv6.

---

### Step 1.4 — Boot two local nodes, send a message between them

**What:** Run two AXL nodes on the same machine with different ports. Node A listens on a local TLS address; Node B peers to it. Send a message from one to the other and confirm receipt.

**Important:** AXL has no automatic peer discovery. Nodes with `"Peers": []` and `"Listen": []` are completely isolated — they cannot route messages to each other even on the same machine. At least one node must listen, and the other must explicitly peer to it.

**Update Node A config (`node-config.json`) to listen:**
```json
{
  "PrivateKeyPath": "private.pem",
  "Peers": [],
  "Listen": ["tls://127.0.0.1:9001"],
  "api_port": 9002,
  "tcp_port": 7000
}
```

**Config for Node B (`node-config-2.json`) — peers to Node A:**

**Note:** `tcp_port` is the gVisor userspace TCP listener — it runs inside the Yggdrasil virtual network stack, NOT on the host. Since it operates in the virtual network (not the host network), all nodes use the **same `tcp_port`** value (7000) regardless of whether they're on the same machine or separate VPS instances. When Node B sends to Node A, it dials Node A's Yggdrasil IPv6 on this port — both sides must agree on the value.

```json
{
  "PrivateKeyPath": "private-2.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9012,
  "tcp_port": 7000
}
```

**Commands:**
```bash
# Generate second key
openssl genpkey -algorithm ed25519 -out private-2.pem  # (or Homebrew variant)

# Restart Node A with Listen enabled (kill previous instance first)
kill $(lsof -ti :9002) 2>/dev/null
./node -config node-config.json &
sleep 2

# Start Node B (peers to Node A)
./node -config node-config-2.json &
sleep 3  # allow TLS handshake + peering

# Get public keys
NODE_A_KEY=$(curl -s http://127.0.0.1:9002/topology | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")
NODE_B_KEY=$(curl -s http://127.0.0.1:9012/topology | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")

echo "Node A: $NODE_A_KEY"
echo "Node B: $NODE_B_KEY"

# Verify peering succeeded
curl -s http://127.0.0.1:9002/topology | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Node A peers: {len(d.get(\"peers\", []))}')"
# Should print "Node A peers: 1"
```

**Validation test:**
```bash
# Send from B → A (use the variable from above, not a hardcoded key)
curl -s -X POST http://127.0.0.1:9012/send \
  -H "X-Destination-Peer-Id: $NODE_A_KEY" \
  -d '{"test": "hello from B"}'

sleep 1

# Receive on A
RESPONSE=$(curl -s -w "\n%{http_code}\n%{header:X-From-Peer-Id}" http://127.0.0.1:9002/recv)
BODY=$(echo "$RESPONSE" | head -1)
STATUS=$(echo "$RESPONSE" | sed -n '2p')
FROM_PEER=$(echo "$RESPONSE" | sed -n '3p')

echo "Status: $STATUS"
echo "Body: $BODY"
echo "From: $FROM_PEER"

# PASS: status=200, body contains "hello from B", FROM_PEER matches NODE_B_KEY
# FAIL: status=204 (nothing received), or body mismatch, or peer ID mismatch
```

**Exit criteria:** Message sent from Node B arrives at Node A with correct body and correct `X-From-Peer-Id` header matching Node B's public key.

---

### Step 1.5 — Three-node hub-and-spoke topology (local simulation)

**What:** Run 3 nodes on the same machine simulating the production topology: one hub (listening) + two spokes (connecting to hub). Reuses keys from Step 1.4 — Node A (`private.pem`) becomes the hub, Node B (`private-2.pem`) becomes Spoke A, and a new key is generated for Spoke B.

**Configs:**

Hub (`node-config.json` — same key as Node A from Step 1.4):
```json
{
  "PrivateKeyPath": "private.pem",
  "Peers": [],
  "Listen": ["tls://127.0.0.1:9001"],
  "api_port": 9002,
  "tcp_port": 7000
}
```

Spoke A (`node-config-2.json` — same key as Node B from Step 1.4):
```json
{
  "PrivateKeyPath": "private-2.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9012,
  "tcp_port": 7000
}
```

Spoke B (`node-config-3.json` — new key):
```json
{
  "PrivateKeyPath": "private-3.pem",
  "Peers": ["tls://127.0.0.1:9001"],
  "Listen": [],
  "api_port": 9022,
  "tcp_port": 7000
}
```

**Commands:**
```bash
# Generate key for Spoke B only (reuse private.pem and private-2.pem from Step 1.4)
openssl genpkey -algorithm ed25519 -out private-3.pem  # (or Homebrew variant)

# Start all 3
# Kill any leftover nodes from Step 1.4
kill $(lsof -ti :9002) $(lsof -ti :9012) 2>/dev/null
sleep 1

# Start all 3
./node -config node-config.json &
sleep 2
./node -config node-config-2.json &
sleep 2
./node -config node-config-3.json &
sleep 3
```

**Validation test:**
```bash
# 1. Hub should see 2 peers
HUB_PEERS=$(curl -s http://127.0.0.1:9002/topology | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('peers', [])))")
echo "Hub peers: $HUB_PEERS"
# PASS: Hub peers = 2

# 2. Get all public keys
HUB_KEY=$(curl -s http://127.0.0.1:9002/topology | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")
SPOKE_A_KEY=$(curl -s http://127.0.0.1:9012/topology | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")
SPOKE_B_KEY=$(curl -s http://127.0.0.1:9022/topology | python3 -c "import sys,json; print(json.load(sys.stdin)['our_public_key'])")

curl -s -X POST http://127.0.0.1:9012/send \
  -H "X-Destination-Peer-Id: $SPOKE_B_KEY" \
  -d '{"test": "spoke-a-to-spoke-b"}'

sleep 1


RECV=$(curl -s -D - http://127.0.0.1:9022/recv)
echo "$RECV" | grep -q "spoke-a-to-spoke-b" && echo "PASS: Spoke A → Spoke B via hub works" || echo "FAIL: message not received"
echo "$RECV" | grep -qi "X-From-Peer-Id" && echo "PASS: peer ID header present" || echo "FAIL: missing peer header"
```

**Exit criteria:** Spoke A can send a message to Spoke B through the hub. The `X-From-Peer-Id` header on Spoke B's `/recv` matches Spoke A's public key.

---

### Step 1.6 — Partition resilience test (hub kill/restart)

**What:** Verify that when the hub goes down, spokes eventually get errors, and when the hub comes back, communication resumes.

**Commands (with 3 nodes from Step 1.5 still running):**
```bash
# Kill the hub
kill $(lsof -ti :9002)
sleep 2
```

**Validation test — during partition:**

**Note:** AXL's `/send` creates a new TCP connection per message. When the hub is dead, the TCP dial does NOT return 502 instantly — it blocks until the **OS-level TCP connect timeout** expires (typically 30-75s depending on platform). This means `coordinate.ts` must enforce its own send timeout to avoid blocking the backoff window. Use `AbortSignal.timeout()` in the `fetch()` call.

```bash
# Spoke A tries to send to Spoke B (will block on TCP dial, so cap with --max-time)
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST http://127.0.0.1:9012/send \
  -H "X-Destination-Peer-Id: $SPOKE_B_KEY" \
  -d '{"test": "during-partition"}')

echo "Send status during partition: $HTTP_STATUS"
# PASS: status = 502 (dial failed) OR status = 000 (curl timed out at 10s — dial still pending)
#       Both confirm the hub is unreachable. The key observation is that /send does NOT
#       return 200 and does NOT silently succeed.
# FAIL: status = 200 (impossible — message would have been delivered to dead hub)

# Spoke HTTP APIs are still responsive (topology endpoint is local-only, not affected by mesh partition)
curl -s --max-time 5 http://127.0.0.1:9012/topology > /dev/null && echo "PASS: Spoke A still responsive" || echo "FAIL: Spoke A crashed"
curl -s --max-time 5 http://127.0.0.1:9022/topology > /dev/null && echo "PASS: Spoke B still responsive" || echo "FAIL: Spoke B crashed"
```

**Validation test — after recovery:**

**Note:** Yggdrasil TLS sessions do NOT automatically reconnect after the hub process dies and restarts. The spokes hold a stale connection. **All three nodes must be restarted** to restore the mesh. This is a critical operational finding — in production, a hub restart requires a rolling restart of spokes (or a process supervisor that detects the dead TLS link and restarts the spoke node).

```bash
# Restart all 3 nodes (hub first, then spokes)
kill $(lsof -ti :9012) $(lsof -ti :9022) 2>/dev/null
sleep 1

./node -config node-config.json &
sleep 2
./node -config node-config-2.json &
sleep 2
./node -config node-config-3.json &
sleep 3

# Verify mesh is reconnected
HUB_PEERS=$(curl -s http://127.0.0.1:9002/topology | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('peers', [])))")
echo "Hub peers after recovery: $HUB_PEERS"
# PASS: Hub peers = 2

# Spoke A sends to Spoke B again
curl -s --max-time 10 -X POST http://127.0.0.1:9012/send \
  -H "X-Destination-Peer-Id: 505cf2d9a783dd22eb494c03e70ad78b3b95529323db7424a5c4402e57d8504e" \
  -d '{"test": "after-recovery"}'

sleep 1

RECV=$(curl -s http://127.0.0.1:9022/recv)
echo "$RECV" | grep -q "after-recovery" && echo "PASS: Communication restored after full restart" || echo "FAIL: Still partitioned"
```

**Exit criteria:** Spokes return 502 during partition (not hang/crash), spokes remain responsive, and communication resumes after hub restart. Documents the exact failure mode `coordinate.ts` must handle.

---

### Step 1.7 — ~~Run the Python GossipSub example end-to-end~~ REMOVED

**Status:** Removed. `gossipsub.py` is a **library class**, not a runnable script — it has no `__main__`, no argparse, no CLI flags. It cannot be executed from the terminal.

**What we learned:** The GossipSub class is a pattern to port (lazy-first forwarding, IHAVE/IWANT, mesh maintenance), not a tool to run. The raw `/send` + `/recv` HTTP API validated in Steps 1.4-1.5 is exactly what `coordinate.ts` will use. The GossipSub protocol logic (broadcast-to-all-peers, dedup by message ID) will be implemented directly in TypeScript in Phase 2.

**This step's original purpose (validate multi-node pub/sub) is already covered by Step 1.5** — Spoke A successfully sent a message to Spoke B via the hub using `/send` and `/recv`.

---

## Phase 1 Checkpoint

Before proceeding to Phase 2, confirm all of the following:
- [ ] AXL binary builds from source
- [ ] 3-node hub-and-spoke mesh connects (locally simulated)
- [ ] Messages route between spokes via hub
- [ ] Partition test documents: spokes block on send, don't crash, recover after full restart
- [ ] SKILL.md draft includes `coordinate.ts` step with expected JSON contract

---

## Phase 2: `coordinate.ts` Implementation (Day 8-12, ~18-20 hours)

### Step 2.0 — iNFT brain blob → AXL identity bootstrap

**What:** Implement the boot sequence that extracts the AXL Ed25519 keypair from the iNFT brain blob stored on 0G Storage. This is the critical link between the two infrastructure providers — without it, the AXL node has no persistent identity tied to the on-chain ChallengerNFT.

**Prerequisites:** 0G Storage SDK configured (from 0G implementation plan), ChallengerNFT minted on 0G Galileo testnet with a brain blob containing `axl_ed25519_secret`.

**Key code (`agent/bootstrap.ts`):**
```typescript
import { ZgFile } from "@0glabs/0g-ts-sdk";

async function extractAxlIdentity(tokenId: bigint): Promise<string> {
  // 1. Read iNFT brain blob from 0G Storage
  const brainBlob = await readBrainBlob(tokenId);  // from 0G implementation

  // 2. Decrypt with AES-256-GCM (key derived from owner's wallet)
  const brain = JSON.parse(decrypt(brainBlob));

  // 3. Write Ed25519 key to local FS for AXL node
  const keyPath = "/data/axl/private.pem";
  await fs.writeFile(keyPath, brain.axl_ed25519_secret, { mode: 0o600 });

  return keyPath;
}

// On shutdown: scrub the local key (canonical copy is on 0G Storage)
process.on("SIGTERM", () => fs.unlinkSync("/data/axl/private.pem"));
```

**Validation test:**
```bash
npx tsx agent/scripts/test-bootstrap.ts --tokenId 1
```

```typescript
// test-bootstrap.ts
// 1. Read brain blob from 0G Storage for tokenId 1
// 2. Decrypt and extract axl_ed25519_secret
// 3. Write to private.pem
// 4. Boot AXL node with that key
// 5. Verify /topology returns a valid public key
// 6. Verify the public key matches the one stored in the iNFT metadata

// PASS: AXL node boots with the iNFT-derived identity, pubkey matches metadata
// FAIL: decrypt error, missing field, or pubkey mismatch
```

**Exit criteria:** AXL node boots using the Ed25519 key extracted from the iNFT brain blob on 0G Storage. The AXL public key matches what's recorded in the iNFT metadata. On shutdown, the local key file is scrubbed.

---

### Step 2.1 — Scaffold `coordinate.ts` with AXL HTTP wrapper

**What:** Create the `coordinate.ts` file with a thin wrapper around AXL's HTTP API (`/send`, `/recv`, `/topology`). No claim logic yet — just verify TypeScript can talk to the AXL node.

**File:** `agent/src/coordinate.ts`

```typescript
// Minimal scaffold — AXL HTTP wrapper
const AXL_API = process.env.AXL_API_URL ?? "http://127.0.0.1:9002";

async function getTopology() {
  const resp = await fetch(`${AXL_API}/topology`);
  return await resp.json();
}

async function send(peerKey: string, data: unknown) {
  const resp = await fetch(`${AXL_API}/send`, {
    method: "POST",
    headers: { "X-Destination-Peer-Id": peerKey },
    body: JSON.stringify(data),
  });
  return resp.status;
}

async function recv(): Promise<{ data: unknown; fromPeer: string } | null> {
  const resp = await fetch(`${AXL_API}/recv`);
  if (resp.status === 204) return null;
  const fromPeer = resp.headers.get("X-From-Peer-Id") ?? "";
  const data = await resp.json();
  return { data, fromPeer };
}

// Self-test mode
if (process.argv[2] === "selftest") {
  const topo = await getTopology();
  console.log(JSON.stringify({ ourKey: topo.our_public_key, ipv6: topo.our_ipv6 }));
}
```

**Validation test:**
```bash
# With AXL node running on port 9002:
npx tsx agent/src/coordinate.ts selftest | python3 -c "
import sys, json
d = json.load(sys.stdin)
assert len(d['ourKey']) == 64, f'bad key length: {len(d[\"ourKey\"])}'
assert d['ipv6'].startswith('200:') or d['ipv6'].startswith('2'), 'bad ipv6'
print('PASS: coordinate.ts can talk to AXL node')
"
```

**Exit criteria:** `coordinate.ts` successfully fetches topology from the local AXL node and prints valid JSON.

---

### Step 2.2 — Implement claim message schema and Ed25519 signing

**What:** Define the `ClaimMessage` type and implement Ed25519 signing/verification over the canonical fields.

**Dependencies:** `@noble/ed25519` (or `tweetnacl`) + `viem` (for keccak256)

```typescript
import { keccak256, encodePacked } from "viem";
import * as ed from "@noble/ed25519";

interface ClaimMessage {
  orderHash: `0x${string}`;
  agentTokenId: bigint;
  claimedAt: number;
  deadline: number;
  signature: `0x${string}`;
}

function claimDigest(msg: Omit<ClaimMessage, "signature">): Uint8Array {
  const packed = encodePacked(
    ["bytes32", "uint256", "uint64", "uint64"],
    [msg.orderHash, msg.agentTokenId, BigInt(msg.claimedAt), BigInt(msg.deadline)]
  );
  return keccak256(packed, "bytes");
}
```

**Validation test:**
```bash
npx tsx agent/scripts/test-claim-signing.ts
```

```typescript
// test-claim-signing.ts
import * as ed from "@noble/ed25519";
import { keccak256, encodePacked } from "viem";

// Generate test keypair
const privKey = ed.utils.randomPrivateKey();
const pubKey = await ed.getPublicKeyAsync(privKey);

const claim = {
  orderHash: "0x" + "ab".repeat(32) as `0x${string}`,
  agentTokenId: 42n,
  claimedAt: Math.floor(Date.now() / 1000),
  deadline: Math.floor(Date.now() / 1000) + 60,
};

const digest = keccak256(encodePacked(
  ["bytes32", "uint256", "uint64", "uint64"],
  [claim.orderHash, claim.agentTokenId, BigInt(claim.claimedAt), BigInt(claim.deadline)]
), "bytes");

// Sign
const signature = await ed.signAsync(digest, privKey);

// Verify
const valid = await ed.verifyAsync(signature, digest, pubKey);
console.assert(valid, "FAIL: signature verification failed");

// Tamper test — change orderHash, verify fails
const tamperedDigest = keccak256(encodePacked(
  ["bytes32", "uint256", "uint64", "uint64"],
  ["0x" + "cd".repeat(32) as `0x${string}`, claim.agentTokenId, BigInt(claim.claimedAt), BigInt(claim.deadline)]
), "bytes");
const invalidVerify = await ed.verifyAsync(signature, tamperedDigest, pubKey);
console.assert(!invalidVerify, "FAIL: tampered message should not verify");

console.log("PASS: claim signing and verification works correctly");
```

**Exit criteria:** Ed25519 signing produces valid signatures that verify against the correct digest; tampered digests fail verification.

---

### Step 2.3 — Implement broadcast + receive in `coordinate.ts` (no dedup logic yet)

**What:** Add broadcast-to-all-peers and poll-for-incoming-claims to `coordinate.ts`. Test that a signed claim message published by one node is received by the other two.

**Key code additions:**
- `broadcastClaim(claim, peerKeys)` — iterates peer keys, POSTs to `/send` for each
- `pollClaims(timeoutMs, intervalMs)` — polls `/recv` at 200ms intervals until timeout

**Validation test (requires 3 local AXL nodes from Step 1.5):**
```bash
# Terminal 1 — Spoke A publishes a claim:
AXL_API_URL=http://127.0.0.1:9012 npx tsx agent/src/coordinate.ts broadcast \
  --orderHash 0xaabbccdd... \
  --agentTokenId 1 \
  --peerKeys "$HUB_KEY,$SPOKE_B_KEY"

# Terminal 2 — Spoke B polls for claims:
AXL_API_URL=http://127.0.0.1:9022 npx tsx agent/src/coordinate.ts poll --timeout 5000
```

**Expected output on Spoke B:**
```json
{
  "received": true,
  "claim": {
    "orderHash": "0xaabbccdd...",
    "agentTokenId": "1",
    "claimedAt": 1745884800,
    "deadline": 1745884860,
    "signature": "0x..."
  },
  "fromPeer": "<spoke-a-public-key>",
  "signatureValid": true
}
```

```
# PASS: received=true, signatureValid=true, fromPeer matches Spoke A's key
# FAIL: received=false (timeout), signatureValid=false, or fromPeer mismatch
```

**Exit criteria:** A signed claim broadcast from Spoke A arrives at Spoke B within 2 seconds, with valid signature and correct peer identity.

---

### Step 2.4 — Implement the backoff/dedup state machine

**What:** Add the 30-second backoff window logic: after broadcasting a claim, poll for competing claims. If a competitor has an earlier `claimedAt`, yield.

**Key logic:**
```typescript
// After broadcasting our claim:
// Poll /recv for 30 seconds at 200ms intervals
// If we see a claim for the same orderHash with claimedAt < ours → yield
// If no competitor wins within 30s → we won the gossip round
```

**Validation test — two-agent race (same machine, 2 AXL nodes):**
```bash
# Agent A claims with claimedAt = T
# Agent B claims with claimedAt = T+1 (1 second later)
# Both run coordinate.ts acquire simultaneously

npx tsx agent/scripts/test-two-agent-race.ts
```

```typescript
// test-two-agent-race.ts
// 1. Start both agents' coordinate.ts acquire in parallel
// 2. Agent A has claimedAt = now
// 3. Agent B has claimedAt = now + 1
// 4. After backoff window:
//    - Agent A should output: {claimAcquired: true}
//    - Agent B should output: {claimAcquired: false, claimedBy: "<agent-a-tokenId>"}

// PASS: exactly one agent wins, the one with earlier claimedAt
// FAIL: both win, both lose, or wrong agent wins
```

**Exit criteria:** Given two simultaneous claims for the same `orderHash`, exactly one agent wins (the one with earlier `claimedAt`), and the other yields gracefully.

---

### Step 2.5 — Three-agent race test with crash simulation

**What:** Three agents claim the same orderHash. The winner is killed mid-claim (after gossip broadcast but before KV write). After the 60s deadline expires, a second agent takes over.

**Validation test:**
```bash
npx tsx agent/scripts/test-three-agent-crash.ts
```

**Scenario:**
1. Agents A (claimedAt=T), B (T+2), C (T+4) all broadcast claims for same orderHash
2. After A wins the gossip round, simulate A crashing (no KV write, no submission)
3. After 60s deadline, B or C should detect the expired claim and re-acquire

**Expected output:**
```
Agent A: claimAcquired=true at T+30s
Agent A: [SIMULATED CRASH - no KV write]
... 60s deadline passes ...
Agent B: claimAcquired=true (took over expired claim) at ~T+90s
Agent C: claimAcquired=false (lost to B)
```

```
# PASS: A wins initially, B takes over after deadline, C yields to B
# FAIL: nobody takes over, or multiple agents proceed simultaneously
```

**Exit criteria:** Crash recovery works — a second agent takes over after the 60s deadline with no double-submission risk.

---

### Step 2.6 — Integrate 0G Storage KV as durable truth layer (dual-provider integration seam)

**What:** After winning the gossip round, `coordinate.ts` writes the claim to 0G Storage KV. Before submitting, it reads KV to verify no other agent wrote first. **This step is where the Gensyn and 0G implementation plans converge** — `coordinate.ts` is the only primitive that touches both AXL (gossip) and 0G KV (durable state).

**Dependencies:** `@0gfoundation/0g-ts-sdk` (must be configured per 0G implementation plan)

**Key operations:**
- `kvClient.getValue(streamId, orderHash)` — read current claim state
- `Batcher.exec([{ key: orderHash, value: claimJson }])` — write claim atomically

**Validation test:**
```bash
# Requires a 0G Galileo testnet connection with a funded wallet

npx tsx agent/scripts/test-kv-integration.ts
```

```typescript
// test-kv-integration.ts
// 1. Write a claim to KV for orderHash X
// 2. Read it back — should match
// 3. Attempt to write a different claim for the same orderHash X
// 4. Read again — should still be the first claim (first-writer-wins)

// Also test:
// 5. Read a non-existent key — should return null/empty
// 6. Verify KV read timeout behavior (2500ms cap)
```

**Expected output:**
```
PASS: write claim to KV
PASS: read claim back matches
PASS: second write for same key is handled (first-writer-wins or last-writer-wins — document which)
PASS: non-existent key returns null
PASS: timeout behavior documented
```

**Exit criteria:** `coordinate.ts` can write claims to 0G KV and read them back. The write/read semantics are documented (first-writer-wins vs last-writer-wins).

---

### Step 2.7 — Full `coordinate.ts` integration test (AXL gossip + 0G KV combined)

**What:** End-to-end test of the complete `coordinate.ts acquire` flow: gossip broadcast → backoff poll → KV verify → KV write.

**Validation test (3 local AXL nodes + 0G Galileo KV):**
```bash
npx tsx agent/scripts/test-coordinate-e2e.ts
```

**Scenario:**
1. Agent A calls `coordinate.ts acquire` for orderHash X
2. Agent A broadcasts claim via AXL, waits 30s, checks KV (empty), writes to KV
3. Agent B calls `coordinate.ts acquire` for the same orderHash X (started 5s after A)
4. Agent B sees A's gossip claim during backoff (claimedAt < B's), yields
5. Agent B confirms by reading KV — sees A's claim

**Expected output:**
```json
// Agent A:
{"claimAcquired": true, "claimedBy": "self"}

// Agent B:
{"claimAcquired": false, "claimedBy": "1"}  // Agent A's tokenId
```

Also test `coordinate.ts check`:
```bash
AXL_API_URL=http://127.0.0.1:9022 npx tsx agent/src/coordinate.ts check --orderHash 0x...
# Output: {"claimAcquired": true, "claimedBy": "1"}
```

And `coordinate.ts release`:
```bash
AXL_API_URL=http://127.0.0.1:9012 npx tsx agent/src/coordinate.ts release --orderHash 0x...
# Output: {"released": true}

# Verify released:
AXL_API_URL=http://127.0.0.1:9022 npx tsx agent/src/coordinate.ts check --orderHash 0x...
# Output: {"claimAcquired": false, "claimedBy": ""}
```

**Exit criteria:** The full acquire/check/release lifecycle works end-to-end with both AXL gossip and 0G KV acting as expected. Two agents competing for the same orderHash produces exactly one winner.

---

### Step 2.8 — Orchestrator integration test (coordinate.ts as child process)

**What:** Verify the orchestrator can spawn `coordinate.ts` as a child process, pass inputs via env vars, and parse its stdout JSON output.

**Validation test:**
```bash
npx tsx agent/orchestrator.ts --test-primitive coordinate --action acquire --orderHash 0xtest...
```

**Expected output:**
```json
{
  "primitive": "coordinate",
  "action": "acquire",
  "input": {"orderHash": "0xtest...", "agentTokenId": "1"},
  "output": {"claimAcquired": true, "claimedBy": "self"},
  "durationMs": 30150,
  "exitCode": 0
}
```

**Additional checks:**
```
# PASS: orchestrator spawns coordinate.ts, passes env vars, parses JSON from stdout
# PASS: non-zero exit code from coordinate.ts is caught and logged to MongoDB agent_errors
# PASS: coordinate.ts timeout (if it hangs) is handled by orchestrator (kill after 35s)
# FAIL: orchestrator hangs, or can't parse output, or doesn't log errors
```

**Exit criteria:** Orchestrator correctly drives `coordinate.ts` as a child process with proper env var injection, stdout JSON parsing, error handling, and timeout management.

---

### Step 2.9 — Packet capture for demo video

**What:** Capture network traffic between hub and spoke showing TLS + Yggdrasil encryption layers during a claim broadcast.

**Commands:**
```bash
# On the hub machine (Hetzner):
tcpdump -i eth0 -w /tmp/axl-claim-capture.pcap port 9001 &
TCPDUMP_PID=$!

# Trigger a claim broadcast from Spoke A
AXL_API_URL=http://127.0.0.1:9012 npx tsx agent/src/coordinate.ts acquire \
  --orderHash 0xdemo... --agentTokenId 1

# Stop capture
kill $TCPDUMP_PID
```

**Validation test:**
```bash
# Verify capture has TLS traffic
tcpdump -r /tmp/axl-claim-capture.pcap -c 10 | grep -i "TLS\|tls" && \
  echo "PASS: TLS layer visible in capture" || echo "FAIL: no TLS seen"

# Verify payload is encrypted (not plaintext JSON)
tcpdump -r /tmp/axl-claim-capture.pcap -A | grep -c "orderHash"
# PASS: count = 0 (encrypted, not readable)
# FAIL: count > 0 (plaintext leak)

# Verify capture is non-empty and has reasonable size
ls -la /tmp/axl-claim-capture.pcap
# PASS: file size > 1KB (actual traffic captured)
```

**Exit criteria:** Packet capture shows TLS handshake and encrypted payload. No plaintext claim data is visible in the capture. File saved for demo video.

---

## Phase 2 Checkpoint

Before proceeding to Phase 3, confirm all of the following:
- [ ] iNFT brain blob → AXL identity bootstrap works (Step 2.0)
- [ ] AXL pubkey matches iNFT metadata (on-chain identity = off-chain identity)
- [ ] `coordinate.ts` talks to AXL via HTTP API (send/recv/topology)
- [ ] Ed25519 claim signing and verification works
- [ ] Broadcast reaches all peers within 2s
- [ ] Backoff/dedup state machine produces exactly 1 winner in a 2-agent race
- [ ] Crash recovery: second agent takes over after 60s deadline
- [ ] 0G Storage KV read/write works for claim state (dual-provider integration seam)
- [ ] Full AXL+KV integration test passes (gossip fast path + KV durable backup)
- [ ] Orchestrator correctly drives `coordinate.ts` as child process
- [ ] Packet capture shows encrypted traffic for demo video
- [ ] All outputs logged to MongoDB `agent_runs` collection

---

## Phase 3: Demo + Final QA (Day 17-22, ~6-8 hours)

### Step 3.1 — 4-hour adversarial smoke test

**What:** Run the full agent swarm (3 nodes, all with `coordinate.ts` active) for 4 hours against the Anvil-forked Base mainnet. Inject fills with varying quality levels. Verify the dedup logic correctly produces one challenge per bad fill with no double-submissions.

**Setup:**
- 3 AXL nodes running locally (hub + 2 spokes)
- Each running the full SKILL.md loop (orchestrator + 5 primitives)
- Anvil fork with `FillRegistry` emitting `FillRecorded` events
- 0G KV stream provisioned for `claim_state`
- MongoDB `agent_runs` collection capturing all decisions

**Validation test (run for 4 hours, then analyze):**
```bash
npx tsx agent/scripts/analyze-smoke-test.ts
```

**Expected output:**
```
Smoke Test Results (4 hours):
  Total FillRecorded events: 47
  Slashable fills detected: 12
  Claims broadcast (total across all agents): 36 (12 × 3 agents)
  Claims won (unique orderHashes): 12
  Double-submissions: 0 ← CRITICAL
  Claims lost to peer: 24 (12 × 2 losing agents)
  KV collisions caught: 0 (gossip was fast enough)
  Partition events: 1 (hub briefly unreachable for 3s)
  Claims recovered after partition: 1 (KV caught it)
  submit.ts calls: 12
  Successful challenges: 11
  Failed challenges: 1 (fill was borderline, expected)

PASS: zero double-submissions across 4 hours
PASS: every slashable fill was challenged exactly once
PASS: partition recovery worked via KV
```

```
# CRITICAL PASS CONDITION: double-submissions = 0
# PASS: every slashable fill challenged exactly once
# PASS: no agent crashes or hangs
# ACCEPTABLE: some fills unchallenged due to partition (documented)
# FAIL: any double-submission, or >1 fill permanently unchallenged without partition event
```

**Exit criteria:** Zero double-submissions over 4 hours. Every slashable fill is challenged exactly once. The system handles at least one simulated partition gracefully via KV fallback.

---

### Step 3.2 — Deploy an AXL node + agent on a VPS (single-unit guide)

**What:** Deploy a single challenger unit (AXL node + Reckon agent) on a cloud VPS (DigitalOcean Droplet, Hetzner, AWS Lightsail, etc.). Each VPS runs one AXL node and one agent as a co-located pair. The agent talks to its local AXL node on `localhost:9002`. To run 3 full challenger agents, repeat this on 3 separate VPS instances.

**Architecture per VPS:**
```
┌─────────────────────────────────┐
│            VPS                  │
│  ┌───────────┐  ┌────────────┐ │
│  │  AXL Node │←→│   Agent    │ │
│  │  :9001 TLS│  │ coordinate │ │
│  │  :9002 API│  │  triage    │ │
│  │  :7000 tcp│  │  ebbo      │ │
│  └───────────┘  │  decide    │ │
│                 │  submit    │ │
│                 └────────────┘ │
└─────────────────────────────────┘
Agent hits http://127.0.0.1:9002
```

**Requirements:**
- VPS with Ubuntu 22.04+ (or Debian 12+), 2 vCPU, 2 GB RAM minimum
- Go 1.25.x (for AXL node)
- Node.js 20+ (for agent)
- A public IP address on at least one VPS (the hub)

**Part A — AXL node setup:**

```bash
# 1. SSH into the VPS
ssh root@<VPS_IP>

# 2. Install Go 1.25.x
wget https://go.dev/dl/go1.25.5.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.25.5.linux-amd64.tar.gz
export PATH=$PATH:/usr/local/go/bin
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc

# 3. Clone and build AXL
git clone https://github.com/gensyn-ai/axl.git
cd axl
go build -o node ./cmd/node/

# 4. Generate Ed25519 key
openssl genpkey -algorithm ed25519 -out private.pem

# 5. Write node config
# For the HUB VPS (accepts inbound peers, needs public IP):
cat > node-config.json <<'EOF'
{
  "PrivateKeyPath": "private.pem",
  "Peers": [],
  "Listen": ["tls://0.0.0.0:9001"],
  "api_port": 9002,
  "tcp_port": 7000
}
EOF

# For a SPOKE VPS (connects outbound to hub, works behind NAT):
cat > node-config.json <<'EOF'
{
  "PrivateKeyPath": "private.pem",
  "Peers": ["tls://<HUB_PUBLIC_IP>:9001"],
  "Listen": [],
  "api_port": 9002,
  "tcp_port": 7000
}
EOF

# 6. Open firewall ports
# Hub only: allow inbound TLS peering
sudo ufw allow 9001/tcp
# All nodes: no need to expose 9002 externally — agent is on localhost
```

**Part B — Agent setup:**

```bash
# 1. Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Clone the Reckon repo
cd /root
git clone <RECKON_REPO_URL> reckon
cd reckon

# 3. Install dependencies
npm install

# 4. Build packages (types must build before agent)
npm run build --workspace=packages/types
npm run build --workspace=inft-tools
npm run build --workspace=agent

# 5. Write agent .env
cat > agent/.env <<'EOF'
# ── iNFT identity ──
CHALLENGER_NFT_TOKEN_ID=<your-token-id>
ZG_AGENT_PRIVATE_KEY=<your-0g-wallet-private-key>

# ── 0G infrastructure ──
ZG_RPC_URL=https://evmrpc-testnet.0g.ai
ZG_INDEXER_URL=https://indexer-storage-testnet-standard.0g.ai
ZG_FLOW_CONTRACT=0x22E03a6A89B950F1c82ec5e74F8eCa321a105296
ZG_KV_NODE_URL=https://kv-testnet.0g.ai
ZG_COMPUTE_PROVIDER_ADDRESS=<provider-address>

# ── Base mainnet ──
BASE_RPC_URL=https://mainnet.base.org
FILL_REGISTRY_ADDRESS=<fill-registry-address>
SOLVER_BOND_VAULT_ADDRESS=<bond-vault-address>

# ── AXL coordination (agent talks to local node) ──
AXL_API_URL=http://127.0.0.1:9002
AXL_PEER_KEYS=<peer1-pubkey>,<peer2-pubkey>

# ── KeeperHub ──
KH_WEBHOOK_URL=<keeperhub-webhook-url>
KH_API_KEY=<keeperhub-api-key>

# ── Mode ──
HEADLESS_MODE=true
EOF

# 6. Verify agent starts
cd agent
npm run start
```

**Part C — Run both as systemd services:**

```bash
# AXL node service
cat > /etc/systemd/system/axl-node.service <<EOF
[Unit]
Description=AXL Node
After=network.target

[Service]
Type=simple
WorkingDirectory=/root/axl
ExecStart=/root/axl/node -config node-config.json
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Agent service (starts after AXL node is up)
cat > /etc/systemd/system/reckon-agent.service <<EOF
[Unit]
Description=Reckon Challenger Agent
After=network.target axl-node.service
Requires=axl-node.service

[Service]
Type=simple
WorkingDirectory=/root/reckon/agent
ExecStart=/usr/bin/node --import tsx src/index.ts
Restart=always
RestartSec=10
EnvironmentFile=/root/reckon/agent/.env

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable axl-node reckon-agent
sudo systemctl start axl-node
sudo systemctl start reckon-agent

# Check status
sudo systemctl status axl-node reckon-agent
journalctl -u reckon-agent -f
```

**Part D — Verify the unit is working:**

```bash
# AXL node is up
curl -s http://127.0.0.1:9002/topology | python3 -c "
import sys, json; d=json.load(sys.stdin)
print(f'Public key: {d[\"our_public_key\"]}')
print(f'Peers: {len(d.get(\"peers\", []))}')
"

# Agent is running and listening for fills
journalctl -u reckon-agent --no-pager -n 5
# Should show: "[orchestrator] Running. Pipeline: triage → ebbo → coordinate → decide → submit"
```

**Important notes:**
- Each VPS is a self-contained challenger unit: 1 AXL node + 1 agent. For 3 agents, deploy on 3 VPS instances.
- `tcp_port: 7000` is the same across all VPS instances — it's a gVisor virtual port, not a host port.
- The hub VPS must have a public IP with port 9001 open. Spoke VPS instances connect outbound and work behind NAT.
- Port 9002 (AXL API) does NOT need to be exposed externally — the agent accesses it on localhost.
- If the hub's AXL node restarts, spoke AXL nodes must also restart — Yggdrasil TLS sessions do not auto-reconnect. The systemd `Restart=always` handles this if the spoke detects the dead connection. The agent service has `Requires=axl-node.service` so it restarts together.
- Save each node's public key from `/topology` — the other two agents need it in their `AXL_PEER_KEYS` env var.
- Each agent needs its own iNFT (`CHALLENGER_NFT_TOKEN_ID`) and its own 0G wallet key.

**Exit criteria:** Both services running, agent logs show "listening for fills", `/topology` shows peers connected (≥1 for spokes, ≥2 for hub).

---

### Step 3.3 — Deploy full production topology (3 VPS instances)

**What:** Using the single-unit guide from Step 3.2, deploy 3 challenger units on 3 separate VPS instances: one hub + two spokes. Each VPS runs its own AXL node + agent pair.

**Deployment order:**
1. Deploy VPS 1 (hub) — `Listen: ["tls://0.0.0.0:9001"]`, `Peers: []`
2. Note hub's public IP and public key from `/topology`
3. Deploy VPS 2 (spoke A) — `Peers: ["tls://<HUB_IP>:9001"]`
4. Deploy VPS 3 (spoke B) — `Peers: ["tls://<HUB_IP>:9001"]`
5. On each VPS, set `AXL_PEER_KEYS` in `.env` to the public keys of the **other two** nodes

**Validation test:**
```bash
# From your local machine (not on any of the 3 VPSes):

# Verify hub mesh is connected (need port 9001 open on hub, not 9002)
ssh root@<HUB_IP> "curl -s http://127.0.0.1:9002/topology" | python3 -c "
import sys, json; d=json.load(sys.stdin)
print(f'Hub key: {d[\"our_public_key\"][:16]}...')
print(f'Hub peers: {len(d.get(\"peers\", []))}')
assert len(d.get('peers', [])) == 2, f'Expected 2 peers, got {len(d.get(\"peers\", []))}'
print('PASS: Production topology connected')
"

# Verify all 3 agents are running
for VPS in <HUB_IP> <SPOKE_A_IP> <SPOKE_B_IP>; do
  ssh root@$VPS "systemctl is-active reckon-agent" 
done
# All should print "active"

# Cross-region message test (Spoke A → Spoke B via Hub)
# SSH to Spoke A, send to Spoke B's pubkey, SSH to Spoke B, recv
# PASS: message arrives within 500ms
```

**Exit criteria:** All 3 VPS instances running (AXL node + agent), hub shows 2 peers, all agents logging "listening for fills".

---

### Step 3.4 — Demo video segment recording

**What:** Record the AXL/Gensyn demo segment (0:55-1:20 per v0.10 spec).

**Script:**
1. Show terminal with `coordinate.ts` starting (SKILL.md step 3)
2. Trigger a bad fill on Anvil fork
3. Show claim broadcast in real-time (AXL logs showing send/recv)
4. Show packet capture (Wireshark) — TLS + encrypted payload
5. Show `submit.ts` triggering KeeperHub webhook
6. Show slash execution on-chain

**Validation test:**
```
# PASS: recorded segment shows:
#   - coordinate.ts log: "Broadcasting claim for 0x..."
#   - coordinate.ts log: "Claim acquired, proceeding to decide.ts"
#   - Wireshark: TLS handshake visible, no plaintext leak
#   - submit.ts log: "Challenge submitted, txHash: 0x..."
#   - On-chain: slash event emitted
# FAIL: any step not visible in recording, or latency > 5s between steps
```

**Exit criteria:** Demo video segment clearly shows the AXL mesh coordinating a challenge with visible encryption.

---

### Step 3.5 — Final README "Why AXL?" section

**What:** Write the Gensyn-facing README section explaining what AXL is, why we chose it, and what we contributed back.

**Validation test:**
```
# Have someone unfamiliar with the project read ONLY the "Why AXL?" section.
# Ask them: (1) What is AXL? (2) Why does Reckon use it? (3) What did you build on top?
# PASS: they can answer all 3 correctly without reading any other section
# FAIL: any answer is wrong or they say "I don't understand"
```

**Exit criteria:** README section is clear enough that a Gensyn bounty judge understands the contribution in 60 seconds of reading.

---

## Phase 3 Checkpoint

Before proceeding to Phase 4 (deferred), confirm all of the following:
- [ ] 4-hour smoke test: zero double-submissions, all slashable fills challenged
- [ ] Single-unit VPS deployment guide followed and validated (AXL node + agent running as systemd services)
- [ ] Production topology deployed (3 VPS instances, each running AXL node + agent) and connected
- [ ] Demo video segment recorded
- [ ] README "Why AXL?" section written
- [ ] Packet capture saved for demo video
- [ ] MongoDB `agent_runs` shows complete decision audit trail for every fill

---

## Phase 4: Helper Package + Polish (DEFERRED — do after demo)

> **This phase is optional polish.** It extracts working code into a reusable npm package. All core functionality is complete after Phase 3. Do this when there's time, not before the demo.

### Step 4.1 — Extract `@reckon-protocol/axl-claim-broadcast` from `coordinate.ts`

**What:** Extract the reusable AXL claim coordination logic from `coordinate.ts` into a standalone npm package.

**Package structure:**
```
packages/axl-claim-broadcast/
├── src/
│   ├── index.ts          # AxlClaimBroker class
│   ├── types.ts          # ClaimMessage, BrokerConfig
│   ├── signing.ts        # Ed25519 sign/verify helpers
│   └── gossip.ts         # GossipSub-pattern (send/recv/poll)
├── examples/
│   └── two-agent-race.ts
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE (MIT)
```

**Exit criteria:** Package builds, unit tests pass, exports a clean `AxlClaimBroker` class.

---

### Step 4.2 — `examples/two-agent-race.ts` + latency benchmark

**What:** Self-contained example that boots two local AXL nodes, fires simultaneous claims, demonstrates one winning deterministically. Plus a latency benchmark (p99 < 200ms).

**Exit criteria:** Example runs standalone; benchmark shows p99 < 200ms.

---

### Step 4.3 — Refactor `coordinate.ts` to use the helper package + publish to npm

**What:** Replace inline AXL logic in `coordinate.ts` with an import from the package. Publish `@reckon-protocol/axl-claim-broadcast` v0.1.0 to npm.

**Exit criteria:** `coordinate.ts` uses the package, all Phase 2 integration tests still pass, package published to npm.

---

### Step 4.4 — 48-hour soak test

**What:** Leave the production 3-node mesh running for 48 hours with periodic claim broadcasts (1 per hour). Verify no drift, crashes, or memory leaks.

**Validation test (run after 48 hours):**
```bash
# Check all 3 nodes are still responding
for PORT in 9002 9012 9022; do
  curl -s --connect-timeout 5 http://127.0.0.1:$PORT/topology > /dev/null && \
    echo "PASS: Node on port $PORT alive after 48h" || \
    echo "FAIL: Node on port $PORT died"
done

# Check memory usage hasn't grown unboundedly
ps aux | grep "node -config" | awk '{print $5, $6}'
# PASS: RSS < 200MB per node (reasonable for a Go binary)
# FAIL: RSS > 500MB (memory leak, likely recv queue not being drained)

# Check hourly claim broadcasts all succeeded
cat /var/log/axl-soak-test.log | grep -c "claim_acquired=true"
# PASS: count = 48 (one per hour for 48 hours)
# FAIL: count < 48 (some claims failed)
```

**Exit criteria:** All 3 nodes alive after 48 hours, memory stable, all scheduled claims succeeded.

---

## Final Delivery Checklist

| Deliverable | Validation | Status |
|---|---|---|
| **Dual-provider architecture** | | |
| iNFT brain blob → AXL identity bootstrap | AXL pubkey matches iNFT metadata | |
| `coordinate.ts` touches both AXL + 0G KV | Full e2e test passes with both providers | |
| Degradation modes documented | AXL-down and KV-down paths tested | |
| **Gensyn (AXL) infrastructure** | | |
| AXL binary builds from source | `go build` succeeds | |
| 3-node hub-and-spoke mesh connected | `/topology` shows 2 peers on hub | |
| Ed25519 claim signing/verification | Sign/verify/tamper tests pass | |
| GossipSub broadcast + poll | 2-agent and 3-agent race tests pass | |
| Partition resilience | KV catches claims lost during partition | |
| Packet capture | TLS visible, no plaintext leak | |
| **coordinate.ts (integration seam)** | | |
| `coordinate.ts` (~150 LoC) | All integration tests pass | |
| 0G Storage KV integration | Read/write/check lifecycle works | |
| Orchestrator drives `coordinate.ts` | Child process spawn + JSON parse | |
| **Production readiness** | | |
| 4-hour adversarial smoke test | Zero double-submissions | |
| Demo video segment (0:55-1:20) | Shows encrypted claim coordination | |
| README "Why AXL?" section | Readable by non-expert in 60s | |
| MongoDB `agent_runs` audit trail | Every coordinate.ts call logged | |
| **Helper package (DEFERRED)** | | |
| `@reckon-protocol/axl-claim-broadcast` v0.1.0 | Published to npm, installs clean | |
| `examples/two-agent-race.ts` | Runs standalone, deterministic | |
| Latency benchmark | p99 < 200ms | |
| 48-hour soak test | All nodes alive, memory stable | |
