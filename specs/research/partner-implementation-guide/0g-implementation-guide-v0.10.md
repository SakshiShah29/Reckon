# 0G Implementation Guide for Reckon v0.10

**Source:** https://docs.0g.ai/llms-full.txt (with cross-references to `github.com/0gfoundation/0g-agent-nft` and the `@0gfoundation/0g-ts-sdk` / `@0glabs/0g-serving-broker` package READMEs)
**Date compiled:** 2026-04-28
**Spec version alignment:** Reckon v0.10 (terminology cleanup: "indexer" renamed to "relayer" throughout; agent architecture: SKILL.md + 5 primitives + orchestrator; ENS: virtual subnames via wildcard resolver + CCIP-Read)
**Scope:** A concrete, code-level implementation guide for every place Reckon v0.10 touches 0G. Reckon's 0G surface is four-fold:

1. **`ChallengerNFT`** — ERC-7857 iNFT on 0G Galileo testnet (chain 16602), forked from `0g-agent-nft` (FR-10, Phase 3 Day 15-17).
2. **0G Storage Log** — batched fill audit trail (FR-3, FR-11, Phase 2 Day 13).
3. **0G Storage KV** — protocol-wide `claim_state` stream for AXL swarm coordination + iNFT brain blobs (FR-8 `coordinate.ts` primitive, FR-10, Phase 2 Day 12).
4. **0G Compute** — Qwen3-32B for suspicion triage + NL slash explanations (FR-9, `triage.ts` primitive, Phase 1 Day 5-6).

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
| Faucet (Google Cloud alt.) | `https://cloud.google.com/application/web3/faucet/0g/galileo` | n/a |
| Flow contract (KV) | `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` | `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526` |
| Compute Ledger | `0xE70830508dAc0A97e6c087c75f402f9Be669E406` | `0x2dE54c845Cd948B72D2e32e39586fe89607074E3` |
| Compute Inference | `0xa79F4c8311FF93C06b8CfB403690cc987c93F91E` | TBD |
| Compute FineTuning | `0xaC66eBd174435c04F1449BBa08157a707B6fa7b1` | TBD |

**Critical:** the faucet caps at 0.1 0G/day (the Google Cloud faucet is an alternative if the primary is congested). With our two-builder setup we need **funded wallets on Galileo by Day 1 of Phase 0** (Builder A for `ChallengerNFT` deploy and relayer attestation events; Builder B for Storage uploads + Compute deposits). Drip-fund on Days 1, 2, and 3 in advance.

**Third-party RPC alternatives** (if the primary RPC is rate-limited): QuickNode, ThirdWeb, Ankr, dRPC NodeCloud all support 0G Galileo.

`.env` shape (shared package `@reckon-protocol/types/env.ts`):

```bash
ZG_RPC_URL=https://evmrpc-testnet.0g.ai
ZG_INDEXER_URL=https://indexer-storage-testnet-turbo.0g.ai
ZG_FLOW_CONTRACT=0x22E03a6A89B950F1c82ec5e74F8eCa321a105296
ZG_COMPUTE_LEDGER=0xE70830508dAc0A97e6c087c75f402f9Be669E406
ZG_CHAIN_ID=16602
ZG_RELAYER_PRIVATE_KEY=0x...   # Builder A — relayer, attestations
ZG_AGENT_PRIVATE_KEY=0x...     # Builder B — agent boot wallet
ZG_COMPUTE_PROVIDER=0x...      # Inference provider for Qwen3-32B (discovered via listService)
```

---

## 1. ChallengerNFT — ERC-7857 fork (Builder A, Phase 3 Day 15-17)

### 1.1 What we inherit from `0g-agent-nft`

Repo: `https://github.com/0gfoundation/0g-agent-nft`. Architecture in the docs is "upgradeable beacon proxies + OpenZeppelin AccessControl." We **fork at a pinned commit SHA** (do not git-submodule a moving HEAD; ERC-7857 is pre-spec and will churn).

