# CCIP-Read Gateway — Step-by-Step Implementation Plan

**Audience:** Builder A
**Aligns with:** `specs/reckon-spec-v0.10.md` (FR-14), `specs/research/partner-implementation-guide/ens-implementation-guide-v0.7.md` (§4)
**Location:** `ccip-gateway/` (already a workspace in root `package.json`)
**Estimated effort:** ~12 hours (Day 12-13 per spec timeline)

---

## Context

The `ReckonWildcardResolver` contract (`packages/contracts/src/ens/ReckonWildcardResolver.sol`) is already built and tested. It implements ENSIP-10 + EIP-3668: for any query against `*.reckon.eth`, it reverts with `OffchainLookup`, directing ENS clients to a gateway URL. The gateway must:

1. Receive the redirected request from the ENS client
2. Decode the ABI-encoded ENS call (e.g., `text(node, key)` or `addr(node)`)
3. Look up the queried subname in MongoDB's `subnames` collection
4. ABI-encode the result, sign it with an EIP-712 key matching the resolver's `signer`
5. Return the signed response so the client can call `resolveWithProof` on the resolver

The resolver verifies the signature and returns the result to the ENS client — transparently to apps using viem, ethers, or wagmi.

---

## Key Contract Details (from `ReckonWildcardResolver.sol`)

| Detail | Value |
|---|---|
| **EIP-712 domain name** | `"ReckonWildcardResolver"` |
| **EIP-712 domain version** | `"1"` |
| **MESSAGE_TYPEHASH** | `keccak256("Message(bytes32 sender,uint64 expires,bytes32 requestHash,bytes32 resultHash)")` |
| **Gateway URL pattern** | `https://gateway.reckon.fi/{sender}/{data}.json` |
| **OffchainLookup `callData`** | The original `data` arg (ABI-encoded ENS call like `text(node, key)`) |
| **OffchainLookup `extraData`** | `abi.encode(data)` — round-trips back to the callback |
| **`resolveWithProof` response** | `abi.encode(result, expires, sig)` where `sig` is over `_hashTypedDataV4(structHash)` |

### EIP-712 Struct Fields (in order)

1. `bytes32 sender` — resolver address padded: `bytes32(uint256(uint160(address(this))))`
2. `uint64 expires` — expiration timestamp (must be > `block.timestamp`)
3. `bytes32 requestHash` — `keccak256(extraData)`
4. `bytes32 resultHash` — `keccak256(result)`

---

## MongoDB Collections Used

- **`subnames`** — source of truth for virtual ENS subnames
  - Fields: `label`, `namespace` (`"solvers"` | `"challengers"`), `owner` (address), `namehash`, `registeredAt`, `textRecords` (map of key→value including `reckon.reputation`, `reckon.totalFills`, etc.)
  - Indexed by: `{ namehash }` for gateway lookups, `{ label, namespace }` for uniqueness
- **`reputation_updates`** — enrichment source for latest reputation data
  - Fields: `solverNamehash`, `reputationScore` (string, 1e18 precision), `totalFills`, `slashCount`, `lastSlashTimestamp`, `updatedAt`

## Shared Constants (from `packages/types/src/constants.ts`)

- `MONGO_DB_NAME = "reckon"`, `MONGO_COLLECTIONS.reputationUpdates = "reputation_updates"`
- `ENS_PARENT_NAME = "reckon.eth"`, `SOLVERS_PARENT = "solvers.reckon.eth"`, `CHALLENGERS_PARENT = "challengers.reckon.eth"`
- `REP_TEXT_KEY = "reckon.reputation"`, `REP_TOTAL_FILLS_KEY`, `REP_SLASH_COUNT_KEY`, `REP_LAST_SLASH_KEY`

---

## Step-by-Step Implementation

### Step 1: Project scaffold + health endpoint

**What:** Initialize `ccip-gateway/` with package.json, TypeScript config, Express server, and a `/health` endpoint. Separate the app factory (`createApp()`) from the listen call for testability.

**Files to create:**
- `ccip-gateway/package.json` — deps: `express`, `viem`, `mongodb`, `dotenv`; devDeps: `typescript`, `vitest`, `@types/express`, `tsx`
- `ccip-gateway/tsconfig.json`
- `ccip-gateway/.env.example` — documents `PORT`, `MONGODB_URI_RO`, `SIGNER_PRIVATE_KEY`, `RESOLVER_ADDRESS`, `CHAIN_ID`
- `ccip-gateway/src/server.ts` — `createApp()` factory returning configured Express app
- `ccip-gateway/src/index.ts` — imports `createApp()`, calls `app.listen()`

