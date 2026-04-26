# 0G Research Notes for Reckon v0.3

**Source:** https://docs.0g.ai/llms-full.txt (plus deep dives into the iNFT integration guide and Storage SDK pages)
**Date compiled:** 2026-04-26
**Purpose:** Validate the 0G assumptions baked into `reckon-spec-v0.3.md` and surface concrete spec edits.

The spec leans on 0G in three load-bearing places: (1) ERC-7857 iNFTs as the wrapper for challenger agents, (2) 0G Storage Log + KV for fill audit trail and swarm coordination, (3) 0G Compute (GLM-5-FP8) for off-chain EBBO benchmark math. Each of these has factual drift vs. what the docs actually say today.

---

## 1. Network identity — the spec is using a stale name

**What the spec says (multiple places, e.g. Phase 0 Day 1, Pre-build checklist):**
> "0G Newton testnet RPC", "Confirm 0G Newton testnet has GLM-5-FP8 endpoint live"

**What the docs say:**
- The **current testnet is Galileo**, not Newton. Formal name in docs: **"0G-Galileo-Testnet"**.
- Mainnet exists and is named **Aristotle** (the spec doesn't acknowledge mainnet at all under 0G).

| Network | Chain ID | EVM RPC | Explorer | Storage Indexer (Turbo) |
|---|---|---|---|---|
| Galileo (testnet) | **16602** | `https://evmrpc-testnet.0g.ai` | `https://chainscan-galileo.0g.ai` | `https://indexer-storage-testnet-turbo.0g.ai` |
| Aristotle (mainnet) | **16661** | `https://evmrpc.0g.ai` | `https://chainscan.0g.ai` | `https://indexer-storage-turbo.0g.ai` |

Faucet: `https://faucet.0g.ai` (0.1 0G / day cap — relevant for Phase 0 budgeting; we'll need to pre-fund).

**Spec changes required:**
- Replace every "Newton" reference with "Galileo".
- Add chain IDs and RPC URLs to the Phase 0 environment checklist.
- Note that 0G has a live mainnet (Aristotle) — relevant for the Phase 4 deploy decision (the spec currently sends contracts to Base mainnet; iNFTs probably belong on 0G mainnet to honor the bounty narrative — see §4 below).

---

## 2. ERC-7857 — reference impl exists, but the integration shape is different from what the spec assumes

**Reference implementation:** `https://github.com/0gfoundation/0g-agent-nft` — this resolves the spec's "HIGH severity" risk #1 (ERC-7857 tooling maturity). We do **not** need to write the standard from scratch.

**Architecture per the docs:**
- Standard extends ERC-721 with `iTransferFrom()` requiring `AccessProof` (signed by receiver) + `OwnershipProof` (signed by an oracle).
- Two oracle types supported: **TEE** and **ZKP**. For testing, the integration guide ships a **mock oracle** ("replace with real oracle in production").
- Encryption scheme is **AES-256-GCM** with **PBKDF2 key derivation (100k iterations)**. Encryption key is sealed against the *owner's public key*; the **oracle re-encrypts metadata for the new owner on transfer**.
- Extensions: `IERC7857Cloneable` (model duplication), `IERC7857Authorize` (usage grants, capped at **100 users per token**).
- Architecture uses "upgradeable beacon proxies + OpenZeppelin AccessControl" — has implications for our `ChallengerNFT` storage layout and admin roles.
- Built-in events: `MetadataUpdated`, `UsageAuthorized`.

**Helper classes provided in the integration guide:**
`MetadataManager`, `TransferManager`, `SecureMetadata`, `AgentMarketplace`, `AIaaSPlatform`, `AgentComposer`. These are example/reference code, not packaged SDKs — we'd copy and adapt.

**The big mismatch — royalty splits do NOT exist in ERC-7857.**

The spec (FR-6, FR-9) repeatedly says things like:
> "The 30% challenger share resolves through the ERC-7857 royalty-split logic"
> "Configurable royalty split (e.g., 25% to original creator, 5% to performance optimizer)"

**This isn't a thing.** The integration docs are explicit: *"Royalties would require custom implementation."* The base contract has zero royalty logic; the bounty earnings split is **our problem to build**, not something we're inheriting.

What we actually have to do:
- The "30% to current iNFT owner" split is just `ChallengerNFT.ownerOf(tokenId)` lookup at slash time — **simple, fine**.
- The "25% to creator, 5% to optimizer" tiered split needs its own storage (`mapping(uint256 => RoyaltyConfig)`) and its own distribution logic in `Challenger.sol`. This is maybe 80-150 LoC of contract work — not huge, but it's not free, and it has to be added to Builder A's Phase 3 budget.
- We should not call this "ERC-7857 royalty-split logic" in writing. The truthful framing is: "Reckon-native royalty splits, with iNFT ownership as the canonical owner identity."

**Other gotchas worth knowing:**
- "Proofs have limited validity" → expired oracle proofs cause reverts. If an iNFT is transferred and the new owner takes >X minutes to fetch a fresh proof, the transfer fails. Worth documenting in NFR-3 failure modes.
- Oracle dependency is real: if our oracle (mock or otherwise) is offline, transfers stop. Spec's NFR-3 only covers "0G Storage offline" — should also cover "iNFT oracle offline."
- The integration guide explicitly recommends compressing proofs and batching for gas — relevant for our NFR-1 gas budget claim of 280k for challenge submission, which currently doesn't account for any iNFT-side cost beyond a single `ownerOf` call. Realistic number is fine, just call it out.

**Spec changes required:**
- FR-6: rewrite "ERC-7857 royalty-split logic" → "Reckon-native royalty config keyed by iNFT tokenId; current owner resolved via `ChallengerNFT.ownerOf()` at slash time."
- FR-9: drop "Configurable royalty split (e.g., 25% to original creator, 5% to performance optimizer)" from the bullet list of what ERC-7857 gives you — move it to a "Reckon adds:" sub-bullet.
- Risk #1 (ERC-7857 tooling maturity): downgrade from HIGH to **LOW-MEDIUM**. Reference impl exists at `0gfoundation/0g-agent-nft`. The remaining unknown is the oracle (mock-vs-real) story for the demo; we ship with the mock and document.
- Add to NFR-3: "If iNFT oracle is offline, transfers pause but bounty payouts to current owner still resolve via on-chain `ownerOf` — earnings rights are not blocked, only ownership churn is."
- Phase 3 Day 15-17: add "implement Reckon royalty distribution contract (~100-150 LoC); cannot inherit from ERC-7857."

---

## 3. 0G Storage — the SDK package name is wrong, and "Log + KV" needs sharper semantics

**What the spec says:**
> "Use `@0glabs/0g-ts-sdk` (or equivalent)" (Phase 2 Day 12)

**What the docs say:**
The package is **`@0gfoundation/0g-ts-sdk`** (different scope). The Go client is `github.com/0gfoundation/0g-storage-client`.

This is a one-character fix in writing but a real footgun if Builder B copies the spec literally into `package.json`.

**Storage layers per docs:**
- **Log layer:** immutable, append-only, addressable by Merkle root.
- **KV layer:** mutable key-value built atop the log layer.
- File upload happens via `indexer.upload(file, evmrpcUrl, signer)`; download via `indexer.download(rootHash, outPath, withProof)`.
- KV API: `batcher.streamDataBuilder.set(streamId, keyBytes, valueBytes)` for puts; `kvClient.getValue(streamId, encodedKeyBytes)` for gets. KV operations require an explicit flow contract address in the `Batcher` constructor (file uploads do not — the indexer handles the flow contract internally).
- **Encryption (v1.2.6+):** AES-256 (32-byte symmetric key, 17-byte header) or ECIES (secp256k1, 50-byte header). CLI flag `--encryption-key <hex_key>`. Decryption via `indexer.downloadToBlob()`.
- **Authentication:** standard ethers `Wallet` / `BrowserProvider` signer.

**What the spec under-specifies:**
- FR-3 says "Append the same fill to **0G Storage Log** for off-chain agent indexing" but doesn't say *how* — log writes happen via file uploads to the indexer, returning a Merkle root. We'd batch fills into a periodic file, not write per-fill (per-fill writes are uneconomic and slow). Spec should say "batched every N seconds or M fills, root hashes emitted as events for discoverability."
- FR-9 says iNFT brain is on 0G Storage — fine — but doesn't specify *which encryption mode*. Per the integration guide it should be **AES-256-GCM** to match the ERC-7857 sealing flow, not ECIES. Worth pinning.
- The Phase 2 Day 13 KV plan ("agent swarm uses 0G Storage KV as the shared 'claim state' map") is feasible, but needs an explicit `streamId` design — one stream per agent? one stream protocol-wide? The docs require a streamId to be passed to every operation. Spec should pin this.

**Spec changes required:**
- Global find/replace: `@0glabs/0g-ts-sdk` → `@0gfoundation/0g-ts-sdk`. (Search the spec — appears in Phase 2 Day 12.)
- FR-3: add "Fill records are batched (N=50 fills or every 60s, whichever first) into a single Log file; the resulting Merkle root is emitted as `FillBatchAnchored(rootHash, firstOrderHash, lastOrderHash)`."
- FR-9: pin encryption to AES-256-GCM with PBKDF2 derivation (matches ERC-7857 reference).
- Phase 2 Day 13: pin "single protocol-wide streamId for `claim_state`; key = orderHash, value = `{agentTokenId, claimedAt, deadline}`."
- Phase 0 checklist: add "fund our Galileo wallet via `https://faucet.0g.ai` (0.1 0G/day cap — drip-fund Day 1, 2, 3 in advance)."

---

## 4. 0G Compute — GLM-5-FP8 doesn't exist; the model list is different

**What the spec says (Phase 0, Phase 1 Day 4-5, Risk #5):**
> "GLM-5-FP8 endpoint live"
> "Wire `@0glabs/0g-serving-broker` to call GLM-5-FP8 with a structured-output prompt"
> "GLM-5-FP8 has documented rate limits (~30 req/min per provider)"

**What the docs say:**
- The serving broker package is **`@0glabs/0g-serving-broker`** (this one the spec got right — note the different scope from `@0gfoundation/0g-ts-sdk` for storage; both scopes are active in the 0G ecosystem).
- **No GLM-5-FP8.** The predefined models are:
  - **Qwen2.5-0.5B-Instruct** (Causal LM, 0.5 0G per million tokens)
  - **Qwen3-32B** (Causal LM, 4 0G per million tokens)
  - Custom provider models supported, but nothing named GLM in the docs.
- Quirk: when invoking, drop the `Qwen/` prefix in the `--model` parameter.
- Inference is **OpenAI SDK compatible** — `OpenAI(api_key="app-sk-...", base_url="<service_url>/v1/proxy")`.
- Pricing model: training fee = `(tokenSize / 1M) × pricePerMillionTokens × trainEpochs`. Per-model storage reserve (e.g., 0.01 0G for Qwen2.5-0.5B, 0.09 0G for Qwen3-32B).
- Account model: Main Account → deposit funds → Sub-Accounts (provider-specific). Fine-tuning sub-accounts via `--service fine-tuning`.
- **Rate limits not formally documented**, but the docs note "you must wait for the previous task to be completed (status `Finished`)" before queuing another for the same provider. So per-provider concurrency is effectively 1, not "30 req/min" as the spec asserts.
- **Structured output is not mentioned** in the docs. Spec assumes we can hit the model with "a structured-output prompt: 'Given these 3 pool prices and TVLs, compute the TVL-weighted geometric mean.'" — we should treat structured output as not guaranteed and parse responses defensively, or drop the LLM-call-for-math angle entirely.

The spec already concedes "This is overkill — simple math doesn't need an LLM — but **0G Compute integration is a sponsor requirement**." Fine, but if we're going to do theater, we should pick a use case that *makes more sense* with an LLM. Options worth considering:

- **Use 0G Compute to summarize/explain the slash decision in human language for the dashboard.** Genuinely useful, genuinely non-trivial, and uses the LLM for something LLMs are actually good at.
- **Use 0G Compute for "is this fill suspicious enough to escalate?" classifier prompt** — a soft pre-filter before the deterministic on-chain math runs. Frames the model as a *triage* layer.

Either is more honest than "compute geometric mean via LLM."

**Spec changes required:**
- Replace every "GLM-5-FP8" reference with **"Qwen3-32B"** (the better-quality option) and provide a fallback-to-Qwen2.5-0.5B line for cost.
- Risk #5: rewrite. Real risk is per-provider serial-task concurrency (not rate limits), which means our challenger agent can only have one outstanding 0G Compute call per provider at a time. Mitigation: cache aggressively, or run multiple provider sub-accounts.
- Phase 1 Day 4-5: reconsider what we ask the LLM to do. Recommend swapping "compute geometric mean" → "summarize fill-vs-benchmark for dashboard" or "triage suspicion score." Adjust the README's honesty paragraph accordingly.
- Phase 4 Day 22-23: chain-decision needs revisiting (see §5 below).

---

## 5. Where do we actually deploy? — the spec's mainnet decision is now suspect

The spec sends contracts to **Base mainnet** (Phase 4 Day 22-23). With the iNFT layer being the centerpiece of the 0G Track B story, deploying `ChallengerNFT` on Base while talking it up as "0G iNFT" is a credibility hit a judge will catch.

Two cleaner options:

1. **Deploy `ChallengerNFT` on 0G Aristotle mainnet (chain 16661); deploy the rest on Base mainnet.** Cross-chain reads from `Challenger.sol` on Base to `ChallengerNFT.ownerOf()` on 0G via a relayer or attestation. More plumbing, but the iNFT lives where it should.
2. **Deploy everything on 0G Aristotle.** Drops UniswapX integration unless UniswapX is on 0G (it isn't, per current Uniswap deployment docs). So this option only works if we accept "we ship a UniswapX *fork* on 0G," which is a real Phase 4 day-of-shipping risk.

Realistic recommendation: **(1)** — `ChallengerNFT` on 0G Aristotle, everything else on Base. Add "0G Storage Log audit trail" to live on 0G mainnet (Aristotle indexer) too. Document this clearly so the cross-chain assumption is visible in the architecture diagram.

**Spec changes required:**
- Phase 4 Day 22-24: split deployment targets. `ChallengerNFT` + 0G Storage Log namespace on 0G Aristotle (mainnet). `ReckonValidator`, `FillRegistry`, `Challenger`, `EBBOOracle`, `SolverBondVault`, `ENSReputationWriter` on Base mainnet.
- Architecture diagram: add a "0G Aristotle" lane for the iNFT and Storage Log.
- New risk: "cross-chain `ownerOf` read for slash payout — needs a lightweight attestation or relayer." Mitigations: cache last-known owner with a freshness window, fall back to on-chain LayerZero / Wormhole read.

---

## 6. Smaller things worth noting (no spec rewrite, but be aware)

- **0G's iNFT helper class names** in the integration guide (`MetadataManager`, `TransferManager`, `AgentMarketplace`) suggest a useful TypeScript scaffold for Builder B's `inft-tools/` directory. Worth lifting these patterns rather than inventing our own.
- **`AIaaSPlatform` + `IERC7857Authorize`** — the "authorize usage without transferring ownership" extension (capped 100 users per token) is interesting future work: a challenger agent's iNFT owner could grant *delegated* usage to multiple operators while keeping the bounty earnings. Not for hackathon, but mention in "What's next" of the demo video.
- **Awesome 0G repo** (`https://github.com/0gfoundation/awesome-0g`) is the right place to hunt for any agent/iNFT examples that landed since the docs were written.
- The spec's Pre-build checklist item *"Read the ERC-7857 spec and any reference implementations"* should be updated to point at the actual repo: `0gfoundation/0g-agent-nft`.

---

## Summary — concrete spec edits, prioritized

1. **(Factual, must-fix)** Newton → Galileo throughout. Add chain IDs (16602 testnet, 16661 mainnet) and RPC URLs.
2. **(Factual, must-fix)** `@0glabs/0g-ts-sdk` → `@0gfoundation/0g-ts-sdk` (storage). `@0glabs/0g-serving-broker` stays as-is (compute).
3. **(Factual, must-fix)** GLM-5-FP8 → Qwen3-32B. Rewrite the rate-limit risk to reflect serial per-provider concurrency.
4. **(Mechanism, must-fix)** Stop claiming ERC-7857 gives us royalty splits. Move royalty distribution into a Reckon-owned contract; budget ~150 LoC + a Phase 3 day for Builder A.
5. **(Risk, downgrade)** ERC-7857 tooling risk drops from HIGH to LOW-MEDIUM (`0gfoundation/0g-agent-nft` exists). The remaining risk is the **oracle** (mock-vs-real); ship with mock for the demo and document.
6. **(Architecture)** Decide where `ChallengerNFT` lives. Recommended: 0G Aristotle (mainnet); cross-chain owner read from Base. Update architecture diagram and Phase 4 deploy plan.
7. **(Honesty pass)** Reconsider what 0G Compute is being asked to do. "Compute geometric mean via LLM" is theater; "summarize the slash decision" or "suspicion triage" are defensible.
8. **(Pinning)** Pin iNFT brain encryption to AES-256-GCM (matches reference). Pin 0G Storage KV streamId design. Pin Storage Log batching policy.
9. **(NFR-3)** Add iNFT-oracle-offline failure mode and proof-expiry behavior.
10. **(Pre-build checklist)** Replace the generic ERC-7857 line with a pointer to `github.com/0gfoundation/0g-agent-nft`. Add "drip-fund Galileo wallet from faucet across Days 1-3."
