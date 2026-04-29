# 0G Implementation Steps — Reckon v0.10

**Goal:** Implement every 0G touchpoint with a testable gate after each step. No step advances until its test passes.

**Existing code inventory** (already built):
- `packages/contracts/src/inft/ChallengerNFT.sol` (34 LoC) — ERC-7857 fork with `updateBrain()`
- `packages/contracts/src/inft/MockVerifier.sol` — mock oracle for demo
- `packages/contracts/script/DeployZGGalileo.s.sol` — deploy script for ChallengerNFT on Galileo
- `packages/contracts/test/ChallengerNFT.t.sol` — Foundry tests
- `inft-tools/src/encrypt.ts` (128 LoC) — AES-256-GCM + PBKDF2 brain blob sealing
- `inft-tools/src/encrypt.test.ts` — unit tests for encrypt/decrypt round-trip
- `inft-tools/src/upload.ts` (92 LoC) — 0G Storage upload/download wrappers
- `indexer/src/storage-batcher.ts` (174 LoC) — batch fill records to 0G Storage Log
- `indexer/src/owner-attester.ts` (168 LoC) — listens to ChallengerNFT Transfer events on Galileo
- `agent/src/triage.ts` (208 LoC) — 0G Compute suspicion triage via broker
- `agent/src/ebbo.ts` (200 LoC) — off-chain EBBO benchmark math
- `agent/src/boot.ts` (~110 LoC) — iNFT brain blob read + decrypt at agent boot (reads tokenURI from Galileo on-chain)
- `agent/src/provision.ts` (125 LoC) — 0G Compute broker provisioning
- `agent/src/listener.ts` (158 LoC) — FillRecorded event listener
- `agent/src/coordinate.ts` (~250 LoC) — AXL gossip (stubbed) + 0G Storage KV claim dedup (acquire/check/release)
- `agent/src/decide.ts` (~70 LoC) — cost-benefit analysis primitive
- `agent/src/submit.ts` (~45 LoC) — KeeperHub webhook submission primitive
- `agent/src/index.ts` (~260 LoC) — SKILL.md orchestrator: triage → ebbo → coordinate → decide → submit
- `agent/src/challenge.ts` — re-exports from decide.ts + submit.ts (backwards compat)

**What's NOT yet built** (from spec gap analysis):
- Actual Galileo deployment (script exists, not yet run)
- End-to-end iNFT mint → brain blob → agent boot → challenge flow

**Cross-guide dependency:** `coordinate.ts` straddles both the 0G and Gensyn implementation guides. Steps 6-7 below cover the 0G KV side. The AXL GossipSub side (mesh setup, claim broadcast, `/send`/`recv` HTTP calls) is covered in the [Gensyn implementation plan](./gensyn-implementation-plan.md). Both must be complete before Step 14 (orchestrator dry run) can exercise the full `coordinate.ts` flow.

---

## Step 1: Environment + Wallet Funding

**What:** Populate `.env` with all 0G parameters, fund wallets, verify RPC connectivity.

**Actions:**
1. Create/verify `.env` with all params from the implementation guide §0:
   - `ZG_RPC_URL`, `ZG_INDEXER_URL`, `ZG_FLOW_CONTRACT`, `ZG_COMPUTE_LEDGER`, `ZG_CHAIN_ID`
   - `ZG_RELAYER_PRIVATE_KEY`, `ZG_AGENT_PRIVATE_KEY`
2. Fund both wallets via `https://faucet.0g.ai` (or Google Cloud faucet fallback)
3. Discover Qwen3-32B provider and set `ZG_COMPUTE_PROVIDER`

**Test — `scripts/0g-step1-env-check.ts`:**
```
1. Connect to ZG_RPC_URL via ethers.JsonRpcProvider
2. Assert chainId === 16602
3. Assert both wallet balances > 0
4. Assert Indexer(ZG_INDEXER_URL) responds (try selectNodes(1))
5. Assert createReadOnlyInferenceBroker → listService() returns at least 1 service with model containing "Qwen3-32B"
```
**Pass criteria:** All 5 assertions pass. Print "Step 1 OK: Galileo env verified, wallets funded, provider discovered."

