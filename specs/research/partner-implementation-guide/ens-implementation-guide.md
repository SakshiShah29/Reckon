# Reckon ENS Implementation Guide

**Owner:** Builder A
**Scope:** Everything ENS-related: parent name, wildcard resolver, registry mirrors, CCIP-Read gateway, demo tools.

---

## 0. Prerequisites

Before starting any work below:

- [ ] MongoDB Atlas M0 cluster set up; `relayer` (RW) and `consumer` (RO) users created
- [ ] Node.js 20+ and Bun installed
- [ ] Foundry installed and on `forge --version` ≥ 0.2.0
- [ ] Access to an Ethereum mainnet RPC (Alchemy/QuickNode/Infura)
- [ ] Access to a Base mainnet RPC that supports fork mode
- [ ] Wallet with ~$80-100 in ETH on Ethereum mainnet for name registration + resolver deploy

---

## 1. Acquire `reckon.eth` on ENS mainnet

**Day 1, ~30 min, ~$25-50 in ETH gas**

1. Go to `app.ens.domains`. Connect wallet. Search `reckon.eth`
2. If unavailable, fall back in order: `reckonprotocol.eth` → `getreckon.eth` → pick a new name and update spec
3. Click "Register". Choose 2-year duration. Submit commit transaction
4. Wait 60 seconds (anti-frontrun delay)
5. Submit reveal/register transaction
6. After confirmation, click "Records" → "Set resolver" → choose "Public Resolver" (default). Sign

**You now own `reckon.eth` with default resolution.** Test:

```bash
cast call $PUBLIC_RESOLVER "addr(bytes32)" $(cast namehash reckon.eth) --rpc-url $ETH_MAINNET_RPC
```

Returns zero address (no addr set yet, which is fine — the wildcard resolver will replace this).

---

## 2. Write `ReckonWildcardResolver.sol`

**Day 4-5 of Phase 1, ~3 hours**

Reference: clone https://github.com/ensdomains/offchain-resolver as a starting point.

### 2.1 Contract structure

```
contracts/src/ens/
├── ReckonWildcardResolver.sol     # the resolver
├── interfaces/
│   ├── IExtendedResolver.sol      # ENSIP-10
│   └── IResolverService.sol       # CCIP-Read callback shape
└── lib/
    └── SignatureVerifier.sol      # verify gateway responses
```

### 2.2 Required functions in `ReckonWildcardResolver.sol`

```solidity
function resolve(bytes calldata name, bytes calldata data)
    external view returns (bytes memory);

function resolveWithProof(bytes calldata response, bytes calldata extraData)
    external view returns (bytes memory);
```

`resolve()` MUST revert with `OffchainLookup` per ERC-3668:

```solidity
revert OffchainLookup(
    address(this),
    urls,                   // ["https://ccip.reckon.fi/{sender}/{data}.json"]
    callData,               // abi.encode(name, data)
    this.resolveWithProof.selector,
    abi.encode(callData, address(this))
);
```

`resolveWithProof()` verifies the gateway's signature and returns the resolved data.

### 2.3 Constructor params

- `_url`: gateway URL pattern (e.g., `https://ccip.reckon.fi/{sender}/{data}.json`)
- `_signers`: array of trusted gateway signer addresses (initially one — the `RECKON_GATEWAY_SIGNER` EOA)

### 2.4 Tests (Foundry)

- [ ] `resolve()` reverts with `OffchainLookup` containing correct gateway URL
- [ ] `resolveWithProof()` accepts a valid signature from a trusted signer
- [ ] `resolveWithProof()` rejects a signature from an untrusted signer
- [ ] `resolveWithProof()` rejects a signature for the wrong subname
- [ ] Owner can add/remove signers via `addSigner`/`removeSigner`

Target: 95%+ line coverage.

---

## 3. Generate gateway signer key

**Day 4-5 of Phase 1, ~5 min**