The reference repo exposes three role-gated contracts:
- **AgentNFT**: Minting, creator tracking, mint fees. Roles: `ADMIN_ROLE`, `OPERATOR_ROLE`, `MINTER_ROLE`.
- **Verifier**: TEE/ZKP proof orchestration with nonce-based replay protection (7-day expiry).
- **AgentMarket**: Marketplace with off-chain order/offer matching and on-chain settlement. Seller signs an EIP-712 `Order` struct (tokenId, expectedPrice, currency, expireTime, nonce, receiver); buyer signs an `Offer` struct (tokenId, offerPrice, expireTime, nonce, **`needProof`** flag). `fulfillOrder` validates both signatures, handles payment (native ETH or ERC-20), deducts platform fee + creator/partner fee (basis points), and transfers the NFT. When `offer.needProof == true`, it routes through `iTransferFrom` (triggering the sealed-key re-encryption flow); when false, it uses standard `safeTransferFrom`. Fee splitting: `feeRate` (global, max 10%) + `partnerFeeRate` (per-creator, share of total fee). Nonce-based replay protection on both sides.

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

**`PublishedSealedKey` — exact event surface (resolved from `0g-agent-nft` source):**

```solidity
event PublishedSealedKey(address indexed _to, uint256 indexed _tokenId, bytes[] _sealedKeys);
```

- Fires inside `ERC7857Upgradeable._transfer()` after `_proofCheck()` validates proofs and `safeTransferFrom()` moves ownership.
- **Only fires on `iTransferFrom`** (the intelligent transfer path requiring `TransferValidityProof[]`). Regular `transferFrom` / `safeTransferFrom` do NOT emit this event.
- `_sealedKeys` is an array with one entry per `IntelligentData` slot on the token. Each entry is the data-encryption key re-encrypted to the receiver's public key, extracted from `TransferValidityProofOutput.sealedKey` after verifier validation.
- The call chain: `iTransferFrom()` → `_transfer()` → `_proofCheck()` (validates `AccessProof` via ECDSA recovery + `OwnershipProof` via TEE/ZKP oracle) → `safeTransferFrom()` → **emit `PublishedSealedKey`**.

Related struct for the proof output:

```solidity
struct TransferValidityProofOutput {
    bytes32 dataHash;
    bytes   sealedKey;          // the re-encrypted key for the new owner
    bytes   targetPubkey;
    bytes   wantedKey;
    address accessAssistant;
    bytes   accessProofNonce;
    bytes   ownershipProofNonce;
}
```

Other IERC7857 events (for completeness):

```solidity
event Updated(uint256 indexed _tokenId, IntelligentData[] _oldDatas, IntelligentData[] _newDatas);
event DelegateAccess(address indexed _user, address indexed _assistant);
```

**Extensions available but NOT used in v1:**
- **Cloneable** (`iCloneFrom()`): creates a token with the same encrypted metadata. Not needed for our use case.
- **Authorize** (`authorizeUsage()` / `revokeAuthorization()`): grants usage rights to up to 100 users per token, cleared on transfer. If a judge asks "can multiple operators run the same agent?" the answer is "yes, up to 100 via `authorizeUsage`."

### 1.2 What ERC-7857 does NOT give us — and we must build

The docs explicitly say *"royalties would require custom implementation."* Re-read FR-6 with this in mind: the 30% challenger-bounty share is **Reckon's** to compute, not the standard's. That logic lives in `RoyaltyDistributor.sol` on Base, keyed by `tokenId`, with the current owner read out of the relayer-attested `OwnerRegistry`. Do not write "ERC-7857 royalty split" anywhere in the demo script or README.

### 1.3 `ChallengerNFT.sol` deployment shape