---

## Step 2: 0G Storage Log — File Upload/Download Round-Trip

**What:** Verify raw file upload and download works on Galileo Storage using the SDK.

**Actions:**
1. Verify `inft-tools/src/upload.ts` uses the correct `Indexer` + `ZgFile` pattern from the guide §2.2
2. Write a test script that uploads a small JSON test file and downloads it back

**Test — `scripts/0g-step2-storage-roundtrip.ts`:**
```
1. Create a temp file with content: {"test": "reckon-0g-storage", "timestamp": Date.now()}
2. ZgFile.fromFilePath(tempPath)
3. file.merkleTree() → capture rootHash
4. indexer.upload(file, ZG_RPC_URL, signer) → assert no error
5. file.close()
6. indexer.download(rootHash, outputPath, true) → assert no error
7. Read outputPath, JSON.parse, assert test === "reckon-0g-storage"
8. Assert rootHash is a 66-char hex string (0x + 64 hex chars)
```
**Pass criteria:** Upload succeeds, download succeeds, content matches, Merkle root is valid. Print rootHash.

---

## Step 3: Brain Blob Encrypt → Upload → Download → Decrypt Round-Trip

**What:** Full brain blob lifecycle — generate, seal, upload to 0G Storage, download, unseal, verify.

**Actions:**
1. Verify `inft-tools/src/encrypt.ts` implements AES-256-GCM + PBKDF2-100k per guide §2.3
2. Verify `inft-tools/src/upload.ts` chains encrypt → upload and download → decrypt

**Test — `scripts/0g-step3-brain-roundtrip.ts`:**
```
1. Generate a test BrainBlob: {axl_ed25519_secret: randomHex(32), ebbo_threshold_prefs: {minSlash: "10", maxBondPct: 5}, kh_api_key: "kh_test_key", model_config: {model: "Qwen3-32B", maxTokens: 1024}, performance_history: []}
2. Owner signs a challenge string (deterministic test key)
3. sealBrainBlob(blob, ownerSignature) → {ciphertext, nonce, tag, wrappedKey}
4. Write sealed blob to temp file
5. Upload to 0G Storage via indexer.upload → capture rootHash
6. Download from 0G Storage via indexer.download(rootHash, outPath, true)
7. unsealBrainBlob(downloadedFile, ownerSignature) → decryptedBlob
8. Assert decryptedBlob.axl_ed25519_secret === original
9. Assert decryptedBlob.kh_api_key === "kh_test_key"
10. Assert decryptedBlob.model_config.model === "Qwen3-32B"
```
**Pass criteria:** Full round-trip seal → upload → download → unseal preserves all fields. Print rootHash (this would become the tokenURI).

---

## Step 4: 0G Compute — Broker Provisioning + Inference Call

**What:** Fund the Compute broker, make a real Qwen3-32B inference call, settle payment.

**Actions:**
1. Verify `agent/src/provision.ts` matches the guide §3.3 broker provisioning pattern
2. Verify `agent/src/triage.ts` matches the guide §3.4 OpenAI SDK pattern with defensive parsing

**Test — `scripts/0g-step4-compute-inference.ts`:**
```
1. createZGComputeNetworkBroker(wallet) → broker
2. broker.ledger.getLedger() → assert totalBalance > 0 (fund if needed via depositFund)
3. broker.inference.getServiceMetadata(ZG_COMPUTE_PROVIDER) → meta
4. Assert meta.endpoint is a valid URL
5. broker.inference.getRequestHeaders(ZG_COMPUTE_PROVIDER, "test prompt") → headers
6. Assert headers is a non-empty object
7. Call OpenAI SDK: chat.completions.create({model: "Qwen3-32B", messages: [{role: "user", content: "Reply with exactly the number 42"}]})
8. Assert completion.choices[0].message.content contains "42"
9. broker.inference.processResponse(ZG_COMPUTE_PROVIDER, completion) → no error
10. broker.ledger.getLedger() → assert balance decreased (payment settled)
```
**Pass criteria:** Inference call returns a coherent response, payment settles without error. Print response + balance delta.

