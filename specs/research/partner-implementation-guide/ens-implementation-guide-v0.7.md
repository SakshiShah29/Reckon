# ENS Implementation Guide for Reckon v0.7

**Source:** `https://docs.ens.domains/llms-full.txt` (the ENS-published LLM index). Cross-references where the index is sparse: ENSIP-10 (Wildcard Resolution), EIP-3668 (CCIP-Read), ENSIP-5 (Text Records), ENSIP-9/11 (Multichain / Avatar), and the docs page `/registry/reverse#supported-chains`.
**Date compiled:** 2026-04-27
**Scope:** Concrete implementation guide for every place Reckon v0.7 touches ENS. ENS is **Reckon's primary identity layer** and one of two prize-tracked sponsors ($5,000 across both ENS prize tracks).

Reckon's ENS surface (per spec FR-1, FR-5, FR-7, NFR-2, plus Phase 0/1/3/4):

1. **`reckon.eth` parent name** registered on **ENS mainnet** (one-time, ~$30).
2. **Two L2 subname registrars** on Base mainnet:
   - `solvers.reckon.eth` — issues `<name>.solvers.reckon.eth` to registered solvers.
   - `challengers.reckon.eth` — issues `<name>.challengers.reckon.eth` to registered challenger operators.
3. **`ENSReputationWriter`** on Base mainnet — writes text records (`reckon.reputation`, `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`) to solver subnames.
4. **CCIP-Read gateway** — off-chain ENSIP-10 resolver served from our infrastructure, queries MongoDB Atlas with read-only credentials, signs responses per EIP-3668.
5. **`resolve.reckon.fi`** — standalone demo tool that takes any solver address, reverse-resolves to ENS name, displays live reputation via CCIP-Read (Phase 4 Day 26 flourish).
6. **Reverse-lookup at the validator** — `ReckonValidator.validate()` resolves `filler` (an EOA) to its ENS namehash on the `solvers.reckon.eth` registrar; reverts if no subname (FR-3, view-only).

