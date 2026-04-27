# 0G Implementation Guide for Reckon v0.7

**Source:** https://docs.0g.ai/llms-full.txt (with cross-references to `github.com/0gfoundation/0g-agent-nft` and the `@0gfoundation/0g-ts-sdk` / `@0glabs/0g-serving-broker` package READMEs)
**Date compiled:** 2026-04-26
**Scope:** A concrete, code-level implementation guide for every place Reckon v0.7 touches 0G. Reckon's 0G surface is four-fold:

1. **`ChallengerNFT`** — ERC-7857 iNFT on 0G Galileo testnet (chain 16602), forked from `0g-agent-nft` (FR-10, Phase 3 Day 15-17).
2. **0G Storage Log** — batched fill audit trail (FR-3, FR-11, Phase 2 Day 13).
3. **0G Storage KV** — protocol-wide `claim_state` stream for AXL swarm coordination + iNFT brain blobs (FR-8, FR-10, Phase 2 Day 12).
4. **0G Compute** — Qwen3-32B for suspicion triage + NL slash explanations (FR-9, Phase 1 Day 5-6).

Each section below pins the API surface, the package import lines, and the failure modes. Where the docs are vague, we name the gap and propose the defensive shape.

---

## 0. Network parameters — pin these in `.env` before Phase 0 ends

| Param | Galileo (testnet, what we use) | Aristotle (mainnet, future work) |
|---|---|---|
| Chain ID | **16602** | 16661 |
| EVM RPC | `https://evmrpc-testnet.0g.ai` | `https://evmrpc.0g.ai` |
| Explorer | `https://chainscan-galileo.0g.ai` | `https://chainscan.0g.ai` |
| Storage Indexer (Turbo) | `https://indexer-storage-testnet-turbo.0g.ai` | `https://indexer-storage-turbo.0g.ai` |
| Faucet | `https://faucet.0g.ai` (0.1 0G / day cap) | n/a |
| Flow contract (KV) | `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` | TBD |
| Compute Ledger | `0xE70830508dAc0A97e6c087c75f402f9Be669E406` | TBD |

**Critical:** the faucet caps at 0.1 0G/day. With our two-builder setup we need **funded wallets on Galileo by Day 1 of Phase 0** (Builder A for `ChallengerNFT` deploy and indexer attestation events; Builder B for Storage uploads + Compute deposits). Drip-fund on Days 1, 2, and 3 in advance.

`.env` shape (shared package `@reckon-protocol/types/env.ts`):

```bash
ZG_RPC_URL=https://evmrpc-testnet.0g.ai
ZG_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ZG_FLOW_CONTRACT=0x22E03a6A89B950F1c82ec5e74F8eCa321a105296
ZG_COMPUTE_LEDGER=0xE70830508dAc0A97e6c087c75f402f9Be669E406
ZG_CHAIN_ID=16602
ZG_RELAYER_PRIVATE_KEY=0x...   # Builder A — relayer, indexer
ZG_AGENT_PRIVATE_KEY=0x...     # Builder B — agent boot wallet
```

---

## 1. ChallengerNFT — ERC-7857 fork (Builder A, Phase 3 Day 15-17)

### 1.1 What we inherit from `0g-agent-nft`

Repo: `https://github.com/0gfoundation/0g-agent-nft`. Architecture in the docs is "upgradeable beacon proxies + OpenZeppelin AccessControl." We **fork at a pinned commit SHA** (do not git-submodule a moving HEAD; ERC-7857 is pre-spec and will churn).

Standard surface (the bits we consume):

```solidity
interface IERC7857 is IERC721, IERC7857Metadata {
    function iTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external;
    function delegateAccess(address _assistant) external;
    function verifier() external view returns (IERC7857DataVerifier);
}

struct TransferValidityProof {
    AccessProof    accessProof;     // signed by receiver
    OwnershipProof ownershipProof;  // signed by oracle (TEE or ZKP)
}

struct OwnershipProof {
    OracleType oracleType;   // TEE | ZKP
    bytes32    dataHash;
    bytes      sealedKey;    // AES-256-GCM-sealed key for the new owner
    bytes      targetPubkey;
    bytes      nonce;
    bytes      proof;
}
```

