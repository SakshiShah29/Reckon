# Demo Solver — Implementation Plan

**Purpose:** A lightweight server that receives signed UniswapX orders and fills them on Base via the `PriorityOrderReactor`. After the fill, the relayer's existing `fill-listener` picks up the `Fill` event and the normal protocol flow continues.

**Location:** `solver/` (new workspace entry in root `package.json`)

**Deploy target:** Render (web service)

**Estimated size:** ~200 LoC server + ~150 LoC swapper test script

**Testing approach:** A standalone swapper script (`scripts/swap-test.ts`) acts as the swapper — builds, signs, and sends orders to the solver API. No auth on the solver; anyone can call it. Once the flow is validated end-to-end, the dashboard UI replaces the script as the order source.

---

## Architecture

```
Swapper script (local)               Demo Solver (Render)                Base Mainnet
──────────────────────               ────────────────────                ────────────
                                                                        
1. Load swapper private key                                              
2. Approve USDC on Permit2           
3. Build PriorityOrder               
4. Sign via Permit2 (EIP-712)        
5. POST /fill ──────────────────►  6. Decode + validate order           
                                   7. Ensure WETH balance + approval    
                                   8. reactor.execute(signedOrder) ───► 9. Reactor:
                                                                           - Permit2.transferFrom(swapper → reactor) [USDC]
                                                                           - ReckonValidator.validate(solver, order)
                                                                           - safeTransferFrom(solver → swapper) [WETH]
                                                                           - emit Fill(orderHash, filler, swapper, nonce)
                                   10. Return { txHash, status }        
◄────────────────────────────────── 
                                                                        11. Relayer picks up Fill event
                                                                            → recordFill → challenge window opens
```

Later, the dashboard UI replaces the swapper script (steps 1-5) — the solver API stays identical.

---

## What the solver controls

In a `PriorityOrder`, the **swapper** sets the minimum output amount via `outputs[0].amount`. The solver must provide **at least** that much WETH to the swapper, or the reactor reverts. The solver can provide exactly that amount or more.

For the demo, the interesting knob is: **what minimum does the swapper's order specify?**

Since we control both sides (the UI builds the order, the solver fills it), the demo flow is:

- **Honest fill:** UI sets `outputs[0].amount` at or above the EBBO benchmark. Solver fills at that amount. Challenge fails.
- **Bad fill:** UI sets `outputs[0].amount` deliberately below the EBBO benchmark (e.g. 50% of fair price). Solver fills at that amount. Challenge succeeds → slash.

The solver doesn't need to manipulate anything — it just fills the order as specified. The "badness" is encoded in the order itself, which the UI constructs.

**Alternative approach (solver-controlled):** The solver could also fill at a worse price than what the order specifies by routing through a worse path. But for the demo, the simpler approach is to let the UI set the output amount and have the solver fill exactly that.

---

## Solver Server

### Tech stack

- **Runtime:** Node.js / Bun
- **Framework:** Hono (lightweight, Render-friendly)
- **Chain interaction:** viem
- **No database needed** — the solver is stateless

### Env vars

```bash
# Solver identity (must be registered in SolverRegistry + bonded in SolverBondVault)
SOLVER_PRIVATE_KEY=0x...

# Base network
BASE_RPC_URL=https://mainnet.base.org   # or Anvil fork URL for testing

# Contract addresses (from DeployBase output)
REACTOR_ADDRESS=0x000000001Ec5656dcdB24D90DFa42742738De729   # PriorityOrderReactor on Base
WETH_ADDRESS=0x4200000000000000000000000000000000000006       # WETH on Base
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913       # USDC on Base

# Server
PORT=3000
```

No CORS restrictions, no auth. Anyone can call `/fill`. This is intentional for the demo — the solver is a dumb executor.

### Endpoints

#### `GET /health`

Returns solver status: address, WETH balance, WETH allowance on reactor, registration status.

```typescript
Response: {
  solver: Address,
  wethBalance: string,
  wethAllowance: string,
  status: "ready" | "low_balance" | "not_approved"
}
```

#### `POST /fill`

Receives a signed PriorityOrder from the swapper UI and fills it on-chain.