```bash
cast wallet new --json | jq '.[]'
```

Save the output to a secrets vault as `RECKON_GATEWAY_SIGNER`. The address is what's passed to `ReckonWildcardResolver`'s constructor as a trusted signer.

**Never commit this key to git.** Use 1Password/vault for storage; pass into the gateway service via env var.

---

## 4. Build CCIP-Read gateway

**Days 11-12 of Phase 2, ~12 hours total**

> **Why this comes before deploying the resolver:** the resolver contract takes the gateway URL as a constructor argument. The gateway must be deployed and reachable at a known URL before you deploy the resolver, so the URL can be baked into the resolver's bytecode.

### 4.1 Project setup

```bash
mkdir -p ccip-gateway && cd ccip-gateway
bun init
bun add express ethers viem mongodb
bun add -D @types/express typescript
```

### 4.2 Required env vars

```
GATEWAY_PRIVATE_KEY=0x...          # the RECKON_GATEWAY_SIGNER key
MONGODB_URI=mongodb+srv://...
RESOLVER_ADDRESS=0x...             # filled in after Section 5; can be left blank initially
PORT=8080
```

`RESOLVER_ADDRESS` is only needed by the gateway for sender-validation defense. The gateway can run without it (it'll accept any sender), then you populate it after Section 5 deploys the resolver.

### 4.3 Endpoint shape (per ERC-3668)

```
GET /{sender}/{data}.json
```

- `sender`: hex-encoded resolver address
- `data`: hex-encoded `(name, callData)` from the resolver's `OffchainLookup` revert

### 4.4 Gateway logic (pseudocode)

```typescript
async function handleResolve(sender: string, data: string) {
    // 1. Decode name + callData from data
    const [name, callData] = abi.decode(data, ["bytes", "bytes"]);

    // 2. Decode the underlying ENS query from callData
    //    (could be addr(bytes32), text(bytes32, string), etc.)
    const querySelector = callData.slice(0, 10);
    const queryArgs = callData.slice(10);

    // 3. Look up the subname in MongoDB
    const dnsName = decodeDnsName(name);  // "bunni.solvers.reckon.eth"
    const subname = await db.collection("subnames").findOne({
        fullName: dnsName,
        active: true
    });

    if (!subname) {
        throw new Error("Subname not found");
    }

    // 4. Compute the response based on the query type
    let response;
    if (querySelector === selectorFor("addr(bytes32)")) {
        response = abi.encode(["address"], [subname.owner]);
    } else if (querySelector === selectorFor("text(bytes32,string)")) {
        const [, key] = abi.decode(queryArgs, ["bytes32", "string"]);
        response = abi.encode(["string"], [subname.textRecords[key] || ""]);
    }

    // 5. Sign the response
    const expires = Math.floor(Date.now() / 1000) + 3600;  // 1 hour
    const signature = await signResponse(response, callData, expires);

    return abi.encode(["bytes", "uint64", "bytes"], [response, expires, signature]);
}
```

### 4.5 Signature format

Match the `SignatureVerifier` lib in your contract. Standard pattern:

```typescript
const messageHash = keccak256(abi.encode([
    "address",   // sender (resolver)
    "uint64",    // expires
    "bytes32",   // hash of callData
    "bytes32"    // hash of response
], [sender, expires, keccak256(callData), keccak256(response)]));

const signature = await signer.signMessage(getBytes(messageHash));
```

### 4.6 Tests

- [ ] Returns valid response for existing subname
- [ ] Returns 404 for nonexistent subname
- [ ] Signs responses with the gateway key
- [ ] Handles `addr(bytes32)`, `text(bytes32, string)`, `addr(bytes32, uint256)` query types

### 4.7 Deploy

For hackathon: use Render, Railway, or Fly.io. Single Node.js service. Cheap.

```bash
fly launch --name ccip-reckon
fly secrets set GATEWAY_PRIVATE_KEY=... MONGODB_URI=...
fly deploy
```

Get the hostname (e.g., `ccip-reckon.fly.dev`).

### 4.8 Verify reachability before continuing

```bash
curl https://ccip-reckon.fly.dev/0x1234.../0x5678....json
```

You'll get a 4xx error because the args are nonsense, but you should see HTTP 4xx (not connection refused or timeout). If you get connection errors, fix them before deploying the resolver — the resolver bakes this URL in.

### 4.9 Set up branded domain (optional but recommended)

For the demo, point a branded subdomain at the Fly.io app via CNAME:

```
ccip.reckon.fi  CNAME  ccip-reckon.fly.dev
```

Wait for DNS to propagate (usually 5-15 min), then verify TLS works at `https://ccip.reckon.fi`. This is the URL you'll actually bake into the resolver in Section 5.

**You now have a known, reachable, HTTPS-served gateway URL.** Either:
- `https://ccip-reckon.fly.dev/{sender}/{data}.json` (raw Fly URL)
- `https://ccip.reckon.fi/{sender}/{data}.json` (branded)

Pick one and use it consistently in Section 5.

---

## 5. Deploy `ReckonWildcardResolver` to Ethereum mainnet

**Day 13 of Phase 2, ~30 min, ~$15-25 in gas**

> **Prerequisite:** Section 4 is done. You have a deployed gateway at a known HTTPS URL.

1. Write `script/DeployENSResolver.s.sol`:

```solidity
contract DeployENSResolver is Script {
    function run() external {
        address[] memory signers = new address[](1);
        signers[0] = vm.envAddress("RECKON_GATEWAY_SIGNER");

        vm.startBroadcast();
        ReckonWildcardResolver resolver = new ReckonWildcardResolver(
            vm.envString("GATEWAY_URL"),
            signers
        );
        vm.stopBroadcast();

        console.log("Resolver deployed at", address(resolver));
    }
}
```

2. Set env vars and deploy:

```bash
export GATEWAY_URL="https://ccip.reckon.fi/{sender}/{data}.json"
export RECKON_GATEWAY_SIGNER=0x...   # the signer EOA address from Section 3

forge script script/DeployENSResolver.s.sol \
    --rpc-url $ETH_MAINNET_RPC \
    --broadcast \
    --verify \
    --etherscan-api-key $ETHERSCAN_API_KEY
```

The `GATEWAY_URL` value is the literal string with `{sender}` and `{data}` as placeholders — do not substitute actual values. ENS clients replace them at query time.

3. Save the deployed address as `RECKON_RESOLVER_ADDRESS`

4. **Backfill the gateway's `RESOLVER_ADDRESS` env var** with the address you just got. Redeploy/restart the gateway so it can validate the sender field on incoming queries:

```bash
fly secrets set RESOLVER_ADDRESS=$RECKON_RESOLVER_ADDRESS
fly deploy
```

5. Update `reckon.eth`'s resolver to point at `RECKON_RESOLVER_ADDRESS`. Either via app.ens.domains UI ("Records" → "Set resolver" → custom address) OR via `cast`:

```bash
cast send $ENS_REGISTRY \
    "setResolver(bytes32,address)" \
    $(cast namehash reckon.eth) \
    $RECKON_RESOLVER_ADDRESS \
    --private-key $RECKON_OWNER_KEY \
    --rpc-url $ETH_MAINNET_RPC
```

`$ENS_REGISTRY` on mainnet: `0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`

6. Verify the resolver pointer:

```bash
cast call $ENS_REGISTRY "resolver(bytes32)" $(cast namehash reckon.eth) --rpc-url $ETH_MAINNET_RPC
```

Should return `RECKON_RESOLVER_ADDRESS`.

7. Test end-to-end resolution from a clean client:

```bash
cast resolve-name bunni.solvers.reckon.eth --rpc-url $ETH_MAINNET_RPC
```

(Assuming you've inserted at least one test subname into MongoDB.) Should return the address you configured.

---

## 6. Build registry mirror contracts

**Days 2-3 of Phase 1, ~3 hours total**

These exist because the validator and challenger contracts need to verify subname registration in `view`/synchronous calls.

### 6.1 `IReckonNamehashLookup.sol` (interface)

```solidity
interface IReckonNamehashLookup {
    function isRegistered(bytes32 node) external view returns (bool);
    function ownerOfNamehash(bytes32 node) external view returns (address);
    function namehashOf(string calldata label) external pure returns (bytes32);
}
```

### 6.2 `SolverRegistry.sol` (~30 LoC)

```solidity
contract SolverRegistry is IReckonNamehashLookup {
    address public relayer;
    bytes32 public immutable parentNode;  // namehash("solvers.reckon.eth")

    mapping(bytes32 => bool) private _registered;
    mapping(bytes32 => address) private _owners;

    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not relayer");
        _;
    }

    function attestRegistration(bytes32 node, address owner, bool active)
        external onlyRelayer
    {
        _registered[node] = active;
        if (active) _owners[node] = owner;
    }

    function isRegistered(bytes32 node) external view returns (bool) {
        return _registered[node];
    }

    function ownerOfNamehash(bytes32 node) external view returns (address) {
        return _owners[node];
    }

    function namehashOf(string calldata label) external pure returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }
}
```

### 6.3 `ChallengerRegistry.sol`

Same shape as `SolverRegistry`, just with `parentNode = namehash("challengers.reckon.eth")`. Reuse the same code with a different constructor argument if you prefer; or copy the file. ~30 LoC either way.

### 6.4 Relayer responsibility

When a solver/challenger registers via the dashboard:

1. Relayer validates the registration intent
2. Relayer writes a document to MongoDB `subnames` collection
3. Relayer calls `attestRegistration(namehash, owner, true)` on the appropriate registry contract
4. Both must succeed; if one fails, relayer rolls back via compensating action

When a subname is deactivated:

1. Relayer calls `attestRegistration(namehash, owner, false)` on the registry
2. Relayer marks the MongoDB document `active: false`

### 6.5 Tests

- [ ] Only `relayer` can call `attestRegistration`
- [ ] `isRegistered` returns true after attestation, false before
- [ ] `namehashOf` produces identical output to `cast namehash` for the same label

---

## 7. Wire registries into Validator and Challenger

**Already in `ReckonValidator.sol` and `Challenger.sol` — verify references**

### 7.1 ReckonValidator

```solidity
function validate(address filler, ResolvedOrder calldata resolvedOrder) external view {
    bytes32 fillerNamehash = solverRegistry.namehashOf(addressToLabel(filler));
    require(solverRegistry.isRegistered(fillerNamehash), "Solver not registered");
    // decode eboTolerance, validate format
    // return silently
}
```

### 7.2 Challenger

```solidity
function submit(...) external {
    bytes32 challengerNamehash = challengerRegistry.namehashOf(addressToLabel(msg.sender));
    require(challengerRegistry.isRegistered(challengerNamehash), "Challenger not registered");
    require(challengerNamehash != fillRecord.fillerNamehash, "Self-challenge");
    // ... rest of challenge logic
}
```

`addressToLabel(addr)` is a small helper that converts `address` to a deterministic string label. Recommended: lowercase hex without `0x` prefix, e.g., `0xAbC123...` → `"abc123..."`.

---

## 8. Build dashboard registration UI

**Day 7-8 of Phase 1, ~3 hours**

Single-page form at `/register`:

- [ ] Input: desired label (e.g., `bunni`)
- [ ] Computes preview: `<label>.solvers.reckon.eth`
- [ ] Connects user wallet, signs intent
- [ ] POSTs to relayer endpoint `/api/register-subname` with signed intent
- [ ] On success: shows confirmation + the registered name
- [ ] Calls `setText` workflow for any default text records the user provides

---

## 9. Build `resolve.reckon.fi` external demo tool

**Day 26-27 of Phase 4, ~2-3 hours**

Single-page web tool at `resolve.reckon.fi`:

```typescript
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const client = createPublicClient({
    chain: mainnet,
    transport: http()
});

// User enters: "bunni.solvers.reckon.eth"
const reputation = await client.getEnsText({
    name: "bunni.solvers.reckon.eth",
    key: "reckon.reputation"
});

const totalFills = await client.getEnsText({
    name: "bunni.solvers.reckon.eth",
    key: "reckon.totalFills"
});
```

Display the resolved data with a small "via CCIP-Read from MongoDB" footer to make the architecture legible to ENS judges.

Deploy on Vercel or Fly. ~10 minutes.

---

## 10. End-to-end verification

**Day 14 of Phase 2 + Day 24 of Phase 4**

After everything is wired up, test from a clean client (no Reckon code):

```bash
# Test 1: addr resolution
cast resolve-name bunni.solvers.reckon.eth --rpc-url $ETH_MAINNET_RPC
# Should return the solver's address

# Test 2: text record resolution
cast call $RESOLVER_ADDRESS \
    "text(bytes32,string)" \
    $(cast namehash bunni.solvers.reckon.eth) \
    "reckon.reputation" \
    --rpc-url $ETH_MAINNET_RPC
# Should follow CCIP-Read and return the reputation value

# Test 3: viem client
node -e "
    const { createPublicClient, http } = require('viem');
    const { mainnet } = require('viem/chains');
    const c = createPublicClient({ chain: mainnet, transport: http() });
    c.getEnsText({ name: 'bunni.solvers.reckon.eth', key: 'reckon.reputation' })
        .then(console.log);
"
```

All three should return live data from MongoDB.

---

## 11. README dependencies section

**Day 24-25 of Phase 4**

Include in repo README:

- `reckon.eth` parent name owned by Reckon team (mainnet) — link to Etherscan
- `ReckonWildcardResolver` deployed at `0x...` (Ethereum mainnet) — link to Etherscan
- Subname namespaces: `solvers.reckon.eth`, `challengers.reckon.eth`
- Subnames are virtual — stored in MongoDB, served via CCIP-Read
- Reference: ENSIP-10 + ERC-3668; based on ENS Labs' `offchain-resolver-example`
- Gateway URL pattern: `https://ccip.reckon.fi/{sender}/{data}.json`
- Trust assumption: gateway signer key (held by Reckon) is trusted by the resolver

---

## Failure modes and recovery

| Failure | Symptom | Recovery |
|---|---|---|
| Gateway down | All ENS queries fail | `make redeploy-gateway`; pre-recorded demo footage as backup |
| Gateway signer key compromised | Tampered responses possible | Owner calls `removeSigner` + `addSigner` on resolver; rotate key in vault |
| MongoDB Atlas down | Gateway returns errors | Atlas free tier has reasonable uptime; pre-record demo |
| `reckon.eth` expires | All resolution stops permanently | Set calendar reminder for 90 days before expiry; renew via app.ens.domains |
| Wrong resolver address set | Resolution returns zero/empty | `setResolver` to correct address from owner wallet |

---

## Done criteria

- [ ] `reckon.eth` registered, resolver set to `ReckonWildcardResolver` on Ethereum mainnet
- [ ] `ReckonWildcardResolver` deployed and verified on Etherscan
- [ ] CCIP-Read gateway live at known URL
- [ ] Gateway responds to `addr` and `text` queries with valid signatures
- [ ] `SolverRegistry` and `ChallengerRegistry` deployed on Base mainnet
- [ ] Relayer attests registrations to both registries
- [ ] Dashboard registration form works end-to-end
- [ ] `resolve.reckon.fi` works for any registered subname
- [ ] viem `getEnsText` returns live MongoDB data via CCIP-Read
- [ ] All addresses + URLs documented in README
