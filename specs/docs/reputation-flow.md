# Reputation flow

How solver reputation updates flow from on-chain events through MongoDB and back into the on-chain `SolverRegistry` text records that drive `SolverBondVault.requiredBond`.

This replaces v0.7's `ENSReputationWriter` contract — that contract no longer exists. All reputation arithmetic happens off-chain; the on-chain side is a passive mirror written by the relayer EOA on a daily cadence.

---

## The pipeline

```
on-chain events                 off-chain                       on-chain mirror
───────────────                 ─────────                       ───────────────

Challenger.ChallengeSucceeded ─┐
Challenger.ChallengeFailed    ─┤
FillRegistry.FillRecorded     ─┴──► relayer indexer ──► MongoDB
                                                       reputation_updates
                                                              │
                                                              │ (every 24h)
                                                              ▼
                                                       KeeperHub schedule
                                                       workflow
                                                              │
                                                              │ relayer EOA
                                                              ▼
                                                       SolverRegistry.setText
                                                       (reckon.reputation,
                                                        reckon.totalFills,
                                                        reckon.slashCount,
                                                        reckon.lastSlash)
                                                              │
                                                              ▼
                                                       SolverBondVault.requiredBond
                                                       reads on next deposit/quote
```

External ENS clients (viem, ethers, wagmi) read the same MongoDB values via the CCIP-Read gateway behind `ReckonWildcardResolver` (Ethereum mainnet, §12). On-chain mirror and off-chain gateway are dual-writes from the same `reputation_updates` document — they should never disagree by more than one daily flush cycle.

---

## Event subscriptions (relayer)

The relayer subscribes to three event topics on Base mainnet (or the Anvil fork during dev):