---

## Step 5: Suspicion Triage Primitive — Full `triage.ts` E2E

**What:** Run the actual suspicion triage against a mock fill via 0G Compute.

**Actions:**
1. Use `agent/src/triage.ts` `runSuspicionTriage()` function with a synthetic FillRecord

**Test — `scripts/0g-step5-triage-e2e.ts`:**
```
1. Create a mock FillRecord with slightly suspicious parameters (output 2% below benchmark)
2. runSuspicionTriage(mockFill, ZG_COMPUTE_PROVIDER, broker) → result
3. Assert result.score is a number between 0 and 1
4. Assert result.model is "Qwen3-32B" or "Qwen2.5-0.5B-Instruct"
5. Assert result.rawResponse is a non-empty string
6. Test fallback: pass an invalid provider address → assert score === 0.5 and no exception thrown
```
**Pass criteria:** Triage returns a valid score, fallback works gracefully. Print score + model used.

---

## Step 6: 0G Storage KV — Write + Read Round-Trip

**What:** Set up the KV layer for `claim_state` coordination. Write a claim, read it back.

**Actions:**
1. Create `agent/src/kv.ts` (or extend `coordinate.ts`) with the corrected Batcher pattern from guide §2.4:
   - `indexer.selectNodes(1)` → StorageNode[]
   - `getFlowContract(ZG_FLOW_CONTRACT, signer)` → FixedPriceFlow
   - `new Batcher(1, nodes, flowContract, ZG_RPC_URL)`
2. Define `CLAIM_STATE_STREAM_ID` as a constant in `@reckon-protocol/types`

**Test — `scripts/0g-step6-kv-roundtrip.ts`:**
```
1. Create Indexer, call selectNodes(1) → assert nodes.length >= 1
2. Create flowContract via getFlowContract(ZG_FLOW_CONTRACT, signer)
3. Create Batcher(1, nodes, flowContract, ZG_RPC_URL)
4. Generate test key: keccak256("test-order-hash-001")
5. Generate test value: abi.encode(uint256(1), uint64(Date.now()/1000), uint64(Date.now()/1000 + 1800))
6. batcher.streamDataBuilder.set(STREAM_ID, keyBytes, valueBytes)
7. batcher.exec() → assert result.txHash is defined, no error
8. Create KvClient, call getValue(STREAM_ID, keyBytes) → assert returned value matches
9. Decode returned value → assert agentTokenId === 1, deadline is ~30 min from claimedAt
```
**Pass criteria:** KV write succeeds with txHash, read returns matching value. Print txHash + decoded claim.

---

## Step 7: `coordinate.ts` Primitive — Acquire/Check/Release (0G KV Side)

**What:** Implement `agent/src/coordinate.ts` — the primitive that bridges 0G Storage KV (durable claims) and AXL GossipSub (fast broadcast). This step validates the 0G KV side; AXL integration is tested separately per the [Gensyn implementation plan](./gensyn-implementation-plan.md).

**Actions:**
1. Build `agent/src/coordinate.ts` implementing three actions:
   - `action=check`: read KV via `kvClient.getValue()` to see if orderHash is already claimed
   - `action=acquire`: (AXL broadcast stubbed until mesh is live) → write claim to KV via `Batcher.exec()`
   - `action=release`: write empty/expired value to KV
2. Output JSON: `{claimAcquired: bool, claimedBy: string}`
3. Structure the code so AXL calls are isolated behind an interface that can be swapped from a no-op stub to the real `POST localhost:9002/send` + `GET localhost:9002/recv` calls once the AXL mesh is live (Gensyn Steps)