- Fork `0g-agent-nft` at a pinned SHA. Rename the package, keep the storage layout (it's a beacon proxy — accidental layout drift kills upgrades).
- Replace the verifier with the **mock oracle** shipped in the reference. Document this loudly in README — "production path is TEE / ZKP; we ship mock for the demo."
- Override `_baseURI()` to point at the 0G Storage Log namespace where Builder B uploads brain blobs (URI is just the Merkle root of the blob; resolver service unwraps).
- Add `updateBrain(tokenId, newRoot)` — `onlyTokenOwner` modifier — emits `MetadataUpdated` (already in the standard). Call sites: agent orchestrator's graceful-shutdown writeback (Phase 3 Day 15-16, B).
- Capacity caps: we **do not** use `authorizeUsage()` in v1. Note for clarity.

### 1.4 Mint flow — Builder A contract, Builder B brain-blob

This is the explicit pairing seam from the spec. Order of operations:

1. **Builder B** runs the brain-blob writer (§3.2 below): generates Ed25519 keypair + EBBO prefs + `kh_` API key, AES-256-GCM-encrypts, uploads to 0G Storage Log via the 0G `indexer` client's `upload()` method, captures Merkle root.
2. **Builder A** calls `ChallengerNFT.mint(to, root, sealedKeyForOwner)`. The `sealedKeyForOwner` is the AES-256-GCM key encrypted against `to`'s public key — same scheme the standard's transfer flow uses, so we reuse the helper from the reference repo.
3. The `Transfer` event fires on 0G Galileo. Relayer (Builder A) is already subscribed and calls `OwnerRegistry.attestOwner(tokenId, to)` on Base; also writes the attestation to MongoDB `owner_attestations`.

### 1.5 Failure modes (additions to NFR-3)

- **Oracle proof expiry:** ERC-7857 proofs are short-lived (verifier uses nonce-based replay protection with 7-day expiry). If a transfer is initiated and the receiver doesn't fetch a fresh proof in time, `iTransferFrom` reverts. Mitigation: agent runtime fetches proof JIT, not at boot.
- **Mock oracle compromise:** the mock signs anything. This is fine for demo but means **never run with real bounty value on the mock path.** Cap demo iNFT bounty to ≤ 100 USDC; document.
- **Brain blob version skew on transfer:** if the previous owner's agent had partial in-memory state not yet written back, the new owner gets a stale brain. Mitigation: `performance_history` is the only mutable field; orchestrator writes back on every successful slash, not just on shutdown.

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

// Inside the relayer's batch flush loop:
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

**Note on CLI encryption:** the 0G Storage CLI supports client-side AES-256-CTR encryption via `--encryption-key`. We do **not** use this — our brain-blob writer encrypts **before** calling the SDK's `upload()` (i.e., we treat 0G Storage as raw bytes; encryption is our concern, not the SDK's). Cleaner contract, fewer SDK assumptions.

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

**v0.10 change:** The orchestrator reads and decrypts the brain blob at agent boot, then exposes brain data to the 5 primitives (`triage.ts`, `ebbo.ts`, `coordinate.ts`, `decide.ts`, `submit.ts`) via environment variables when spawning each as a child process.

Sealing flow:

1. Generate random 32-byte AES key `K`; encrypt blob via AES-256-GCM (12-byte nonce, 16-byte tag).
2. PBKDF2-derive a wrapping key from owner's signed challenge string (100k iterations, SHA-256). This matches the ERC-7857 reference's "sealed against owner's public key" semantics without us building an ECIES path.
3. Wrap `K` under that derived key. Pack `{ciphertext, nonce, tag, wrappedKey}` as the file body.
4. Upload via the 0G `indexer` client's `upload()` method; root hash becomes `tokenURI`.

**Decryption** at agent boot (orchestrator, Phase 3 Day 15-16, B):

1. Owner signs the standard challenge string with their private key.
2. PBKDF2-derive wrapping key, unwrap `K`.
3. Download blob via `indexer.download(rootHash, ..., true)` (`withProof=true` so we verify the Merkle root against on-chain `tokenURI`).
4. AES-256-GCM-decrypt.
5. Orchestrator injects decrypted values (`axl_ed25519_secret`, `kh_api_key`, `ebbo_threshold_prefs`, etc.) as env vars when spawning each primitive script.

### 2.4 KV layer — protocol-wide `claim_state` stream (Phase 2 Day 12, `coordinate.ts` primitive)

KV is mutable key-value built atop the Log layer. **The flow contract address is required when constructing a `Batcher`** (file uploads do not need it — the `indexer` client abstracts it; KV does need it, explicitly).

Stream design — pin this:

- **Single protocol-wide `streamId`** for `claim_state` (one stream, not per-agent).
- Key: `keccak256(orderHash)` — 32 bytes.
- Value: `abi.encode(uint256 agentTokenId, uint64 claimedAt, uint64 deadline)` — 96 bytes.

Write pattern (used by `coordinate.ts` primitive):

```typescript
import { Indexer, Batcher, getFlowContract, KvClient } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.ZG_RPC_URL!);
const signer   = new ethers.Wallet(process.env.ZG_RELAYER_PRIVATE_KEY!, provider);

// 1. Get StorageNode[] via the indexer's node selection
const indexer = new Indexer(process.env.ZG_INDEXER_URL!);
const [nodes, nodeErr] = await indexer.selectNodes(/* expectedReplica */ 1);
if (nodeErr) throw nodeErr;

// 2. Get the FixedPriceFlow contract instance (required — raw address string won't work)
const flowContract = getFlowContract(process.env.ZG_FLOW_CONTRACT!, signer);

// 3. Construct the Batcher with the correct types
const batcher = new Batcher(
  /* version */ 1,
  /* clients */ nodes,          // StorageNode[], NOT string[]
  /* flow    */ flowContract,   // FixedPriceFlow, NOT string
  /* rpc     */ process.env.ZG_RPC_URL!,
);

// 4. Set KV pairs — streamId as hex string
const keyBytes = Uint8Array.from(Buffer.from(keccak256(orderHash).slice(2), "hex"));
const valBytes = Uint8Array.from(abiEncode(agentTokenId, claimedAt, deadline));
batcher.streamDataBuilder.set("0x" + STREAM_ID.toString(16), keyBytes, valBytes);

// 5. Execute — returns { txHash, rootHash } on success
const [result, err] = await batcher.exec();
if (err) throw err;
// result.txHash, result.rootHash available
```

Read pattern (used by `coordinate.ts` primitive):

```typescript
const kvClient = new KvClient(KV_NODE_URL);
const value = await kvClient.getValue(STREAM_ID, encodedKey);
```

**Ordering with AXL (as implemented in `coordinate.ts`):** AXL gossip is the fast path (sub-second first-claim broadcast). KV is the durable backup truth that survives an AXL hub restart. The `coordinate.ts` primitive implements three actions:

1. **`acquire`**: broadcast claim on AXL GossipSub channel, then write claim to KV via `Batcher.exec()`.
2. **`check`**: read `kvClient.getValue(streamId, orderHash)` to confirm no other agent's claim is durably persisted.
3. **`release`**: clear claim from KV (used when agent decides not to challenge after all).

The orchestrator calls `coordinate.ts` with `action=check` before `action=acquire`, and again before `submit.ts` runs, per the SKILL.md decision tree.

**Note on docs gaps:** the docs do not detail `Batcher` constructor parameters fully. Builder B should follow the `0g-storage-client` Go reference and the TypeScript starter-kit examples (`github.com/0gfoundation/0g-storage-ts-starter-kit`) to derive the storage `nodes` array. If unresolved by Phase 2 Day 12, fall back to the `0g-storage-client` CLI + a Node child-process wrapper — uglier, but unblocks.

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
- **24-hour refund lock**: retrieving funds from a sub-account triggers a 24-hour lock before they return to the main account. Plan for this — don't try to shuffle funds between sub-accounts last-minute.

### 3.2 Predefined models — pricing pinned

| Model | Price | Storage reserve | Use |
|---|---|---|---|
| `Qwen3-32B` | 4 0G / M tokens | 0.09 0G | NL slash explanations + suspicion triage (primary, via `triage.ts`) |
| `Qwen2.5-0.5B-Instruct` | 0.5 0G / M tokens | 0.01 0G | Cost fallback for triage |

When invoking, **drop the `Qwen/` prefix** in the `model` parameter (docs quirk).

### 3.3 Provisioning the broker (TypeScript, orchestrator boot)

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