```typescript
Request: {
  // The full abi.encode(PriorityOrder) — already signed by swapper
  encodedOrder: `0x${string}`,
  // Swapper's Permit2 signature over the order
  signature: `0x${string}`,
}

Response (success): {
  txHash: `0x${string}`,
  orderHash: `0x${string}`,
  fillBlock: number,
  solver: Address,
}

Response (error): {
  error: string,
  code: "INVALID_ORDER" | "INSUFFICIENT_BALANCE" | "TX_REVERTED" | "VALIDATION_FAILED"
}
```

### Server implementation (~200 LoC)

```
solver/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # Hono server, /health + /fill routes
│   ├── filler.ts         # viem wallet client, execute() call, balance checks
│   └── validate.ts       # Decode PriorityOrder, sanity checks before submitting
```

#### `src/index.ts` — Server entry point

- Initialize Hono app with CORS
- `GET /health` — read solver WETH balance + allowance
- `POST /fill` — validate request body → call `fillOrder()` → return tx hash
- Start on `PORT`

#### `src/filler.ts` — On-chain interaction

Exports `fillOrder(encodedOrder, signature)`:

1. Create viem wallet client from `SOLVER_PRIVATE_KEY`
2. Decode the `PriorityOrder` from the encoded bytes to read:
   - `outputs[0].token` — must be WETH (or whatever the output token is)
   - `outputs[0].amount` — how much the solver must provide
   - `info.additionalValidationContract` — must be ReckonValidator address
3. Check solver's WETH balance >= required output amount
4. Check solver's WETH allowance on reactor >= required output amount (if not, approve)
5. Call `reactor.execute({ order: encodedOrder, sig: signature })`
6. Wait for receipt, return tx hash + fill block

The `execute()` call sends the `SignedOrder` struct:
```typescript
const txHash = await walletClient.writeContract({
  address: REACTOR_ADDRESS,
  abi: ReactorABI,   // just the execute(SignedOrder) function
  functionName: "execute",
  args: [{ order: encodedOrder, sig: signature }],
});
```

**Critical detail from `BaseReactor._fill()`:** the reactor calls `ERC20(output.token).safeTransferFrom(msg.sender, recipient, amount)` — it pulls output tokens directly from `msg.sender` (the solver). So the solver must have:
- Enough WETH balance
- WETH approved on the reactor address (not Permit2 — the reactor uses direct `transferFrom` for output tokens)

#### `src/validate.ts` — Pre-submission checks

Decodes the `PriorityOrder` and runs sanity checks:
- Order hasn't expired (`info.deadline > now`)
- Output token is a known token (WETH)
- `additionalValidationContract` matches our ReckonValidator address
- Only 1 output (multi-output unsupported)
- Input token is USDC (expected pair)

---

## Swapper Test Script

**Location:** `scripts/swap-test.ts`

A standalone script that acts as a swapper — builds a `PriorityOrder`, signs it via Permit2, and POSTs it to the solver API. Used to validate the full flow before wiring the dashboard UI.

### Env vars (for the script)

```bash
# Swapper wallet (separate from solver — must hold USDC on Base)
SWAPPER_PRIVATE_KEY=0x...

# Where the solver server is running
SOLVER_URL=http://localhost:3000          # local dev
# SOLVER_URL=https://solver.onrender.com  # after deploy

# Base network (same RPC as solver)
BASE_RPC_URL=https://mainnet.base.org

# Contract addresses
REACTOR_ADDRESS=0x000000001Ec5656dcdB24D90DFa42742738De729
PERMIT2_ADDRESS=0x000000000022D473030F116dDEE9F6B43aC78BA3
RECKON_VALIDATOR_ADDRESS=0x...   # from DeployBase output
EBBO_ORACLE_ADDRESS=0x...        # from DeployBase output
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
WETH_ADDRESS=0x4200000000000000000000000000000000000006
```

### Script flow (~150 LoC)