**Test — `scripts/0g-step7-coordinate.ts`:**
```
1. Run coordinate with action=check, orderHash="0xabc...123" → assert claimAcquired: false, claimedBy: ""
2. Run coordinate with action=acquire, orderHash="0xabc...123", agentTokenId=1 → assert claimAcquired: true
3. Run coordinate with action=check, orderHash="0xabc...123" → assert claimedBy matches agentTokenId 1
4. From a DIFFERENT agent key: run coordinate with action=acquire, same orderHash → assert claimAcquired: false (already claimed)
5. From original key: run coordinate with action=release → no error
6. Run coordinate with action=check → assert claimedBy: "" (released)
```
**Pass criteria:** Full acquire/check/release cycle works via 0G KV. Duplicate acquire is rejected. AXL broadcast is stubbed (no-op). Print all intermediate states.

**Follow-up (after Gensyn mesh is live):** Replace AXL stub with real `POST /send` + `GET /recv` calls. Re-run tests with AXL enabled — verify that the 30s backoff window + AXL gossip + KV write sequence works end-to-end. This is tested in the [Gensyn implementation plan](./gensyn-implementation-plan.md) two-agent race test.

---

## Step 8: ChallengerNFT Deploy on 0G Galileo

**What:** Deploy the ChallengerNFT contract to Galileo testnet using the existing deploy script.

**Actions:**
1. Run `forge script DeployZGGalileo --rpc-url $ZG_RPC_URL --broadcast --private-key $ZG_RELAYER_PRIVATE_KEY`
2. Record deployed addresses (MockVerifier, ChallengerNFT impl, ChallengerNFT proxy)
3. Verify on `chainscan-galileo.0g.ai`

**Test — `scripts/0g-step8-deploy-verify.ts`:**
```
1. Connect to ChallengerNFT proxy address via ethers
2. Call name() → assert "Reckon Challenger"
3. Call symbol() → assert "RECK"
4. Call verifier() → assert matches MockVerifier address
5. Verify on explorer: https://chainscan-galileo.0g.ai/address/<proxy>
```
**Pass criteria:** Contract responds to all view calls correctly. Explorer shows verified contract.

---

## Step 9: Mint First iNFT — Brain Blob + On-Chain Token

**What:** Mint the first ChallengerNFT with an encrypted brain blob on 0G Storage as its URI.

**Actions:**
1. Generate brain blob for Agent 1 (real Ed25519 keypair, real `kh_` key stub, real model config)
2. Seal and upload to 0G Storage (reuse Step 3 logic)
3. Mint ChallengerNFT with rootHash as tokenURI
4. Record tokenId

**Test — `scripts/0g-step9-mint-inft.ts`:**
```
1. Generate BrainBlob for agent 1
2. Seal → upload → capture rootHash
3. Call ChallengerNFT.mint(ownerAddress, rootHash, sealedKey) from MINTER_ROLE account
4. Assert Transfer event emitted with tokenId
5. Call tokenURI(tokenId) → assert matches rootHash
6. Call ownerOf(tokenId) → assert matches ownerAddress
7. Download brain from rootHash, decrypt, verify fields match
```
**Pass criteria:** Token exists on-chain, tokenURI points to the brain blob, brain blob is downloadable and decryptable.

---

## Step 10: Agent Boot — iNFT Read + Brain Decrypt + Env Injection

**What:** The orchestrator reads an iNFT from Galileo, decrypts its brain, and makes the data available.

**Actions:**
1. Verify `agent/src/boot.ts` implements the guide §2.3 decryption flow
2. Wire it to read from the real ChallengerNFT deployed in Step 8

**Test — `scripts/0g-step10-agent-boot.ts`:**
```
1. Set AGENT_TOKEN_ID=<tokenId from Step 9>
2. Call boot(tokenId, ownerPrivateKey) →
   a. Reads ChallengerNFT.tokenURI(tokenId) from Galileo
   b. Downloads brain blob from 0G Storage
   c. Verifies Merkle root matches tokenURI
   d. Decrypts brain blob
3. Assert decrypted brain has valid axl_ed25519_secret (64 hex chars)
4. Assert decrypted brain has kh_api_key starting with "kh_"
5. Assert decrypted brain has model_config.model === "Qwen3-32B"
6. Verify env vars are set for primitive consumption:
   - AGENT_AXL_SECRET, AGENT_KH_KEY, AGENT_EBBO_PREFS, etc.
```
**Pass criteria:** Full boot sequence completes — on-chain read → 0G download → decrypt → env vars populated.