The reference contract emits `PublishedSealedKey` on transfer; the receiver listens for it to obtain the sealed AES-256-GCM key for their copy of the brain blob.

### 1.2 What ERC-7857 does NOT give us — and we must build

The docs explicitly say *"royalties would require custom implementation."* Re-read FR-6 with this in mind: the 30% challenger-bounty share is **Reckon's** to compute, not the standard's. That logic lives in `RoyaltyDistributor.sol` on Base, keyed by `tokenId`, with the current owner read out of the relayer-attested `OwnerRegistry`. Do not write "ERC-7857 royalty split" anywhere in the demo script or README.

### 1.3 `ChallengerNFT.sol` deployment shape

- Fork `0g-agent-nft` at a pinned SHA. Rename the package, keep the storage layout (it's a beacon proxy — accidental layout drift kills upgrades).
- Replace the verifier with the **mock oracle** shipped in the reference. Document this loudly in README — "production path is TEE / ZKP; we ship mock for the demo."
- Override `_baseURI()` to point at the 0G Storage Log namespace where Builder B uploads brain blobs (URI is just the Merkle root of the blob; resolver service unwraps).
- Add `updateBrain(tokenId, newRoot)` — `onlyTokenOwner` modifier — emits `MetadataUpdated` (already in the standard). Call sites: agent's graceful-shutdown writeback (Phase 3 Day 15-16, B).
- Capacity caps: `IERC7857Authorize` is exposed by the reference but we **do not** use `authorizeUsage()` in v1. Note for clarity: the standard caps that map at **100 users per token, cleared on transfer**. We don't need to opt into this surface for the hackathon, but if a judge asks "can multiple operators run the same agent?" the answer is "yes, up to 100 via `authorizeUsage`."

### 1.4 Mint flow — Builder A contract, Builder B brain-blob

This is the explicit pairing seam from the spec. Order of operations:

1. **Builder B** runs the brain-blob writer (§3.2 below): generates Ed25519 keypair + EBBO prefs + `kh_` API key, AES-256-GCM-encrypts, uploads to 0G Storage Log via `indexer.upload`, captures Merkle root.
2. **Builder A** calls `ChallengerNFT.mint(to, root, sealedKeyForOwner)`. The `sealedKeyForOwner` is the AES-256-GCM key encrypted against `to`'s public key — same scheme the standard's transfer flow uses, so we reuse the helper from the reference repo.
3. The `Transfer` event fires on 0G Galileo. Indexer (Builder A) is already subscribed and calls `OwnerRegistry.attestOwner(tokenId, to)` on Base; also writes the attestation to MongoDB `owner_attestations`.

### 1.5 Failure modes (additions to NFR-3)

- **Oracle proof expiry:** ERC-7857 proofs are short-lived. If a transfer is initiated and the receiver doesn't fetch a fresh proof in time, `iTransferFrom` reverts. Mitigation: agent runtime fetches proof JIT, not at boot.
- **Mock oracle compromise:** the mock signs anything. This is fine for demo but means **never run with real bounty value on the mock path.** Cap demo iNFT bounty to ≤ 100 USDC; document.
- **Brain blob version skew on transfer:** if the previous owner's agent had partial in-memory state not yet written back, the new owner gets a stale brain. Mitigation: `performance_history` is the only mutable field; agent writes back on every successful slash, not just on shutdown.

---

## 2. 0G Storage — fill audit trail + brain blobs (Builder B, Phase 2 Day 13 / Phase 1 Day 3-5)

### 2.1 Package — get this right

```bash
npm install @0gfoundation/0g-ts-sdk ethers
```

**NOT** `@0glabs/0g-ts-sdk`. The Storage SDK is under the **`@0gfoundation`** scope. The Compute SDK (§4) is under **`@0glabs`**. Both scopes are real, both are active. This is the single most common copy-paste bug — pin in `package.json` on Day 1.

### 2.2 Log layer — batched fill audit trail (FR-11)

The Log layer is immutable, append-only, addressable by Merkle root. **Per-fill writes are uneconomic** — batch fills (N=50 records or 60s, whichever first) into a single file and upload that.

Upload pattern:

```typescript
import { ZgFile, Indexer } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.ZG_RPC_URL);
const signer   = new ethers.Wallet(process.env.ZG_RELAYER_PRIVATE_KEY!, provider);
const indexer  = new Indexer(process.env.ZG_INDEXER_URL!);

// Inside the indexer's batch flush loop:
async function flushBatch(records: FillRecord[]): Promise<string> {
  const path = await writeBatchToTempFile(records);   // JSON Lines, deterministic ordering
  const file = await ZgFile.fromFilePath(path);
  const [tree, treeErr] = await file.merkleTree();
  if (treeErr) throw treeErr;
  const rootHash = tree!.rootHash();

  const [tx, uploadErr] = await indexer.upload(
    file,
    process.env.ZG_RPC_URL!,
    signer,
  );
  await file.close();
  if (uploadErr) throw uploadErr;

  return rootHash;   // emit FillBatchAnchored(root, firstOrderHash, lastOrderHash) on Base
}
```

Download pattern (used by `fill-audit-query` KeeperHub skill, Phase 3 Day 17-18):

```typescript
const err = await indexer.download(rootHash, "/tmp/batch.jsonl", /* withProof */ true);
```

Record the root in `FillRegistry.FillBatchAnchored(rootHash, firstOrderHash, lastOrderHash)` — one event per batch, indexed. Dashboard surfaces "audit trail Merkle root" links to the explorer for each batch.

### 2.3 iNFT brain blob — encryption pinned to AES-256-GCM (Builder B, Phase 1 Day 3-5)

**Why AES-256-GCM and not ECIES** (the Storage SDK supports both): we want consistency with the ERC-7857 transfer flow, which uses AES-256-GCM-sealed keys. Symmetric on the brain blob, asymmetric on the key wrapping — same shape as PGP, same shape as the reference repo.

Brain blob schema:

```typescript
interface BrainBlob {
  axl_ed25519_secret: string;       // hex, 32 bytes
  ebbo_threshold_prefs: { minSlash: string; maxBondPct: number };
  kh_api_key: string;               // kh_-prefixed, per-agent
  model_config: { model: "Qwen3-32B" | "Qwen2.5-0.5B-Instruct"; maxTokens: number };
  performance_history: SlashRecord[];
}
```

Sealing flow:

1. Generate random 32-byte AES key `K`; encrypt blob via AES-256-GCM (12-byte nonce, 16-byte tag).
2. PBKDF2-derive a wrapping key from owner's signed challenge string (100k iterations, SHA-256). This matches the ERC-7857 reference's "sealed against owner's public key" semantics without us building an ECIES path.
3. Wrap `K` under that derived key. Pack `{ciphertext, nonce, tag, wrappedKey}` as the file body.
4. Upload via `indexer.upload`; root hash becomes `tokenURI`.

**Decryption** at agent boot (Phase 3 Day 15-16, B):

1. Owner signs the standard challenge string with their private key.
2. PBKDF2-derive wrapping key, unwrap `K`.
3. Download blob via `indexer.download(rootHash, ..., true)` (`withProof=true` so we verify the Merkle root against on-chain `tokenURI`).
4. AES-256-GCM-decrypt.

### 2.4 KV layer — protocol-wide `claim_state` stream (Phase 2 Day 12)

KV is mutable key-value built atop the Log layer. **The flow contract address is required when constructing a `Batcher`** (file uploads do not need it — the indexer abstracts it; KV does need it, explicitly).

Stream design — pin this:

- **Single protocol-wide `streamId`** for `claim_state` (one stream, not per-agent).
- Key: `keccak256(orderHash)` — 32 bytes.
- Value: `abi.encode(uint256 agentTokenId, uint64 claimedAt, uint64 deadline)` — 96 bytes.

Write pattern:

```typescript
import { Batcher, KvClient } from "@0gfoundation/0g-ts-sdk";

const batcher = new Batcher(
  /* version */ 1,
  /* nodes   */ storageNodes,
  /* flow    */ process.env.ZG_FLOW_CONTRACT!,
  /* rpc     */ process.env.ZG_RPC_URL!,
);

batcher.streamDataBuilder.set(STREAM_ID, keyBytes, valueBytes);
const [tx, err] = await batcher.exec();
if (err) throw err;
```

Read pattern:

```typescript
const kvClient = new KvClient(KV_NODE_URL);
const value = await kvClient.getValue(STREAM_ID, encodedKey);
```

**Ordering with AXL:** AXL gossip is the fast path (sub-second first-claim broadcast). KV is the durable backup truth that survives an AXL hub restart. Agent algorithm:

1. Hear `FillRecorded` event.
2. Broadcast claim on AXL GossipSub channel.
3. After 30s backoff, before submitting challenge, **read `kvClient.getValue(streamId, orderHash)`** to confirm no other agent's claim is durably persisted.
4. If still our claim: write our own claim to KV via `Batcher.exec()`, then submit challenge.
5. If another agent's claim is in KV: yield, log `kv_collision_yielded`.

**Note on docs gaps:** the docs do not detail `Batcher` constructor parameters fully. Builder B should follow the `0g-storage-client` Go reference and the TypeScript starter-kit examples linked from the repo to derive the storage `nodes` array. If unresolved by Phase 2 Day 12, fall back to the `0g-storage-client` CLI + a Node child-process wrapper — uglier, but unblocks.

---

## 3. 0G Compute — suspicion triage + NL slash explanations (Builder B, Phase 1 Day 5-6)

### 3.1 Package + account model

```bash
pnpm add @0glabs/0g-serving-broker
```

(Different scope from Storage — see §2.1.) Account model:

- **Main Account** = your wallet. Deposit 0G via `broker.ledger.depositFund`.
- **Sub-Accounts** = per-provider, per-service. Funds are locked in a sub-account when you `transferFund` to a provider.
- Inference and fine-tuning are **separate** sub-accounts under the same provider. Default service is inference; pass `--service fine-tuning` to redirect.

### 3.2 Predefined models — pricing pinned

| Model | Price | Storage reserve | Use |
|---|---|---|---|
| `Qwen3-32B` | 4 0G / M tokens | 0.09 0G | NL slash explanations + suspicion triage (primary) |
| `Qwen2.5-0.5B-Instruct` | 0.5 0G / M tokens | 0.01 0G | Cost fallback for triage |

When invoking, **drop the `Qwen/` prefix** in the `model` parameter (docs quirk).

### 3.3 Provisioning the broker (TypeScript, agent boot)

```typescript
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

const provider = new ethers.JsonRpcProvider(process.env.ZG_RPC_URL!);
const wallet   = new ethers.Wallet(process.env.ZG_AGENT_PRIVATE_KEY!, provider);
const broker   = await createZGComputeNetworkBroker(wallet);

// One-time: fund main account
await broker.ledger.depositFund(10);   // 10 0G

// One-time per provider: fund inference sub-account + acknowledge signer
await broker.ledger.transferFund(PROVIDER_ADDRESS, "inference", ethers.parseEther("5"));
await broker.inference.acknowledgeProviderSigner(PROVIDER_ADDRESS);

// Per-request: fetch service metadata + signed headers
const meta    = await broker.inference.getServiceMetadata(PROVIDER_ADDRESS);
const headers = await broker.inference.getRequestHeaders(PROVIDER_ADDRESS, /* prompt */ promptString);
```

`meta.endpoint` is the `<service_url>` you pass to OpenAI's `base_url`. `headers` is an opaque map you forward to the model — the broker uses these to settle payment after the response.

### 3.4 Calling the model — OpenAI SDK compatibility

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey:  "app-sk-not-used",     // broker headers carry the auth
  baseURL: `${meta.endpoint}/v1/proxy`,
  defaultHeaders: headers,
});

