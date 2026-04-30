# Multi-Agent Setup Guide

Run 3 challenger agents locally with AXL hub-and-spoke mesh coordination.

## Architecture

```
AXL Hub (port 9002, listens :9001)
  ├── AXL Spoke A (port 9012, peers to hub)
  └── AXL Spoke B (port 9022, peers to hub)

Agent 1 → AXL Hub    (token 0, axl-identity-1.pem)
Agent 2 → AXL Spoke A (token 1, axl-identity-2.pem)
Agent 3 → AXL Spoke B (token 2, axl-identity-3.pem)
```

Each agent has its own:
- Ed25519 PEM key (AXL identity)
- iNFT on 0G Galileo (ChallengerNFT)
- Wallet with USDC on Anvil fork
- AXL node on a different port
- Challenger registration in ChallengerRegistry

## Prerequisites

1. Anvil fork running on `147.182.164.208:8545`
2. Core contracts deployed (DeployBase.s.sol)
3. ChallengerNFT deployed on 0G Galileo
4. Indexer running
5. Solver running
6. Agent 1 (token 0) already provisioned

## Steps

### Step 1: Build AXL from source
```bash
cd multi-agent && bash scripts/01-build-axl.sh
```

### Step 2: Generate PEM keys + derive public keys
```bash
bash scripts/02-generate-keys.sh
```

### Step 3: Provision agents 2 & 3 (mint iNFTs)
```bash
bash scripts/03-provision-agents.sh
```

### Step 4: Fund agents 2 & 3 with USDC
```bash
bash scripts/04-fund-agents.sh
```

### Step 5: Start AXL mesh (3 nodes)
```bash
bash scripts/05-start-axl-mesh.sh
```

### Step 6: Update .env files with AXL peer keys + start agents
```bash
# In 3 separate terminals:
cd agent && env $(cat ../multi-agent/envs/agent1.env | xargs) npm run start
cd agent && env $(cat ../multi-agent/envs/agent2.env | xargs) npm run start
cd agent && env $(cat ../multi-agent/envs/agent3.env | xargs) npm run start
```

### Step 7: Trigger a bad fill to test coordination
```bash
bash scripts/07-trigger-bad-fill.sh
```