---

## Step 11: Storage Batcher — Fill Batch Upload + Merkle Root Anchoring

**What:** Test the fill batching service that uploads batches to 0G Storage Log.

**Actions:**
1. Verify `indexer/src/storage-batcher.ts` implements the guide §2.2 upload pattern
2. Feed it synthetic fill records and trigger a batch flush

**Test — `scripts/0g-step11-batch-upload.ts`:**
```
1. Create StorageBatcher with real Galileo credentials
2. Feed 5 synthetic FillRecords (below batch threshold of 50)
3. Force flush (trigger the 60s timer manually or add a flush() method)
4. Assert flushBatch returns a rootHash (66-char hex string)
5. Download the batch from 0G Storage: indexer.download(rootHash, outPath, true)
6. Parse as JSON Lines → assert 5 records, each with orderHash and fillBlock
7. Assert records are ordered by fillBlock (deterministic ordering)
8. Record rootHash → this would be emitted as FillBatchAnchored on Base
```
**Pass criteria:** Batch uploads successfully, download verifiable, records preserved in order.

---

## Step 12: `updateBrain` — Owner Rotates Brain Blob

**What:** Test that a token owner can update their agent's brain blob URI on-chain.

**Actions:**
1. Generate a new brain blob (simulating performance_history update after a slash)
2. Seal, upload to 0G Storage
3. Call ChallengerNFT.updateBrain(tokenId, newRootHash)

**Test — `scripts/0g-step12-update-brain.ts`:**
```
1. Read current tokenURI(tokenId) → capture oldURI
2. Generate new BrainBlob with performance_history: [{orderHash: "0x...", slashedAmount: "10.5", timestamp: Date.now()}]
3. Seal → upload → capture newRootHash
4. Assert newRootHash !== oldURI
5. Call updateBrain(tokenId, newRootHash) from owner account
6. Assert BrainUpdated event emitted with (tokenId, oldURI, newRootHash)
7. Read tokenURI(tokenId) → assert matches newRootHash
8. Download new brain from 0G Storage, decrypt, assert performance_history has 1 entry
```
**Pass criteria:** Brain URI rotated on-chain, new brain downloadable and valid.

---

## Step 13: Owner Attestation Cross-Chain — Transfer on Galileo → Attest on Base

**What:** Test the relayer's owner attestation flow: Transfer event on 0G Galileo triggers OwnerRegistry update on Base.

**Actions:**
1. Verify `indexer/src/owner-attester.ts` subscribes to ChallengerNFT Transfer events on Galileo
2. Transfer the iNFT to a second wallet on Galileo
3. Verify the relayer detects the Transfer and calls OwnerRegistry.attestOwner on Base (Anvil fork)

**Test — `scripts/0g-step13-cross-chain-attest.ts`:**
```
1. Read OwnerRegistry.ownerOf(tokenId) on Base → assert matches original owner
2. Transfer ChallengerNFT on Galileo: safeTransferFrom(owner, newOwner, tokenId)
3. Assert Transfer event emitted on Galileo with (owner, newOwner, tokenId)
4. Wait for relayer to process (poll or subscribe)
5. Read OwnerRegistry.ownerOf(tokenId) on Base → assert matches newOwner
6. Read freshness timestamp → assert within last 60 seconds
7. Verify MongoDB owner_attestations collection has new entry
```
**Pass criteria:** Transfer on Galileo propagates to Base OwnerRegistry within expected latency.

---

## Step 14: Orchestrator — Full SKILL.md Loop (Dry Run)

**What:** Run the full 5-step agent loop against a synthetic fill, using real 0G Compute, 0G Storage KV, and AXL GossipSub.

**Prerequisite:** AXL mesh must be live (Gensyn implementation plan complete through mesh setup). If AXL is not yet available, `coordinate.ts` runs in KV-only mode (AXL stub).