Out of scope: `.eth` 2LD wrapping (we don't wrap `reckon.eth`), avatar records (cosmetic only), DNSSEC names, Universal Resolver direct integration, ENSv2/Namechain (announced March 2024 roadmap, not shipped).

---

## 0. The honest framing about the docs

The ENS LLM index is **deliberately high-level.** Most of the practical implementation details Reckon needs (full CCIP-Read pseudocode, ReverseRegistrar addresses per chain, Durin/Namestone L2 subname tooling, exact PublicResolver interface) are linked-out, not inline. This guide:

- Pins what the index *does* state verbatim.
- Names the gaps explicitly so Builder A doesn't waste a day expecting them to be in the LLM index.
- Routes around each gap by linking to the concrete external reference Builder A should consult during Phase 0 / Phase 1 / Phase 3.

If something is "TBD via Phase 0 verification" below, it means the docs index doesn't pin it and Builder A must confirm during Phase 0 from primary sources (Reverse Registrar deployments page, Durin docs, Namestone docs, Coinbase `cb.id` reference gateway implementation).

---

## 1. The parent name — `reckon.eth` on ENS mainnet (Phase 0 Day 1, Builder A)

### 1.1 Registration

Standard `.eth` registration through `app.ens.domains`. Spec already pins:

- **One-time cost:** ~$30 (1-year registration; renew before expiry).
- **Fallback ordering:** `reckonprotocol.eth` → `getreckon.eth` → name change.
- **Verification:** Phase 0 Day 1, before committing to the brand.

### 1.2 Wrapping decision — do not wrap

NameWrapper docs (verbatim from the index):

> "When wrapping a .eth 2LD, you're effectively transferring the ERC-721 NFT ownership to the Name Wrapper contract, which will take over the Manager role for the name as well."

For Reckon, **do not wrap `reckon.eth`.** Reasoning:

- Wrapping is required if we want fuses (e.g. `CANNOT_TRANSFER`) on `reckon.eth` itself. We don't need any.
- Subnames issued through our **own L2 registrar contract** on Base do not require the parent to be wrapped — the L2 registrar handles its own state independently of NameWrapper.
- Wrapping adds an extra approval step at registration time and an extra gas cost. No upside for Reckon.

Keep `reckon.eth` as an unwrapped `.eth` 2LD. Set its resolver to either the canonical PublicResolver (for any text records on the parent itself) or skip and only configure the subname-level resolution.

### 1.3 Resolver configuration on `reckon.eth`

Two intermediate names need resolution behavior:

- **`solvers.reckon.eth`** — set the resolver for this label to our L2 registrar contract (which itself implements ENSIP-10 wildcard for `*.solvers.reckon.eth`). One transaction at the parent registry.
- **`challengers.reckon.eth`** — same pattern.

The mainnet `reckon.eth` is the **anchor** the Universal Resolver will hit when a client queries `bunni.solvers.reckon.eth`. Resolution flow per docs (verbatim):

> "The resolution process always starts on mainnet. There needs to be one source of truth after all. However, the name resolution process can branch off to other chains, offchain gateways and much more."

So a client querying `bunni.solvers.reckon.eth`:

1. Hits the ENS Registry on mainnet.
2. Walks up the name to find the deepest configured resolver (likely the resolver on `solvers.reckon.eth`, which we set in §1.3).
3. That resolver implements ENSIP-10 `resolve(name, data)` and either returns directly or reverts with `OffchainLookup` (CCIP-Read) for the L2/MongoDB-backed records.

---

## 2. L2 subname registrar (Phase 1 Day 4-5, Builder A)

### 2.1 The product choice — Durin or Namestone (TBD Phase 0)

Spec already pins this: **Durin or Namestone, decision in Phase 0.** The ENS docs index does **not mention either by name** — both are independently maintained tooling, not first-party ENS Labs products. Builder A's Phase 0 verification:

- Read Durin docs directly (likely `durin.dev` or similar).
- Read Namestone docs directly (`namestone.com`).
- Decision criteria:
  - Does it support **Base mainnet** as a target? (Reckon's target.)
  - Does the deploy require a custom resolver registration on the parent (yes — see §1.3) or does the tool handle it?
  - Is the issuance flow on-chain (gas cost per subname) or hybrid (signature-based, gasless)?
  - Is text-record write supported, or read-only? Reckon needs **writes** for `reckon.reputation` etc. (FR-7).
  - Cost / open-source status / license.

**Fallback if both fail evaluation:** deploy our own minimal subname registrar (~6 hours per spec Risk #5). The contract pattern is well-documented:

```solidity
// Minimal pattern, derived from ENSIP-10 wildcard resolution:
contract ReckonL2SubnameRegistrar {
    bytes32 constant SOLVERS_NODE = /* namehash("solvers.reckon.eth") */ 0x...;
    mapping(bytes32 labelHash => address owner) public subnameOwner;
    mapping(bytes32 labelHash => mapping(string key => string value)) internal _texts;

    function register(string calldata label, address owner) external { /* gated */ }
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        // ENSIP-10 wildcard: parse name → label → look up record requested in `data`
    }
    function setText(bytes32 node, string calldata key, string calldata value) external { /* only owner */ }
    function text(bytes32 node, string calldata key) external view returns (string memory);
}
```

### 2.2 Storage shape

`SolverBondVault` (FR-1) keys storage by ENS namehash, not by address. Pin the namehash construction in `@reckon-protocol/types/ens.ts`:

```typescript
import { namehash } from 'viem/ens';

const solversParent = namehash('solvers.reckon.eth');           // bytes32
const subnameNode   = namehash(`${label}.solvers.reckon.eth`);  // bytes32 per solver
```

The L2 registrar issues `subnameNode → ownerAddress`. The vault keys deposits as `mapping(bytes32 namehash => uint256 bond)`.

### 2.3 The reverse-lookup the validator needs (FR-3)

`ReckonValidator.validate(filler, ...)` is `view` and must, in one storage read or two, **decide whether `filler` has a subname under `solvers.reckon.eth`.** The `ENS Registry → Resolver → setAddr/addr` flow goes name → address. Reckon needs the inverse: **address → subname.**

ENS reverse resolution (`addr.reverse`) is a separate system from a parent's child registry. The standard `addr.reverse` pattern (verbatim from the docs index):

> "A node in the Registry that can be claimed for any Ethereum account. The name this node represents is `[addr].addr.reverse`, where `[addr]` is the Ethereum public address (lowercase, without the "0x")."

```typescript
const reverseNode = namehash(`${address.slice(2).toLowerCase()}.addr.reverse`);
```

But `addr.reverse` returns the address's primary name **globally** — it doesn't constrain the answer to `*.solvers.reckon.eth`. A solver could have `bunni.eth` as their primary name and still hold `bunni.solvers.reckon.eth`; the reverse lookup would return the wrong scope.

**Reckon's pattern instead:** maintain a **second mapping inside the L2 registrar** keyed by address:

```solidity
mapping(address solverAddr => bytes32 subnameNode) public subnameByAddress;

function ownedSubnameOf(address who) external view returns (bytes32);
```

Set this when `register()` issues a subname. `ReckonValidator.validate()` calls `ownedSubnameOf(filler)` — one storage read, reverts on `bytes32(0)`. Fits the ≤ 30k gas budget (NFR-1).

This sidesteps the global `addr.reverse` ambiguity entirely. Spec already implies this pattern (FR-3 says "reverse-lookup on the `solvers.reckon.eth` registrar," which is exactly this — a registrar-local reverse map, not the global ENS reverse-resolution flow).

### 2.4 What we do NOT need

- **`ReverseRegistrar.setName()`** at the contract level. The docs index documents this for contracts that want to set their own primary name globally:
  > "call `setName()` on a Reverse Registrar directly from your contract's constructor"
- Reckon's contracts don't need their own primary names. We could optionally set `reckon.eth` as the primary for `ReckonValidator` (cosmetic), but it adds nothing functionally.

---

## 3. Text records — the reputation surface (FR-7)

### 3.1 Standard interface

PublicResolver text-record interface (verbatim from the docs index, the parts shown):

```solidity
function setText(bytes32 node, string calldata key, string calldata value) external;
function text(bytes32 node, string calldata key) external view returns (string memory);
```

Keys are arbitrary strings; ENSIP-5 defines conventions like `avatar`, `url`, `description`, `com.twitter`, `com.github`. Reckon defines its own namespaced keys:

| Key | Source | Update cadence |
|---|---|---|
| `reckon.reputation` | aggregate score in [0.0, 1.0] | Daily flush |
| `reckon.totalFills` | uint counter | Daily flush |
| `reckon.slashCount` | uint counter | Per-slash + daily flush |
| `reckon.lastSlash` | unix seconds | Per-slash |

All values stored as decimal strings (the ENS `text()` interface returns `string`). Numeric clients parse on read.

### 3.2 Writes — `ENSReputationWriter` (Builder A, Phase 2 Day 12)

Reckon's L2 registrar is also the resolver for subnames it issues (per §2.1). `setText()` is gated to `msg.sender == ENSReputationWriter` (or to the subname owner, for self-set fields like avatar — out of scope for v1).

Schedule-triggered flush per FR-7 — daily KeeperHub schedule workflow batches reputation deltas from MongoDB and calls:

```solidity
ENSReputationWriter.flushReputation(
    bytes32[] calldata subnameNodes,
    uint16[] calldata reputationBps,    // out of 10000
    uint64[] calldata totalFills,
    uint64[] calldata slashCounts
);
```

Internally calls `setText()` four times per affected subname through the registrar. Gas budget per NFR-1: amortized < 60k gas per agent per update — confirmed reasonable for batched writes.

### 3.3 Reads — CCIP-Read for live values (§4)

The schedule is daily. For real-time reputation reads (dashboard, `resolve.reckon.fi`), we serve **live values from MongoDB via CCIP-Read** (FR-7). On-chain text records are the durable but lagging truth; CCIP-Read serves the live truth without burning gas every minute.

This is the architectural choice that makes ENS work for Reckon at all — without CCIP-Read we'd either accept 24h-stale reputation or eat thousands of `setText()` transactions per day.

---

## 4. CCIP-Read (ENSIP-10 + EIP-3668) gateway (Builder A, Phase 3 Day 19)

### 4.1 What the docs index pins

ENSIP-10 (Wildcard Resolution) — the resolver implements:

```solidity
function resolve(bytes calldata name, bytes calldata data) external view returns (bytes);
```

EIP-3668 (CCIP-Read) — when the resolver wants to delegate to an off-chain gateway, it reverts with `OffchainLookup`:

> "The resolver reverts with: sender (the resolver contract address), urls (Array of gateway URLs to query), callData (Encoded request to send to gateway), callbackFunction (Selector for callback verification function), extraData (Additional data for callback validation)."

> "The gateway returns signed data that the resolver verifies via the callback function. The resolver reconstructs the call and verifies the signature matches the extraData before returning results."

The docs index does **not** provide full Solidity for the revert, the callback signature, the gateway HTTP shape, or the signing scheme. Builder A's Phase 0 / Phase 3 verification: read the **Coinbase `cb.id` gateway** as the canonical reference (spec already pins this in Risk #6).

### 4.2 The shape Reckon will implement

The standard EIP-3668 revert and callback (synthesizing what the index pins):

```solidity
error OffchainLookup(
    address sender,
    string[] urls,
    bytes callData,
    bytes4 callbackFunction,
    bytes extraData
);

contract ReckonL2SubnameRegistrar {
    address constant SIGNER = /* gateway's signing key */;

    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory) {
        revert OffchainLookup(
            address(this),
            ["https://gateway.reckon.fi/{sender}/{data}.json"],
            data,
            this.resolveCallback.selector,
            abi.encode(name, data)
        );
    }

    function resolveCallback(bytes calldata response, bytes calldata extraData) external view returns (bytes memory) {
        (bytes memory result, uint64 expires, bytes memory sig) = abi.decode(response, (bytes, uint64, bytes));
        // Verify SIGNER signed (sender, expires, hash(extraData), hash(result)) via EIP-712 or compact 65-byte sig
        // Revert on signature mismatch or expiry
        return result;
    }
}
```

The exact EIP-712 domain, signing-message preimage, and sig encoding are **not in the docs index** — copy from `cb.id` reference implementation. This is Risk #6 in the spec (CCIP-Read complexity, MEDIUM/MEDIUM); the mitigation is "reference Coinbase `cb.id` gateway."

### 4.3 The gateway server (Builder A, Phase 3 Day 19)

Off-chain HTTP server. Endpoint shape per the EIP-3668 URL pattern: `GET /{sender}/{data}.json`. Behavior:

1. Decode `data` as the original ENS resolver call (e.g. `text(node, key)`).
2. Look up the corresponding live value in MongoDB Atlas (`reputation_updates` collection, read-only consumer credentials).
3. ABI-encode the answer.
4. Sign `(sender, expires, hash(extraData), hash(result))` with the gateway's signing key (an EOA whose address is hardcoded in the registrar as `SIGNER`).
5. Return `{ data: <hex-encoded (result, expires, sig)>, status: 200 }`.

Trust model: the gateway's signing key is trusted to faithfully read MongoDB and not lie. **This is acceptable for the hackathon** — the same MongoDB is being read by the dashboard with read-only credentials, so the gateway is just a CCIP-Read-shaped wrapper around a read we'd be doing anyway. Document in NFR-3.

### 4.4 What's served

CCIP-Read responses serve `text(subnameNode, "reckon.reputation")` etc. with **live values from MongoDB**, while on-chain `text()` calls return **the daily-flush snapshot from `ENSReputationWriter`**. The honest framing in the README: "CCIP-Read gives you the live number; on-chain text records give you the durable number — both are reachable through the same ENS resolver."

---

## 5. Multichain — coinType for Base (FR-7 dashboard reads)

Per docs index (verbatim):

```typescript
import { toCoinType } from 'viem';
import { useEnsAddress } from 'wagmi';
import { base, mainnet } from 'wagmi/chains';

const { data: baseAddress } = useEnsAddress({
  name: 'test.ses.eth',
  chainId: mainnet.id,
  coinType: toCoinType(base.id),   // Always specify the coinType (chain)
});
```

Or with ethers:

```typescript
const resolver = await mainnetProvider.getResolver('test.ses.eth');
const baseAddress = await resolver?.getAddress(8453);   // Base chain ID
```

Reckon's dashboard uses this pattern when displaying "solver `bunni.solvers.reckon.eth` lives at `0xabc...` on Base." For our case, however, **the address is the same across chains** — solvers register with their EOA which is chain-agnostic. So we don't strictly need multichain `addr` records. We do need them if we ever extend to multi-chain solver bonds (Phase 5+).

For v0.7: **set the address record only for Ethereum mainnet (default coinType 60)** at registration time. Leave Base coinType unset; clients fall back to mainnet correctly.

---

## 6. The reverse-resolution demo flourish (`resolve.reckon.fi`, Phase 4 Day 26)

Spec commits to a tiny standalone web tool. Concrete flow:

1. User pastes any address (e.g. a known UniswapX solver).
2. Tool calls `ownedSubnameOf(address)` on the L2 registrar (Base mainnet).
3. If a subname exists, tool resolves the subname's text records via ENS standard resolution — which routes through CCIP-Read, returns live MongoDB-backed reputation.
4. Display: "`bunni.solvers.reckon.eth` — reputation 0.84 — 12 fills — 0 slashes."

Implementation: ~150 LoC Next.js page using viem. Shipped as a single-page app at `resolve.reckon.fi`, deployed on Vercel. ~2-3 hours per spec Phase 4 Day 26.

The judging value: a third-party app **outside Reckon** that resolves a Reckon-issued subname through standard ENS resolution proves the subname is real ENS, not a fake. This is the ENS Creative prize ($1,250) story.

---

## 7. ENSIP-15 normalization — pin in pre-build checklist

Names must be normalized per ENSIP-15 (UTS-46) before namehashing. Use viem's normalizer:

```typescript
import { normalize, namehash } from 'viem/ens';
const node = namehash(normalize('Bunni.Solvers.Reckon.eth'));   // → namehash('bunni.solvers.reckon.eth')
```

Reckon's L2 registrar should **reject non-normalized labels** at registration time (cheap on-chain validation: lowercase ASCII + hyphen check). Frontend always normalizes before contract calls.

---

## 8. End-to-end checklist by phase

### Phase 0 Day 1 (Builder A):

- [ ] Confirm `reckon.eth` available on ENS mainnet at `app.ens.domains`. Fallback ordering ready.
- [ ] **Read Durin docs** (likely `durin.dev`); **read Namestone docs** (`namestone.com`). Pick one based on §2.1 criteria. Document choice.
- [ ] Read **Coinbase `cb.id` reference gateway** for CCIP-Read implementation details. The ENS LLM index does not pin these specifics.
- [ ] Verify Reverse Registrar address on Base from the ENS docs page `/registry/reverse#supported-chains`. The LLM index links it but doesn't inline it.
- [ ] Pin `@reckon-protocol/types/ens.ts` constants:
  - parent namehashes: `solvers.reckon.eth`, `challengers.reckon.eth`
  - text record keys: `reckon.reputation`, `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`
- [ ] Register `reckon.eth` (~$30, 1-year). **Do not wrap.**

### Phase 1 Day 4-5 (Builder A):

- [ ] Deploy L2 subname registrar on Anvil-forked Base mainnet (Durin / Namestone / minimal custom — per Phase 0 decision)
- [ ] Configure `reckon.eth` on mainnet so `solvers.reckon.eth` and `challengers.reckon.eth` resolve to our L2 registrar (set resolver at parent registry; this is one mainnet tx per subname)
- [ ] Implement registrar's `register(label, owner)` + `ownedSubnameOf(address)` reverse map for FR-3 validator gating
- [ ] Implement ENSIP-10 `resolve(bytes name, bytes data)` with `OffchainLookup` revert per §4.2
- [ ] Foundry test: register subname → `ownedSubnameOf` returns expected node → namehash round-trips

### Phase 1 Day 2 (Builder A, validator):

- [ ] `ReckonValidator.validate()` calls `ownedSubnameOf(filler)` on the registrar; reverts on `bytes32(0)`
- [ ] Same view function checks self-challenge: `filler` namehash ≠ challenger's namehash (per NFR-2)
- [ ] Gas budget: confirm ≤ 30k via Foundry gas snapshot

### Phase 2 Day 12 (Builder A):

- [ ] `ENSReputationWriter` on Base mainnet — `flushReputation(nodes[], rep[], fills[], slashes[])` writes 4 text records per node via the L2 registrar
- [ ] KeeperHub schedule workflow: daily 00:05 UTC, calls `flushReputation()` with batched data from MongoDB

### Phase 3 Day 19 (Builder A):

- [ ] **CCIP-Read gateway**: HTTP server, `GET /{sender}/{data}.json` shape, MongoDB read-only credentials, EIP-712 signing key (hardcoded in registrar as `SIGNER`)
- [ ] Verify a viem-based ENS resolution against `bunni.solvers.reckon.eth` returns the live reputation from MongoDB through the gateway
- [ ] Failure mode test: gateway down → on-chain text records still resolve (verbatim from spec NFR-3: "If ENS resolver / CCIP-Read gateway is offline: text records still readable on-chain (slower path, but not broken)")

### Phase 4 (Builder A):

- [ ] Day 22-23: deploy registrars + writer to **real Base mainnet** via `DeployBaseMainnet.s.sol` sibling
- [ ] Day 24: configure `reckon.eth` parent on mainnet — set the two subname-level resolvers
- [ ] Day 24: register 2-3 demo solver subnames + 1-2 challenger subnames
- [ ] Day 26: ship `resolve.reckon.fi` (§6)
- [ ] Demo video segment 1:25-1:45: third-party app resolving `bunni.solvers.reckon.eth` and reading reputation via CCIP-Read

---

## 9. Spec deltas this guide locks in

These are commitments the spec should reference back to:

1. **Do not wrap `reckon.eth`.** L2 subnames don't require it; wrapping adds cost without upside.
2. **`ownedSubnameOf(address)` registrar-local reverse map**, not global `addr.reverse`. This is the implementation shape that satisfies FR-3's "reverse-lookup on the `solvers.reckon.eth` registrar" within the validator's view+gas budget.
3. **Text record keys are namespaced under `reckon.`** (`reckon.reputation`, etc.). Pin in shared constants.
4. **CCIP-Read reference is Coinbase `cb.id` gateway.** ENS LLM index does not pin EIP-3668 implementation specifics; treat `cb.id` as the canonical exemplar.
5. **Live reputation served via CCIP-Read; daily snapshot served on-chain.** Both reachable through the same ENS resolver. Honest framing in README.
6. **Reverse Registrar `setName()` is not used by Reckon.** Reckon contracts don't need their own primary names.
7. **Phase 0 verification of Durin vs Namestone is required** — neither appears in the ENS docs index. Builder A reads each tool's docs directly. Fallback to ~6h custom registrar if both fail.
8. **Multichain coinType records optional in v1** — solver addresses are EOA, chain-agnostic in our usage. Set mainnet coinType only.
9. **ENSIP-15 normalization mandatory** at registration time and at every namehash construction. Use `viem/ens` `normalize()`.
10. **Gateway signing key is an EOA hardcoded in registrar as `SIGNER`.** Same trust model as the rest of our relayer infrastructure (NFR-3).

---

## 10. Open items the docs don't resolve

The ENS LLM index is sparse on the implementation specifics Reckon needs. These are gaps Builder A should expect to hit and route around:

- **Full CCIP-Read code** (revert struct, callback impl, EIP-712 domain, sig encoding). The index pins the concept; the bytes-on-the-wire are not inline. Workaround: copy from `cb.id` reference; if that's behind a paywall or doesn't have public source, the next-best public reference is the ENS Labs `ens.docs/ccip-read` example or `unruggable.com`'s gateways.
- **Reverse Registrar addresses per chain.** Index points at `/registry/reverse#supported-chains` but the LLM dump doesn't inline the addresses. Phase 0 task: visit that page directly.
- **Universal Resolver address.** Index says it exists; doesn't list the address. Fetch from `/resolution/universal` or chain explorers.
- **Durin and Namestone are nowhere in the index.** Both are independent products; treat their own docs as authoritative.
- **PublicResolver full ABI.** Index pins `setText`/`text`/`addr` patterns but isn't exhaustive. Pull the actual ABI from the deployed contract on mainnet (`0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63` — verify) or the `@ensdomains/ens-contracts` npm package.
- **EIP-3668 signing scheme specifics** — what exactly gets hashed, what EIP-712 domain to use, signature encoding. Not in the index. Mandatory copy from a working gateway implementation.
- **Mainnet ENS Registry address** — well-known but not pinned in this index. `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`. Verify from a primary source.
- **Wildcard resolver behavior under non-existent labels** — does `resolve("nonexistent.solvers.reckon.eth", text(...))` revert, return empty, or return zero-value? Implementation choice; convention is to return zero-value (empty string for `text`, `0x` for `addr`). Pin in our registrar's `resolve()`.

If any of these resolve differently in practice, update this guide in place — not a new file.
