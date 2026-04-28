# Reckon Contract Deployment

Two deploy scripts cover three targets: Base (anvil fork or mainnet) and 0G Galileo (ChallengerNFT only).

## Prerequisites

- Foundry installed (`forge`, `anvil`)
- `.env` file at repo root with the required keys (see below)
- For mainnet: funded deployer wallet, `BASESCAN_API_KEY` for verification

### Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANVIL` | No | `false` | Set `true` to fork Base into anvil and run seeding |
| `OWNER` | No | deployer | Admin/owner of all contracts |
| `RELAYER` | No | deployer | Relayer EOA for SolverRegistry, ChallengerRegistry |
| `ATTESTER` | No | relayer | Attester EOA for OwnerRegistry |
| `RECORDER` | No | relayer | Recorder EOA for FillRegistry |
| `TREASURY` | No | owner | Protocol treasury for slashed bonds and forfeited challenger bonds |
| `ADMIN` | No | deployer | Admin for ChallengerNFT on 0G Galileo |
| `STORAGE_INFO` | No | `""` | Storage info string for ChallengerNFT |
| `BASESCAN_API_KEY` | Mainnet only | - | For contract verification on Basescan |

---

## 1. Base — Anvil fork (local dev)

Starts a local anvil instance forking Base mainnet, deploys all contracts, wires them, and seeds test data.

```bash
# Terminal 1: start anvil
anvil --fork-url https://mainnet.base.org

# Terminal 2: deploy
ANVIL=true forge script script/DeployBase.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --broadcast
```

### What the anvil seed does

1. Deploys all 9 contracts in dependency order
2. Wires post-deploy setters (`setChallenger`, `setFillRegistry`, `setRoyaltyDistributor`, `setSolverBondVault`)
3. Proposes the 3 canonical USDC/WETH v3 pool list on EBBOOracle, fast-forwards past the 48h timelock, and commits
4. Registers test solvers (`alice`, `bob`) and a challenger (`eve`)
5. Seeds reputation text records (`reckon.reputation`) on SolverRegistry
6. Funds test EOAs with 100k USDC each
7. Deposits 50k USDC bonds for each solver
8. Attests NFT ownership (tokenId 1 -> eve) on OwnerRegistry

### Seeded test accounts

| Name | Address | Role | Namehash |
|---|---|---|---|
| alice | `0x00000000000000000000000000000000000A11CE` | Solver | `keccak256("alice.solvers.reckon.eth")` |
| bob | `0x0000000000000000000000000000000000000B0B` | Solver | `keccak256("bob.solvers.reckon.eth")` |
| eve | `0x0000000000000000000000000000000000000E4E` | Challenger | `keccak256("eve.challengers.reckon.eth")` |

---

## 2. Base — Mainnet

Deploys all contracts and wires them. No seeding. The EBBO pool list is proposed but not committed (48h timelock must elapse, then call `commitPoolList` manually or via a follow-up script).

```bash
forge script script/DeployBase.s.sol \
  --rpc-url base \
  --broadcast \
  --verify \
  --etherscan-api-key $BASESCAN_API_KEY
```

### Post-deploy manual steps

1. **Wait 48 hours**, then call `ebboOracle.commitPoolList(USDC, WETH)` to activate the pool list
2. Register solvers and challengers via the relayer (`solverRegistry.register(...)`, `challengerRegistry.register(...)`)
3. Set the `ReckonWildcardResolver` as the resolver for `reckon.eth` on ENS (separate Ethereum mainnet tx)

### Dry run (simulation only)

```bash
forge script script/DeployBase.s.sol \
  --rpc-url base \
  --simulate
```

---

## 3. 0G Galileo — ChallengerNFT

Deploys MockVerifier and ChallengerNFT (implementation + ERC1967 proxy) on 0G Galileo testnet.

```bash
forge script script/DeployZGGalileo.s.sol \
  --rpc-url zg_galileo \
  --broadcast
```

This deploys:
- `MockVerifier` — accepts all proofs without verification (demo only)
- `ChallengerNFT` implementation contract
- `ERC1967Proxy` pointing at the implementation, initialized with name "Reckon Challenger" / symbol "RECK"

### Post-deploy

1. Mint challenger iNFTs via `nft.mintWithRole(to, uri)` (requires MINTER_ROLE)
2. The relayer subscribes to `Transfer` events on Galileo and calls `OwnerRegistry.attestOwner(tokenId, newOwner)` on Base

---

## Contract dependency graph

```
OwnerRegistry          (standalone)
SolverRegistry         (standalone)
ChallengerRegistry     (standalone)
EBBOOracle             (standalone, pool list timelocked)
    |
SolverBondVault        (needs: USDC, SolverRegistry)
    |                   post-deploy: setFillRegistry, setRoyaltyDistributor, setChallenger
FillRegistry           (needs: SolverRegistry, SolverBondVault, recorder)
    |                   post-deploy: setChallenger
RoyaltyDistributor     (needs: USDC, OwnerRegistry, FillRegistry, treasury)
    |                   post-deploy: setSolverBondVault
ReckonValidator        (needs: SolverRegistry)
    |
Challenger             (needs: FillRegistry, EBBOOracle, SolverBondVault, OwnerRegistry,
                         SolverRegistry, ChallengerRegistry, Permit2, USDC, treasury)
```

## RPC endpoints (foundry.toml)

| Alias | URL |
|---|---|
| `base` | `https://mainnet.base.org` |
| `zg_galileo` | `https://evmrpc-testnet.0g.ai` |