**Actions:**
1. Build `agent/src/orchestrator.ts` (or verify `agent/src/index.ts` already implements the loop)
2. Wire all 5 primitives: triage → ebbo → coordinate → decide → submit (submit stubbed to not actually call KeeperHub)
3. Write `SKILL.md` describing the loop
4. Ensure `coordinate.ts` uses real AXL broadcast if mesh is live, or KV-only fallback if not

**Test — `scripts/0g-step14-orchestrator-dry-run.ts`:**
```
1. Create a synthetic FillRecorded event (fill that IS slashable: output 3% below benchmark)
2. Orchestrator receives the event and runs:
   a. triage.ts → score (via 0G Compute) → assert 0 < score <= 1
   b. ebbo.ts → benchmark (via real Uniswap pool reads on Anvil fork) → assert benchmark > 0
   c. coordinate.ts action=check → assert not claimed
   d. coordinate.ts action=acquire → assert claimed by this agent (via 0G Storage KV)
   e. decide.ts → {shouldChallenge: true, reason: "..."} → assert shouldChallenge === true
   f. submit.ts → STUB (log "would submit challenge") → assert success in dry-run mode
3. Verify agent_runs collection in MongoDB has entries for all 5 steps
4. Verify each step's input/output JSON is logged
```
**Pass criteria:** All 5 primitives execute in order, 0G Compute scores the fill, 0G KV records the claim, decision is "challenge." Full audit trail in MongoDB.

---

## Step 15: Orchestrator — Failure Mode Cascade

**What:** Verify SKILL.md fallback rules work when 0G services are degraded.

**Test — `scripts/0g-step15-failure-modes.ts`:**
```
Test A: 0G Compute offline
1. Set ZG_COMPUTE_PROVIDER to an invalid address
2. Run orchestrator with a slashable fill
3. Assert triage.ts returns {score: 0.5, reason: "provider_offline"}
4. Assert orchestrator continues to ebbo.ts (does NOT abort)
5. Assert the rest of the pipeline completes

Test B: 0G Storage KV unavailable
1. Set ZG_FLOW_CONTRACT to an invalid address
2. Run orchestrator with a slashable fill
3. Assert coordinate.ts returns {claimAcquired: false, ...} with error logged
4. Assert orchestrator logs the failure to agent_errors collection
5. Assert it exits gracefully on this event

Test C: Brain blob download failure
1. Set tokenURI to a non-existent rootHash
2. Run agent boot
3. Assert boot fails with a clear error message (not a crash)
4. Assert agent does NOT start processing events with empty brain data
```
**Pass criteria:** Each failure mode is handled per SKILL.md. No crashes, no silent data corruption.

---

## Step 16: Mint Second iNFT + Multi-Agent Claim Race

**What:** Mint a second iNFT, run two agents, verify that `coordinate.ts` (AXL gossip + 0G KV) prevents double-challenge.

**Prerequisite:** AXL mesh live with at least 2 nodes (hub + 1 spoke). If AXL not yet available, this test validates KV-only dedup (still correct, just slower).

**Actions:**
1. Mint second ChallengerNFT with a separate brain blob (different Ed25519 keypair, different AXL identity)
2. Run two orchestrator instances on separate AXL nodes, both listening for the same FillRecorded event

**Test — `scripts/0g-step16-claim-race.ts`:**
```
1. Mint iNFT #2 with brain for Agent 2 (includes its own AXL Ed25519 key)
2. Start orchestrator for Agent 1 (tokenId=1, AXL node on port 9002)
3. Start orchestrator for Agent 2 (tokenId=2, AXL node on port 9012)
4. Emit a single FillRecorded event (slashable fill)
5. Both agents run triage → ebbo → coordinate(action=check)
6. Both agents call coordinate(action=acquire) — AXL gossip broadcasts claims to each other
7. During the 30s backoff window, the agent with the later claimedAt timestamp yields (AXL fast path)
8. The winning agent writes its claim to 0G KV via Batcher.exec()
9. Assert exactly ONE agent proceeds to decide → submit
10. Assert the other agent logs "claim_yielded" (via AXL gossip) or "kv_collision_yielded" (via KV check)
11. Verify 0G KV has exactly one claim entry for this orderHash
```
**Pass criteria:** Exactly one agent claims the fill, the other yields. Dedup happens via AXL gossip (fast, sub-second) with 0G KV as durable confirmation. No double-challenge.