// Per-request (called by triage.ts primitive): fetch service metadata + signed headers
const meta    = await broker.inference.getServiceMetadata(PROVIDER_ADDRESS);
const headers = await broker.inference.getRequestHeaders(PROVIDER_ADDRESS, /* prompt */ promptString);
```

`meta.endpoint` is the `<service_url>` you pass to OpenAI's `base_url`. `headers` is an opaque map you forward to the model — the broker uses these to settle payment after the response.

**Balance monitoring:** `broker.ledger.getLedger()` returns `{totalBalance, availableBalance}`. The orchestrator checks this on boot and logs a warning if `availableBalance < 0.5 0G`.

### 3.4 Calling the model — OpenAI SDK compatibility (inside `triage.ts`)

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

### 3.4a Provider discovery (resolved — on-chain registry exists)

There IS a canonical on-chain registry. The Compute Inference contract (`0xa79F4c8311FF93C06b8CfB403690cc987c93F91E` on Galileo) exposes `getAllServices(uint256 offset, uint256 limit)` which returns all registered providers with their models, endpoints, and pricing.

**Programmatic discovery (no wallet needed):**

```typescript
import { createReadOnlyInferenceBroker } from "@0glabs/0g-serving-broker";

// No signer required — read-only queries against the on-chain registry
const readBroker = await createReadOnlyInferenceBroker(process.env.ZG_RPC_URL!);

// List all services (paginated, default offset=0, limit=50)
const services = await readBroker.listService();

// Filter for inference providers serving Qwen3-32B
const qwenProviders = services.filter(
  s => s.serviceType === "chatbot" && s.model.includes("Qwen3-32B")
);
console.log(qwenProviders[0].provider);  // → address for ZG_COMPUTE_PROVIDER

// With health metrics (uptime %, avg response time):
const detailed = await readBroker.listServiceWithDetail();
```

**Alternative discovery methods:**
- CLI: `0g-compute-cli inference list-providers`
- Web marketplace: `https://compute-marketplace.0g.ai/inference`
- Direct on-chain: call `getAllServices(0, 50)` on the Inference contract via ethers/viem

**Workflow:** run `listServiceWithDetail()` once during Phase 0 to pick the healthiest Qwen3-32B provider. Hard-code the address in `.env` as `ZG_COMPUTE_PROVIDER`. Re-check if the provider goes offline during development.

### 3.5 Concurrency — the real constraint

> *"When creating a task for the same provider, you must wait for the previous task to be completed."*

Per-provider concurrency is **effectively 1**. Reckon's design implication: **provision 3 inference sub-accounts** (one per AXL node) so the swarm can issue 3 parallel inference calls. Spec already acknowledges this (FR-9). When provisioning:

1. Each AXL node's orchestrator initializes its own wallet on first boot.
2. Pre-fund each from a Phase 0 ops wallet (~3 × 5 0G).
3. Each node's brain blob carries its own `kh_` key + its own provider sub-account address.

### 3.6 Use cases — defensive parsing (in `triage.ts` primitive)

The docs do **not** mention structured output. Treat both LLM outputs as free text and parse defensively:

- **Suspicion triage (`triage.ts`):** prompt asks for "a number between 0 and 1 on the first line." Parse with a regex `/^\s*([01](?:\.\d+)?)/m`. On parse failure, default to `0.5` and skip the optimization (proceed to deterministic math via `ebbo.ts` anyway). Output JSON: `{score: 0.5, reason: "parse_failure"}`.
- **NL slash explanation:** purely cosmetic; on failure, fall back to a templated string. **Never block a slash on Compute availability.**

### 3.7 Failure modes (additions to NFR-3)

- **Provider offline:** `triage.ts` outputs `{score: 0.5, reason: "provider_offline"}` per SKILL.md fallback rules. Orchestrator proceeds to `ebbo.ts`. Slash explanation falls back to template. Neither blocks the slash.
- **Sub-account drained:** 0G Compute returns 402-equivalent. Mitigation: orchestrator monitors `broker.ledger.getLedger()` on boot; dashboard alerts at < 0.5 0G remaining.
- **Serial-task contention within a single sub-account:** if two challenges fire on the same agent in <inference latency> apart, second call queues. Acceptable — challenge submission isn't latency-critical inside a 30-min window.