**Test:** `ccip-gateway/test/health.test.ts`
```
- createApp() → supertest GET /health → assert 200 + { status: "ok" }
```
**Run:** `cd ccip-gateway && npx vitest run --reporter=verbose`

**Commit:** `feat(ccip-gateway): scaffold with health endpoint`

---

### Step 2: ABI calldata decoder

**What:** Implement a utility to decode the ABI-encoded calldata that arrives in the `{data}` URL parameter. The gateway receives the inner ENS call (e.g., `text(bytes32 node, string key)`) and needs to extract the function selector, namehash, and any additional args.

**Supported selectors:**
| Function | Selector | Decode |
|---|---|---|
| `text(bytes32 node, string key)` | `0x59d1d43c` | → `{ node, key }` |
| `addr(bytes32 node)` | `0x3b3b57de` | → `{ node }` |
| `addr(bytes32 node, uint256 coinType)` | `0xf1cb7e06` | → `{ node, coinType }` |

Also implement `computeNamehash(label: string, namespace: "solvers" | "challengers")` using viem's `namehash()` for pre-computing lookup keys.

**Files to create:**
- `ccip-gateway/src/utils/ens.ts` — `decodeCcipRequest(callData: Hex)` + `computeNamehash()`

**Test:** `ccip-gateway/test/utils/ens.test.ts`
```
- Encode text(namehash("bunni.solvers.reckon.eth"), "reckon.reputation") via viem → decode → assert node + key
- Encode addr(namehash("bunni.solvers.reckon.eth")) → decode → assert node
- Encode addr(namehash(...), 60) → decode → assert node + coinType
- Unknown selector → returns { selector, node: undefined }
```
**Run:** `cd ccip-gateway && npx vitest run`

**Commit:** `feat(ccip-gateway): ABI calldata decoder for text/addr selectors`

---

### Step 3: EIP-712 signer module

**What:** Implement the signing function that produces signatures matching what `resolveWithProof` expects. **This is the most critical piece** — the typehash, domain, and field ordering must be byte-identical to the Solidity contract.

**Files to create:**
- `ccip-gateway/src/signer.ts`

**Function signature:**
```typescript
signResponse(params: {
  result: Hex,          // ABI-encoded result bytes
  expires: bigint,      // Unix timestamp
  extraData: Hex,       // abi.encode(data) — what the resolver puts in OffchainLookup
  resolverAddress: Address,
  chainId: number,
  signerKey: Hex        // private key
}): Promise<Hex>        // 65-byte ECDSA signature
```

**Implementation approach:** Use viem's `signTypedData` with:
- Domain: `{ name: "ReckonWildcardResolver", version: "1", chainId, verifyingContract: resolverAddress }`
- Types: `{ Message: [{ name: "sender", type: "bytes32" }, { name: "expires", type: "uint64" }, { name: "requestHash", type: "bytes32" }, { name: "resultHash", type: "bytes32" }] }`
- Values: `{ sender: pad(resolverAddress), expires, requestHash: keccak256(extraData), resultHash: keccak256(result) }`

**Test:** `ccip-gateway/test/signer.test.ts`
```
- Known key → sign → recoverTypedDataAddress → assert matches signer address
- Cross-validate against ReckonWildcardResolver.t.sol test vectors:
  result = abi.encode("0.84"), known extraData → produce signature → verify digest matches
- Different extraData → different signature (no collision)
```
**Run:** `cd ccip-gateway && npx vitest run`

**Commit:** `feat(ccip-gateway): EIP-712 signer matching ReckonWildcardResolver`

---

### Step 4: MongoDB lookup layer

**What:** Implement the data access layer that queries MongoDB for subname records given a namehash. Use a clean interface so unit tests can swap in a mock.

**Files to create:**
- `ccip-gateway/src/db.ts`

**Interface:**
```typescript
interface SubnameRecord {
  label: string;
  namespace: "solvers" | "challengers";
  owner: `0x${string}`;
  textRecords: Record<string, string>;  // e.g. { "reckon.reputation": "500000000000000000" }
}

interface GatewayDb {
  lookupByNamehash(node: Hex): Promise<SubnameRecord | null>;
  close(): Promise<void>;
}
```