const completion = await openai.chat.completions.create({
  model:    "Qwen3-32B",
  messages: [{ role: "user", content: "Score 0..1: is this fill suspicious? ..." }],
});
```

Then settle:

```typescript
await broker.inference.processResponse(PROVIDER_ADDRESS, completion);
```

### 3.5 Concurrency — the real constraint

> *"When creating a task for the same provider, you must wait for the previous task to be completed."*

Per-provider concurrency is **effectively 1**. Reckon's design implication: **provision 3 inference sub-accounts** (one per AXL node) so the swarm can issue 3 parallel inference calls. Spec already acknowledges this (FR-9). When provisioning:

1. Each AXL node generates its own wallet on first boot.
2. Pre-fund each from a Phase 0 ops wallet (~3 × 5 0G).
3. Each node's brain blob carries its own `kh_` key + its own provider sub-account address.

### 3.6 Use cases — defensive parsing

The docs do **not** mention structured output. Treat both LLM outputs as free text and parse defensively:

- **Suspicion triage:** prompt asks for "a number between 0 and 1 on the first line." Parse with a regex `/^\s*([01](?:\.\d+)?)/m`. On parse failure, default to `0.5` and skip the optimization (proceed to deterministic math anyway).
- **NL slash explanation:** purely cosmetic; on failure, fall back to a templated string. **Never block a slash on Compute availability.**

### 3.7 Failure modes (additions to NFR-3)

- **Provider offline:** agent skips suspicion triage, runs benchmark math directly. Slash explanation falls back to template. Neither blocks the slash.
- **Sub-account drained:** 0G Compute returns 402-equivalent. Mitigation: monitor `broker.ledger.getLedger()` from the dashboard; alert at < 0.5 0G remaining.
- **Serial-task contention within a single sub-account:** if two challenges fire on the same agent in <inference latency> apart, second call queues. Acceptable — challenge submission isn't latency-critical inside a 30-min window.

---

## 4. End-to-end checklist by phase

### Phase 0 (Day 1, Builder B owns 0G):

- [ ] `.env` populated with all 0G params from §0
- [ ] Galileo wallet funded — `https://faucet.0g.ai` × 3 days
- [ ] `npm install @0gfoundation/0g-ts-sdk @0glabs/0g-serving-broker` cleanly resolves
- [ ] Hello-world `ZgFile.fromFilePath → indexer.upload → indexer.download` round-trip on a 1KB test file
- [ ] Hello-world `createZGComputeNetworkBroker` + `getLedger` returns balance
- [ ] Confirm Qwen3-32B is responsive with a one-shot prompt
- [ ] Fork `0g-agent-nft` at a pinned SHA into `contracts/inft/`; deploy on Galileo with mock oracle; mint a test token