```typescript
// scripts/swap-test.ts
// Usage: npx tsx scripts/swap-test.ts [--bad-fill]

async function main() {
  const badFill = process.argv.includes("--bad-fill");

  // 1. Initialize viem clients
  const swapperAccount = privateKeyToAccount(SWAPPER_PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
  const walletClient = createWalletClient({ chain: base, transport: http(BASE_RPC_URL), account: swapperAccount });

  // 2. Read EBBO benchmark to determine fair output price
  const benchmark = await publicClient.readContract({
    address: EBBO_ORACLE_ADDRESS,
    abi: EBBOOracleABI,
    functionName: "computeBenchmark",
    args: [USDC_ADDRESS, WETH_ADDRESS],
  });

  const inputAmount = 1000n * 10n ** 6n;  // 1000 USDC
  const fairOutput = (benchmark * inputAmount) / 10n ** 18n;
  const outputAmount = badFill ? fairOutput / 2n : fairOutput;  // ← the knob

  console.log(`Benchmark: ${benchmark}`);
  console.log(`Input: ${inputAmount} USDC`);
  console.log(`Output: ${outputAmount} WETH (${badFill ? "BAD FILL — 50% of fair" : "fair price"})`);

  // 3. Approve USDC on Permit2 (if needed)
  const allowance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: [swapperAccount.address, PERMIT2_ADDRESS],
  });
  if (allowance < inputAmount) {
    const approveTx = await walletClient.writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [PERMIT2_ADDRESS, maxUint256],
    });
    console.log(`Approved USDC on Permit2: ${approveTx}`);
  }

  // 4. Build PriorityOrder
  const currentBlock = await publicClient.getBlockNumber();
  const eboToleranceBps = 100;  // 1%

  const order = {
    info: {
      reactor: REACTOR_ADDRESS,
      swapper: swapperAccount.address,
      nonce: BigInt(Date.now()),       // unique nonce
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      additionalValidationContract: RECKON_VALIDATOR_ADDRESS,
      additionalValidationData: encodeAbiParameters([{ type: "uint16" }], [eboToleranceBps]),
    },
    cosigner: zeroAddress,
    auctionStartBlock: currentBlock,
    baselinePriorityFeeWei: 0n,
    input: { token: USDC_ADDRESS, amount: inputAmount, mpsPerPriorityFeeWei: 0n },
    outputs: [{ token: WETH_ADDRESS, amount: outputAmount, mpsPerPriorityFeeWei: 0n, recipient: swapperAccount.address }],
    cosignerData: { auctionTargetBlock: 0n },
    cosignature: "0x",
  };

  // 5. Sign via Permit2 (EIP-712 PermitWitnessTransferFrom with PriorityOrder witness)
  //    Exact typehash from PriorityOrderLib.sol — see test/E2E.t.sol:42-52
  const encodedOrder = encodeAbiParameters(PriorityOrderABI, [order]);
  const orderHash = hashPriorityOrder(order);
  const signature = await signPermit2WitnessTransfer(walletClient, order, orderHash);

  // 6. POST to solver
  console.log(`Sending to solver at ${SOLVER_URL}/fill ...`);
  const response = await fetch(`${SOLVER_URL}/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encodedOrder, signature }),
  });

  const result = await response.json();
  if (response.ok) {
    console.log(`Fill submitted! tx: ${result.txHash}`);
    console.log(`Order hash: ${result.orderHash}`);
    console.log(`Relayer will pick up the Fill event and open the challenge window.`);
    if (badFill) {
      console.log(`This is a bad fill — challenger agents should detect and slash within 30 minutes.`);
    }
  } else {
    console.error(`Solver rejected: ${result.error} (${result.code})`);
  }
}
```

### Permit2 signing detail

The swapper signs a `PermitWitnessTransferFrom` with the `PriorityOrder` as the witness. The E2E test (`test/E2E.t.sol:175-203`) shows the exact typehash and signing flow. The script replicates this using viem's `signTypedData`:

```typescript
const signature = await walletClient.signTypedData({
  domain: {
    name: "Permit2",
    chainId: 8453,
    verifyingContract: PERMIT2_ADDRESS,
  },
  types: {
    PermitWitnessTransferFrom: [...],
    TokenPermissions: [...],
    PriorityOrder: [...],
    OrderInfo: [...],
    PriorityInput: [...],
    PriorityOutput: [...],
  },
  primaryType: "PermitWitnessTransferFrom",
  message: { ... },
});
```

The exact type strings are defined in `PriorityOrderLib.sol` (`PERMIT2_ORDER_TYPE`). Copy them verbatim.

### Running the script

```bash
# Honest fill — solver fills at fair price, challenge should fail
npx tsx scripts/swap-test.ts