- `createDb(uri: string): Promise<GatewayDb>` — connects to MongoDB Atlas, queries `subnames` collection by `namehash` field
- Falls back to `reputation_updates` collection for text record enrichment if the subname doc's text records are stale

**Test:** `ccip-gateway/test/db.test.ts`
```
- MockDb: lookup existing namehash → returns record with textRecords
- MockDb: lookup unknown namehash → returns null
- Interface contract: both mock and real implement same shape
```
**Run:** `cd ccip-gateway && npx vitest run`

**Commit:** `feat(ccip-gateway): MongoDB lookup layer with mockable interface`

---

### Step 5: CCIP-Read route handler (`GET /:sender/:data.json`)

**What:** Wire steps 2-4 into the Express route. This is the core gateway logic — the ~80 LoC that makes ENS resolution work.

**Request flow:**
1. Parse `sender` (address) and `data` (hex) from URL params
2. Decode `data` → `{ selector, node, key? }` (Step 2)
3. Look up `node` in MongoDB → `SubnameRecord | null` (Step 4)
4. Build `result` based on selector:
   - `text(node, key)` → ABI-encode the text record value as `abi.encode(string)`. Empty string if not found.
   - `addr(node)` → ABI-encode the owner address as `abi.encode(address)`. Zero address if not found.
   - `addr(node, coinType)` → coinType 60 returns owner; others return zero address.