| Source | Event | Effect on `reputation_updates` |
|---|---|---|
| `Challenger` | `ChallengeSucceeded(orderHash, fillerNamehash, challengerNode, slashAmount)` | `slashCount += 1`; `lastSlash = block.timestamp`; reputation decreases (formula below). |
| `Challenger` | `ChallengeFailed(orderHash, fillerNamehash, challenger)` | reputation increases slightly (the solver's fill stood up to a paid challenge — a positive signal). |
| `FillRegistry` | `FillRecorded(orderHash, fillerNamehash, swapper, fillBlock)` | tracked locally. After `block.number > fillBlock + challengeWindowBlocks` with no `ChallengeSucceeded` for that `orderHash`, the fill ages into the "clean fill" bucket: `totalFills += 1`; reputation increases. |

The aging-out check is wall-clock-driven inside the relayer; there is no on-chain trigger for "this fill went unchallenged." This is also where `SolverBondVault.unlockOnFill(node)` is called — see §4.4 in the contracts implementation guide.

---

## MongoDB schema

Collection: `reputation_updates`. One document per solver namehash.

```typescript
{
  _id: ObjectId,
  fillerNamehash: "0x...",                  // bytes32, hex-encoded
  reputation: "850000000000000000",         // decimal string, uint256 in [0, 1e18]
  totalFills: 142,
  slashCount: 3,
  lastSlash: 1719834000,                    // unix seconds; 0 if never slashed
  pendingDelta: { ... },                    // accumulator since last flush
  lastFlushedAt: ISODate("2026-04-26T..."), // when the on-chain mirror was last updated
}
```

The reputation field is the decimal-string encoding `SolverBondVault._parseUint` expects (see open item #5 in the contracts implementation guide). Range: `[0, 1e18]`, where `0` = no reputation (full `baseBond`), `1e18` = max reputation (decay to `floorBond`).

---

## Reputation formula (off-chain, owned by relayer)

The contracts intentionally don't pin the formula — only the encoding. The relayer computes:

```
reputation_new = clamp(
    reputation_old + α * cleanFillsThisCycle - β * slashAmountWeight,
    0,
    1e18
)
```

Initial constants (subject to tuning, document changes in `CHANGELOG.md`):

- `α = 1e16` per clean fill (≈ 1% of full reputation per clean fill).
- `β = 1e17` per slash (≈ 10% per slash, scaled by slash size relative to bond).

Both constants are off-chain config — changing them is a relayer-config update, not a contract upgrade.

---

## KeeperHub flush workflow

Trigger: schedule, daily at 00:05 UTC.

Steps inside the workflow (KeeperHub Web3 Write nodes targeting Base mainnet):

1. Page through `reputation_updates` where `pendingDelta != null`.
2. For each touched namehash, compute the new aggregate values.
3. Call `SolverRegistry.setText(node, "reckon.reputation", newValueDecimalString)` from the relayer's KeeperHub-managed wallet.
4. Repeat for the companion keys: `reckon.totalFills`, `reckon.slashCount`, `reckon.lastSlash`.
5. Update `lastFlushedAt` on the MongoDB document.

KeeperHub handles gas estimation (Base 1.5× multiplier), nonce management, and retry on revert. Per-agent `kh_` keys keep us under the 60 req/min Direct Execution API cap (see partner-implementation-guide/keeperhub).

---

## Consistency window

Maximum gap between MongoDB and the on-chain `SolverRegistry`: **24 hours** (one flush cycle).

Implications:

- A solver who got slashed at 00:10 UTC will have the slash reflected in MongoDB instantly but on-chain only at the next 00:05 UTC flush. Their next `deposit` between 00:10 and the flush will quote a `requiredBond` based on **stale** reputation (slightly more favorable than reality).
- This is acceptable for v1 because the `requiredBond` curve is conservative (decays from 1000 USDC to 100 USDC across the full reputation range). A 24h-stale read at most under-bonds by one decay-step worth of USDC.
- Document this in the public README as a known property.

If a tighter window is needed later, two paths exist without contract changes:

1. Run the flush every hour instead of every 24h (more KeeperHub gas, cheap on Base).
2. Run an event-driven flush triggered by `ChallengeSucceeded` for high-impact slashes.

---

## What was removed and why

v0.7 had an on-chain `ENSReputationWriter` contract that:
- Held a `pendingDelta[node]` mapping written by `Challenger` (success/failure branches) and `FillRegistry` (clean-fill aging).
- Exposed a `flushReputation(bytes32[] nodes)` callable by a KeeperHub schedule workflow that read deltas, wrote text records, and cleared deltas.

v0.9 deleted it. Reasons:

1. **MongoDB is already the read store.** The CCIP-Read gateway needed it to serve external ENS clients. Having a second on-chain mirror of the *deltas* (which the contract did) was redundant — only the *aggregate* needs to land on-chain, and a single off-chain → on-chain write per node per day handles that.
2. **Reputation arithmetic is policy, not protocol.** Off-chain code can iterate on the formula (constants, weighting, decay shape) without touching deployed contracts.
3. **Removes a permissioned contract.** One fewer relayer-write target, one fewer attack surface.

The cost: a 24h consistency window between MongoDB and `SolverRegistry`. Documented above.

---

## Actor responsibilities

| Actor | Owns |
|---|---|
| **Relayer (off-chain)** | Event subscription, MongoDB writes, aging-out logic, `unlockOnFill` scheduling. |
| **KeeperHub schedule workflow** | Daily 00:05 UTC trigger; pages reputation_updates and calls `SolverRegistry.setText`. Owned by Builder A per the partner-implementation-guide. |
| **`SolverRegistry`** | Passive on-chain mirror. Only the relayer writes text records. |
| **`SolverBondVault`** | Reads `reckon.reputation` on `deposit` / `requiredBond` quotes. Treats malformed/missing values as `baseBond` (covered by `_parseUint` fallback). |
| **CCIP-Read gateway** | Reads MongoDB; signs responses; serves external ENS queries via `ReckonWildcardResolver`. |

If any actor breaks, document the failure mode here and update before mainnet deploy.