---

## Step 17: End-to-End Integration — From Fill to Slash (Dry Run)

**What:** The grand integration test. A bad fill on Anvil-forked Base triggers the full 0G-powered pipeline.

**Test — `scripts/0g-step17-e2e.ts`:**
```
Setup:
- Anvil fork of Base mainnet running with all Reckon contracts deployed
- ChallengerNFT on Galileo with 2 minted iNFTs
- OwnerRegistry on Base attested for both token owners
- 0G Compute broker funded, provider discovered
- 0G Storage KV claim_state stream initialized

Execution:
1. Solver submits a bad fill on Anvil fork (output 2.5% below EBBO)
2. Relayer detects Fill event → calls recordFill on Base → writes to MongoDB
3. Relayer batches the fill → uploads to 0G Storage Log → captures rootHash
4. Agent 1 detects FillRecorded event
5. Agent 1 runs SKILL.md loop:
   a. triage.ts (0G Compute) → score > 0.5
   b. ebbo.ts → benchmark confirms fill is slashable
   c. coordinate.ts (0G Storage KV) → claim acquired
   d. decide.ts → shouldChallenge: true
   e. submit.ts → (dry-run: log the challenge params that would be submitted)
6. Agent 2 runs same loop → coordinate.ts → sees Agent 1's claim → yields

Assertions:
- 0G Storage Log batch contains the fill (download + verify)
- 0G Compute was called exactly once (by Agent 1's triage)
- 0G Storage KV has exactly one claim for this orderHash
- MongoDB agent_runs has complete audit trail for both agents
- Agent 1's decision: challenge. Agent 2's decision: yield.
```
**Pass criteria:** Full pipeline from fill to challenge decision, touching all 4 0G surfaces (Storage Log, Storage KV, Compute, ChallengerNFT ownership). All audit trails present.

---

## Summary — Dependency Graph

```
Step 1: Env + Wallets
  ↓
Step 2: Storage Log upload/download        Step 4: Compute broker + inference
  ↓                                          ↓
Step 3: Brain blob encrypt/upload/decrypt  Step 5: Triage primitive e2e
  ↓                                          ↓
  └──────────────┬───────────────────────────┘
                 ↓
Step 6: Storage KV write/read
  ↓
Step 7: coordinate.ts (0G KV side, AXL stubbed)
  ↓                                          ┌──────────────────────────────┐
Step 8: ChallengerNFT deploy on Galileo     │ Gensyn Implementation Plan   │
  ↓                                          │ (parallel track):            │
Step 9: Mint first iNFT                     │  - AXL build from source     │
  ↓                                          │  - Ed25519 identity setup    │
Step 10: Agent boot (iNFT read + decrypt)   │  - 3-node mesh (hub+spokes)  │
  ↓                                          │  - GossipSub port to TS      │
Step 11: Storage batcher (fill batch upload) │  - coordinate.ts AXL side    │
  ↓                                          └──────────┬───────────────────┘
Step 12: updateBrain (brain rotation)                   │
  ↓                                                     │
Step 13: Cross-chain owner attestation                  │
  ↓                                                     │
  └─────────────────────┬───────────────────────────────┘
                        ↓
Step 14: Orchestrator dry run (full loop — requires BOTH 0G KV + AXL)
  ↓
Step 15: Failure mode cascade
  ↓
Step 16: Multi-agent claim race (AXL gossip + 0G KV dedup)
  ↓
Step 17: End-to-end integration
```

Steps 2-3 and 4-5 can run in parallel (Storage vs Compute are independent). Steps 7-13 (0G track) and the Gensyn implementation plan run in parallel — they converge at Step 14 where the orchestrator needs both 0G KV and AXL GossipSub for the full `coordinate.ts` flow. If AXL is not ready by Step 14, the orchestrator runs `coordinate.ts` in KV-only mode (correct but slower).