5. Construct `extraData = abi.encode(data)` (mirrors resolver's `OffchainLookup`)
6. Set `expires = Math.floor(Date.now() / 1000) + 300` (5 min TTL)
7. Sign with `signResponse()` (Step 3)
8. Return JSON: `{ data: abi.encode(result, expires, sig) }`

**Files to create/modify:**
- `ccip-gateway/src/routes/ccip.ts` — the route handler factory (takes `GatewayDb` + signer config)
- `ccip-gateway/src/server.ts` — mount the route

**Test:** `ccip-gateway/test/ccip.test.ts`
```
- Mock DB with known subname (alice, reputation "500000000000000000")
- GET /{resolver}/{encodedTextCall}.json → 200, decode response.data → (result, expires, sig)
  → result decodes to "500000000000000000"
- Unknown subname → 200 with empty string result (ENS zero-value convention, NOT 404)
- addr() call → 200, result decodes to alice's address
- addr(node, 60) → same as addr(node)
- addr(node, 8453) → zero address (we only serve coinType 60)
```
**Run:** `cd ccip-gateway && npx vitest run`

**Commit:** `feat(ccip-gateway): CCIP-Read route handler with text + addr resolution`

---

### Step 6: End-to-end signature cross-validation (gateway ↔ contract)

**What:** Prove that a response produced by the TypeScript gateway would pass `resolveWithProof` on the Solidity contract. This closes the critical loop.

**Test:** `ccip-gateway/test/e2e-sig.test.ts`
```
- Generate a deterministic signer key pair
- Produce a full gateway response for:
    text(namehash("bunni.solvers.reckon.eth"), "reckon.reputation") → result "0.84"
- Replicate the contract's EIP-712 digest computation in TypeScript:
    structHash = keccak256(encode(TYPEHASH, sender, expires, keccak256(extraData), keccak256(result)))
    digest = keccak256("\x19\x01" + domainSeparator + structHash)
- Recover signer from signature → assert matches signer address
- Verify the response bytes would ABI-decode correctly as (bytes result, uint64 expires, bytes sig)
```
**Also run:** `cd packages/contracts && forge test --match-test test_resolve_then_callback_roundtrip` to confirm the contract-side tests still pass (contract is source of truth).

**Run:** `cd ccip-gateway && npx vitest run && cd ../packages/contracts && forge test --match-test test_resolve_then_callback_roundtrip`

**Commit:** `test(ccip-gateway): e2e signature cross-validation against resolver contract`

---

### Step 7: Error handling + edge cases

**What:** Harden the gateway against malformed input, unknown selectors, and infrastructure failures.

**Cases:**
| Input | Response |
|---|---|
| Invalid hex in `{data}` | 400 Bad Request |
| Malformed ABI data (truncated, wrong types) | 400 Bad Request |
| Unknown function selector | 200 with empty result (zero-value convention) |
| DB connection lost | 503 Service Unavailable |
| `{sender}` doesn't match configured `RESOLVER_ADDRESS` | 400 Bad Request (defense in depth) |

**Files to create/modify:**
- `ccip-gateway/src/routes/ccip.ts` — wrap handler in try/catch
- `ccip-gateway/src/middleware/errors.ts` — Express error middleware

**Test:** `ccip-gateway/test/errors.test.ts`
```
- Invalid hex → 400
- Truncated calldata → 400
- Unknown selector (0xdeadbeef) → 200 with empty result
- Wrong sender address → 400
```
**Run:** `cd ccip-gateway && npx vitest run`

**Commit:** `feat(ccip-gateway): error handling for malformed requests and DB failures`

---

### Step 8: Docker + deployment config

**What:** Add Dockerfile and make targets for deploying the gateway. Per spec NFR-3, the gateway must be easy to redeploy (`make redeploy-gateway`).

**Files to create:**
- `ccip-gateway/Dockerfile` — multi-stage Node.js 20 build (install → build → runtime)
- `ccip-gateway/.env.example` — finalize all required env vars
- Root `Makefile` additions (or `ccip-gateway/Makefile`):
  - `gateway-dev` — runs with `tsx` in watch mode
  - `gateway-build` — `tsc` compile
  - `redeploy-gateway` — docker build + push + restart (per NFR-3)

**Test:**
```
docker build -t reckon-gateway ./ccip-gateway    # builds successfully
docker run --rm -p 3000:3000 -e PORT=3000 reckon-gateway &
curl http://localhost:3000/health                  # returns { status: "ok" }
```

**Commit:** `feat(ccip-gateway): Dockerfile and deployment targets`

---

### Step 9: Full integration test with seeded MongoDB

**What:** End-to-end test with real (or local) MongoDB: seed test subnames, start the gateway, make CCIP-Read requests, verify responses are correctly signed and contain expected data.

**Files to create:**
- `ccip-gateway/test/integration.test.ts`
- `ccip-gateway/test/fixtures/seed.ts` — seeds `subnames` collection with test data matching the Anvil bootstrap (alice, bob as solvers; eve as challenger)

**Seed data (mirrors `BootstrapAnvilFork.s.sol`):**
```
alice.solvers.reckon.eth  → owner: 0x...A11CE, reputation: "500000000000000000"
bob.solvers.reckon.eth    → owner: 0x...B0B,   reputation: "0" (unset)
eve.challengers.reckon.eth → owner: 0x...E4E
```

**Test:** `ccip-gateway/test/integration.test.ts` (requires `MONGODB_URI_RW` or local MongoDB)
```
- Seed MongoDB with test subnames
- Start gateway via createApp()
- Query text(namehash("alice.solvers.reckon.eth"), "reckon.reputation")
  → response result = "500000000000000000" ✓
- Query addr(namehash("alice.solvers.reckon.eth"))
  → response result = alice's address ✓
- Query text(namehash("nonexistent.solvers.reckon.eth"), "reckon.reputation")
  → response result = "" (empty, not error) ✓
- Query text(namehash("eve.challengers.reckon.eth"), "reckon.reputation")
  → works for challengers too ✓
- All response signatures verify against signer address ✓
```
**Run:** `MONGODB_URI_RO=... cd ccip-gateway && npx vitest run test/integration.test.ts`

**Commit:** `test(ccip-gateway): full integration test with seeded MongoDB`

---

## Final Verification Checklist

After all 9 steps:

1. **Unit tests green:** `cd ccip-gateway && npx vitest run` — all pass
2. **Contract tests unchanged:** `cd packages/contracts && forge test --match-contract ReckonWildcardResolver` — all pass
3. **Manual smoke test:** start gateway → `curl GET /{sender}/{data}.json` → decode hex response → verify it's valid signed data
4. **Cross-validate with Foundry:** take the gateway's response hex, pass as `response` arg to `resolveWithProof` in a Foundry test → should return the correct result
5. **Docker builds:** `docker build -t reckon-gateway ./ccip-gateway` succeeds

## Critical Reference Files

| File | Role |
|---|---|
| `packages/contracts/src/ens/ReckonWildcardResolver.sol` | Source of truth for EIP-712 domain, typehash, verification logic |
| `packages/contracts/test/ReckonWildcardResolver.t.sol` | Test vectors for cross-validation (signing helper, roundtrip test) |
| `packages/types/src/constants.ts` | Shared constants (MongoDB collection names, ENS names, text record keys) |
| `packages/types/src/fill.ts` | `ReputationUpdate` interface for MongoDB documents |
| `ccip-gateway/` | All new gateway code |