# Bad fill — solver fills at 50% of benchmark, challenge should succeed → slash
npx tsx scripts/swap-test.ts --bad-fill
```

### What to verify after running

1. **Solver logs:** should show `execute()` tx hash
2. **Relayer logs:** should show `[fill-listener] Found 1 Fill event(s)` followed by `[fill-recorder] recorded on-chain tx`
3. **On-chain:** `FillRegistry.getFill(orderHash)` should return the recorded fill with correct amounts
4. **For `--bad-fill`:** within 30 minutes, challenger agent should pick it up and slash. Check `Challenger.ChallengeSucceeded` event on Base

### Later: dashboard UI replaces this script

Once the flow is validated, the dashboard UI takes over steps 1-6 (wallet connect, order building, Permit2 signing, POST to solver). The solver API stays identical — it doesn't care who sends the order.

---

## Solver Wallet Setup (one-time, before deploy)

1. Generate a new EOA for the solver (or use an existing dev key)
2. **Relayer registers the solver:**
   ```
   SolverRegistry.register(keccak256("demo.solvers.reckon.eth"), solverAddress)
   ```
3. **Fund solver with USDC** and deposit bond:
   ```
   SolverBondVault.deposit(1000e6)   // 1000 USDC base bond
   ```
4. **Fund solver with WETH** (enough to fill demo orders — e.g. 1-2 WETH for ~$3-6k worth of swaps)
5. **Approve WETH on the reactor:**
   ```
   WETH.approve(REACTOR_ADDRESS, type(uint256).max)
   ```

On Anvil fork, steps 2-5 happen in the bootstrap script. On mainnet, Builder A (relayer owner) handles step 2, and the solver wallet is funded from the ops wallet.

---

## What the relayer does after the fill

Nothing changes in the relayer. The existing `fill-listener.ts` watches `Fill` events on the `PriorityOrderReactor`. When the solver calls `reactor.execute()`, the reactor emits:

```solidity
emit Fill(orderHash, msg.sender, swapper, nonce);
```

The `fill-listener` picks this up as a `RawFillEvent` and passes it to `fill-recorder.ts`, which:

1. Checks solver registration via `SolverRegistry.namehashOf(filler)`
2. Reads the tx receipt to parse `Transfer` events for tokenIn/tokenOut/amounts
3. Calls `FillRegistry.recordFill()` on-chain (opens the 30-min challenge window)
4. Writes to MongoDB

From there, the challenger agents see the `FillRecorded` event and run the SKILL.md loop. The solver is out of the picture.

---

## File structure

```
solver/
├── package.json          # dependencies: hono, viem, dotenv
├── tsconfig.json
├── .env.example
└── src/
    ├── index.ts          # ~80 LoC — Hono server, routes
    ├── filler.ts         # ~80 LoC — wallet client, execute(), balance checks, approval
    └── validate.ts       # ~40 LoC — decode PriorityOrder, sanity checks

scripts/
├── swap-test.ts          # ~150 LoC — swapper script that builds + signs + POSTs orders
└── .env.example          # swapper env vars (separate key from solver)
```

Root `package.json` workspace addition:
```json
"workspaces": [
  "packages/*",
  "agent",
  "inft-tools",
  "dashboard",
  "axl-broadcast",
  "indexer",
  "ccip-gateway",
  "keeper-skills",
  "solver"          // ← new
]
```

---

## Dependencies

```json
{
  "dependencies": {
    "hono": "^4.0.0",
    "@hono/node-server": "^1.0.0",
    "viem": "^2.0.0",
    "dotenv": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@reckon-protocol/types": "workspace:*"
  }
}
```

No database. No MongoDB. No 0G. Just an HTTP server that calls one contract function.

---

## Render deployment

- **Service type:** Web Service
- **Build command:** `cd solver && npm install && npm run build`
- **Start command:** `cd solver && node dist/index.js`
- **Env vars:** set via Render dashboard (SOLVER_PRIVATE_KEY is a secret)
- **Health check:** `GET /health`

---

## Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Solver wallet WETH runs out | MEDIUM | `/health` endpoint shows balance. Dashboard alerts. Pre-fund with enough for 20+ demo fills |
| Solver private key exposure on Render | LOW | Use Render's secret env vars. Solver wallet holds only WETH for demo fills, not high-value assets |
| Order expires before solver submits | LOW | UI sets 1-hour deadline. Solver submits within seconds of receiving the request |
| WETH approval revoked or insufficient | LOW | `filler.ts` checks allowance before executing. Auto-approves if needed |
| Reactor reverts (ReckonValidator rejects) | LOW | `validate.ts` pre-checks solver registration. Return clear error to UI |
| Concurrent fills drain WETH | LOW | Demo is low-frequency (1-2 fills for the video). For stress testing, pre-fund accordingly |