---

## 4. End-to-end checklist by phase

### Phase 0 (Day 1, Builder B owns 0G):

- [ ] `.env` populated with all 0G params from §0
- [ ] Galileo wallet funded — `https://faucet.0g.ai` × 3 days (use Google Cloud faucet as backup)
- [ ] `npm install @0gfoundation/0g-ts-sdk @0glabs/0g-serving-broker` cleanly resolves
- [ ] Hello-world `ZgFile.fromFilePath → indexer.upload → indexer.download` round-trip on a 1KB test file
- [ ] Hello-world `createZGComputeNetworkBroker` + `getLedger` returns balance
- [ ] Confirm Qwen3-32B is responsive with a one-shot prompt
- [ ] Fork `0g-agent-nft` at a pinned SHA into `contracts/inft/`; deploy on Galileo with mock oracle; mint a test token
- [ ] Draft SKILL.md agent loop (Builder B, Phase 0 task in v0.10) — includes `triage.ts` and `coordinate.ts` 0G touchpoints

### Phase 1 (Builder B):

- [ ] Brain blob writer (AES-256-GCM + PBKDF2) — uploads to Storage Log via the 0G `indexer` client, returns root hash
- [ ] Agent orchestrator boot reads brain via `indexer.download(..., withProof=true)` and verifies root matches `tokenURI`. Injects decrypted values as env vars for primitives
- [ ] `triage.ts` primitive: suspicion-scoring prompt wired through broker headers + OpenAI SDK, outputs JSON `{score, reason}`
- [ ] `ebbo.ts` primitive: deterministic benchmark math, outputs JSON `{benchmark}`
- [ ] 3 provider sub-accounts provisioned (one per AXL node)
- [ ] `decide.ts` and `submit.ts` primitives scaffolded
- [ ] `coordinate.ts` primitive scaffolded (full AXL + KV integration in Phase 2)
- [ ] `orchestrator.ts` drives a fill through the SKILL.md loop to a "would-decide-to-challenge" decision

### Phase 2 (Builder B + Builder A coordination):

- [ ] `coordinate.ts` primitive complete: AXL GossipSub broadcast + 0G Storage KV `claim_state` writes
- [ ] KV `claim_state` stream live; protocol-wide `streamId` baked into a constant in `@reckon-protocol/types`
- [ ] AXL gossip + KV durable-truth interleave tested under simulated 2-agent claim race via `coordinate.ts`
- [ ] Builder A's relayer batches fills (50 / 60s) and calls Builder B's Storage uploader
- [ ] `FillBatchAnchored(rootHash, firstOrderHash, lastOrderHash)` fires on Base for each batch

### Phase 3 (Builder A on iNFT contract; Builder B on agent runtime):

- [ ] `ChallengerNFT` deployed on Galileo with mock oracle
- [ ] Two demo iNFTs minted (one per AXL agent identity)
- [ ] `Transfer` events on Galileo trigger `OwnerRegistry.attestOwner` on Base via the relayer (cross-network plumbing rehearsal)
- [ ] `updateBrain(tokenId, newRoot)` callable by owner; emits `MetadataUpdated`
- [ ] iNFT-aware orchestrator boot: reads iNFT → decrypts brain → injects env vars → primitives run with real brain data
- [ ] Adversarial test: iNFT transferred mid-challenge → 30% bounty queues until `OwnerRegistry` freshness recovers (per FR-6)
- [ ] Agent primitive failure tests: `triage.ts` 0G Compute timeout, `coordinate.ts` AXL partition — verify orchestrator handles each per SKILL.md fallback rules

### Phase 4:

- [ ] Galileo state preserved (no fork resets needed — Galileo is a real testnet, not Anvil)
- [ ] Demo video: 0:55-1:20 segment includes SKILL.md scroll showing the 5-step loop (10 seconds), then live bad fill demo with `triage.ts` → `ebbo.ts` → `coordinate.ts` → `decide.ts` → `submit.ts` visible in agent runs panel
- [ ] Demo video: 1:20-1:40 segment shows iNFT on `chainscan-galileo.0g.ai`, transfer to second wallet, relayer attests on Base, next bounty redirects