### Phase 1 (Builder B):

- [ ] Brain blob writer (AES-256-GCM + PBKDF2) — uploads to Storage Log, returns root hash
- [ ] OpenClaw agent boot reads brain via `indexer.download(..., withProof=true)` and verifies root matches `tokenURI`
- [ ] Suspicion-triage prompt + NL-slash-explanation prompt wired through broker headers + OpenAI SDK
- [ ] 3 provider sub-accounts provisioned (one per AXL node)

### Phase 2 (Builder B + Builder A coordination):

- [ ] KV `claim_state` stream live; protocol-wide `streamId` baked into a constant in `@reckon-protocol/types`
- [ ] AXL gossip + KV durable-truth interleave tested under simulated 2-agent claim race
- [ ] Builder A's indexer batches fills (50 / 60s) and calls Builder B's Storage uploader
- [ ] `FillBatchAnchored(rootHash, firstOrderHash, lastOrderHash)` fires on Base for each batch

### Phase 3 (Builder A on iNFT contract; Builder B on agent runtime):

- [ ] `ChallengerNFT` deployed on Galileo with mock oracle
- [ ] Two demo iNFTs minted (one per AXL agent identity)
- [ ] `Transfer` events on Galileo trigger `OwnerRegistry.attestOwner` on Base via the indexer (cross-network plumbing rehearsal)
- [ ] `updateBrain(tokenId, newRoot)` callable by owner; emits `MetadataUpdated`
- [ ] Adversarial test: iNFT transferred mid-challenge → 30% bounty queues until `OwnerRegistry` freshness recovers (per FR-6)