---

## 5. Spec deltas this guide locks in

These are not speculative — they're the lines this implementation guide commits to and the spec should reference back:

1. **Storage SDK package = `@0gfoundation/0g-ts-sdk`**, Compute SDK package = `@0glabs/0g-serving-broker`. Different scopes; both real. (Unchanged from v0.7.)
2. **Brain blob encryption = AES-256-GCM + PBKDF2-100k**, not ECIES. Matches ERC-7857 reference's sealing flow. Encryption key derived from owner's signed challenge string. (Unchanged from v0.7.)
3. **Brain blob decryption happens in the orchestrator at boot**, not inside individual primitives. Decrypted values are passed to primitives as environment variables. (New in v0.10.)
4. **0G Storage KV `streamId` = single protocol-wide constant** for `claim_state`. Key = `keccak256(orderHash)`, value = `abi.encode(tokenId, claimedAt, deadline)`. Flow contract on Galileo = `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296`. KV operations are encapsulated in the `coordinate.ts` primitive. (Updated in v0.10.)
5. **Provider sub-accounts = 3** (one per AXL node) to bypass the per-provider serial-task constraint. (Unchanged from v0.7.)
6. **Compute fallback model = Qwen2.5-0.5B-Instruct** at 0.5 0G/Mtok if Qwen3-32B is unhealthy or sub-account is low. (Unchanged from v0.7.)
7. **No royalty inheritance** — `RoyaltyDistributor.sol` on Base implements the 60/30/10 split; ERC-7857 is just the ownership canvas. (Unchanged from v0.7.)
8. **Mock oracle in v1**, documented; cap demo bounty value to ≤ 100 USDC since the mock signs anything. (Unchanged from v0.7.)
9. **Per-fill writes to Storage Log are forbidden** — batch only (50 records or 60s). (Unchanged from v0.7.)
10. **`withProof=true` on every `indexer.download`** that resolves a brain blob — verify Merkle root matches on-chain `tokenURI`. (Unchanged from v0.7.)
11. **Faucet drip is a Phase 0 dependency**, not a Phase 4 panic. Schedule it Day 1, 2, 3. Google Cloud faucet available as backup. (Updated in v0.10.)
12. **"Indexer" in this guide always means the 0G SDK client** (`Indexer` class from `@0gfoundation/0g-ts-sdk`). The Reckon off-chain service that subscribes to chain events is called the **relayer** (renamed in v0.10). (New in v0.10.)
13. **`triage.ts` is the sole 0G Compute consumer** among the 5 agent primitives. Its failure mode outputs `{score: 0.5, reason: "..."}` so the orchestrator always proceeds to `ebbo.ts`. (New in v0.10.)
14. **`coordinate.ts` is the sole 0G Storage KV consumer** among the 5 agent primitives. It implements acquire/check/release actions against the `claim_state` stream. (New in v0.10.)

---

## 6. Open items — status after research (2026-04-28)

### Resolved

- **`Batcher` constructor signature** — ✅ Fully resolved. The actual SDK signature is `Batcher(version: number, clients: StorageNode[], flow: FixedPriceFlow, provider: string)`. `clients` come from `indexer.selectNodes(1)`, `flow` from `getFlowContract(address, signer)`. Working example in §2.4 above.
- **Compute provider directory** — ✅ Fully resolved. An on-chain registry exists at the Compute Inference contract. `createReadOnlyInferenceBroker(rpcUrl)` (no wallet needed) exposes `listService()` and `listServiceWithDetail()`. See §3.4a above.
- **`PublishedSealedKey` event semantics** — ✅ Fully resolved. Exact signature: `event PublishedSealedKey(address indexed _to, uint256 indexed _tokenId, bytes[] _sealedKeys)`. Fires only on `iTransferFrom`, not on regular transfers. One sealed key per `IntelligentData` slot. See §1.1 above.

### Confirmed (workaround validated)