### Phase 4:

- [ ] Galileo state preserved (no fork resets needed — Galileo is a real testnet, not Anvil)
- [ ] Demo video: 1:00-1:25 segment shows iNFT on `chainscan-galileo.0g.ai`, transfer to second wallet, relayer attests on Base, next bounty redirects

---

## 5. Spec deltas this guide locks in

These are not speculative — they're the lines this implementation guide commits to and the spec should reference back:

1. **Storage SDK package = `@0gfoundation/0g-ts-sdk`**, Compute SDK package = `@0glabs/0g-serving-broker`. Different scopes; both real. (Already correct in v0.7 — preserve.)
2. **Brain blob encryption = AES-256-GCM + PBKDF2-100k**, not ECIES. Matches ERC-7857 reference's sealing flow. Encryption key derived from owner's signed challenge string.
3. **0G Storage KV `streamId` = single protocol-wide constant** for `claim_state`. Key = `keccak256(orderHash)`, value = `abi.encode(tokenId, claimedAt, deadline)`. Flow contract on Galileo = `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296`.
4. **Provider sub-accounts = 3** (one per AXL node) to bypass the per-provider serial-task constraint.
5. **Compute fallback model = Qwen2.5-0.5B-Instruct** at 0.5 0G/Mtok if Qwen3-32B is unhealthy or sub-account is low.
6. **No royalty inheritance** — `RoyaltyDistributor.sol` on Base implements the 60/30/10 split; ERC-7857 is just the ownership canvas.
7. **Mock oracle in v1**, documented; cap demo bounty value to ≤ 100 USDC since the mock signs anything.
8. **Per-fill writes to Storage Log are forbidden** — batch only (50 records or 60s).
9. **`withProof=true` on every `indexer.download`** that resolves a brain blob — verify Merkle root matches on-chain `tokenURI`.
10. **Faucet drip is a Phase 0 dependency**, not a Phase 4 panic. Schedule it Day 1, 2, 3.

---

## 6. Open items the docs don't resolve

These are real gaps Builder B should expect to hit and route around:

- **Full `Batcher` constructor signature** — the docs don't enumerate the `nodes` argument shape. Workaround: copy the testnet starter kit's working `Batcher` setup verbatim; if that's also incomplete, fall back to `0g-storage-client` CLI subprocess.
- **Compute provider directory** — no canonical list of provider addresses in docs. Use `0g-compute-cli fine-tuning list-providers` (CLI), capture the inference provider address for Qwen3-32B, hard-code in `.env`.
- **Sealed-key publication semantics on transfer** — `PublishedSealedKey` event is mentioned but not documented in detail. Read the `0g-agent-nft` reference test suite (`test/Transfer.t.sol`) to see the exact event payload before relying on it.
- **Storage encryption modes from the SDK side** — docs mention CLI flags but don't show the SDK's encryption hooks. Builder B's brain-blob writer encrypts **before** calling `indexer.upload` (i.e., we treat 0G Storage as raw bytes; encryption is our concern, not the SDK's). Cleaner contract, fewer SDK assumptions.

If any of the above resolves differently in practice, update this guide in place — not a new file.