- **Storage encryption modes from the SDK side** — ✅ Our approach is correct. The CLI supports AES-256-CTR via `--encryption-key`, but the TypeScript SDK doesn't expose encryption hooks. Builder B's brain-blob writer encrypts **before** calling `indexer.upload` (raw bytes to 0G, encryption is our concern). This is the cleaner contract — fewer SDK assumptions, consistent with how the ERC-7857 reference handles sealed keys.
- **AgentMarket integration** — ✅ Fully documented. `AgentMarket` implements off-chain order/offer matching with on-chain settlement via EIP-712. The `offer.needProof` flag routes through `iTransferFrom` for sealed-key re-encryption. For bonus item #4 (iNFT marketplace stub): fork `AgentMarket.sol` alongside the `AgentNFT` fork. Override `fulfillOrder` to enforce `needProof = true` for all ChallengerNFTs (brain blobs must always be re-encrypted on transfer). Add event indexing in the relayer for `OrderFulfilled` + `PublishedSealedKey` in tandem.

### Remaining minor gaps

- **`indexer.selectNodes()` replica count for KV writes** — the docs don't specify how many replicas to request. We use `1` (minimum). If KV writes fail with durability errors, try `2` or `3`. Low risk — the starter kit uses `1`.
- **`KvClient` node URL** — `KvClient` needs a KV-specific node URL (not the storage indexer turbo URL). The testnet starter kit (`github.com/0gfoundation/0g-storage-ts-starter-kit`) should have the correct URL. If not, `indexer.selectNodes()` returns `StorageNode` instances whose URLs may work for both read and write paths.

If any of the above resolves differently in practice, update this guide in place — not a new file.

---

## 7. Changelog from v0.7 guide

### Terminology: "indexer" → "relayer"
- All references to the Reckon off-chain service now say "relayer" (28 renames in the spec)
- The 0G SDK's `Indexer` class retains its name — it's the SDK's API, not ours to rename
- Disambiguating note added as spec delta #12

### Agent architecture: monolithic OpenClaw → SKILL.md + 5 primitives + orchestrator
- Brain blob decryption now happens in the orchestrator, with values passed to primitives via env vars (spec delta #3)
- `triage.ts` is the sole 0G Compute consumer (spec delta #13)
- `coordinate.ts` is the sole 0G Storage KV consumer (spec delta #14)
- Phase checklist items updated to reference specific primitives
- Failure modes updated to reference SKILL.md fallback rules

### ENS: L2 subname registrar → virtual subnames via wildcard resolver + CCIP-Read
- Subnames are now virtual (exist only in MongoDB, served via CCIP-Read gateway)
- `ReckonValidator` now uses `SolverRegistry.isRegistered(namehash)` instead of ENS reverse-lookup
- `Challenger.submit()` now verifies via `ChallengerRegistry.isRegistered(namehash)` instead of ENS namehash check on registrar
- Contract count: 8 → 10 (8 Base + 1 0G Galileo + 1 Ethereum mainnet for `ReckonWildcardResolver`)

### 0G docs updates incorporated
- Google Cloud faucet added as alternative (`https://cloud.google.com/application/web3/faucet/0g/galileo`)
- Third-party RPC providers noted (QuickNode, ThirdWeb, Ankr, dRPC)
- Mainnet contract addresses added (Flow: `0x62D4...`, Compute Ledger: `0x2dE5...`)
- Compute Inference and FineTuning contract addresses added to network params
- AgentNFT roles documented (ADMIN_ROLE, OPERATOR_ROLE, MINTER_ROLE)
- ERC-7857 Cloneable and Authorize extensions documented (not used in v1)
- 24-hour refund lock on sub-account fund recovery noted
- Storage CLI AES-256-CTR encryption noted (we encrypt before upload, so this is informational)
- `broker.ledger.getLedger()` balance monitoring documented
- Verifier nonce-based replay protection with 7-day expiry noted
- Starter kit repo URL added for `Batcher` reference

### Phase and demo video timeline updates
- Phase 0 adds "draft SKILL.md" task
- Phase 1 references specific primitives instead of monolithic agent
- Phase 4 demo video segments updated to match v0.10 timeline (SKILL.md scroll at 0:55-1:20)
