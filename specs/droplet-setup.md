# Droplet Setup — Anvil Fork on DigitalOcean

**Droplet IP:** `147.182.164.208`
**Anvil RPC:** `http://147.182.164.208:8545`
**Chain ID:** 8453 (Base mainnet fork)

---

## Initial Setup (already done)

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
source ~/.bashrc
foundryup

# Start Anvil fork (background, survives SSH disconnect)
export BASE_RPC=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
nohup anvil --fork-url $BASE_RPC --host 0.0.0.0 --port 8545 > anvil.log 2>&1 &

# Open firewall
ufw allow 8545/tcp
```

---

## Adding a Teammate

### Step 1: Teammate generates SSH key (on their machine)

```bash
ssh-keygen -t ed25519 -C "their-email@example.com"
# Hit Enter for all prompts (default location, no passphrase is fine)
```

### Step 2: Teammate sends you their public key

```bash
cat ~/.ssh/id_ed25519.pub
# Output looks like: ssh-ed25519 AAAAC3Nza...longstring... their-email@example.com
```

### Step 3: Add their key to the Droplet

```bash
# SSH into the Droplet
ssh root@147.182.164.208

# Paste their public key
echo "ssh-ed25519 AAAAC3Nza...their-key..." >> ~/.ssh/authorized_keys
```

### Step 4: Teammate connects

```bash
ssh root@147.182.164.208
```

---

## After Anvil Restart

Every Anvil restart wipes all state. Run these after each restart:

```bash
# 1. Redeploy contracts
cd packages/contracts
forge script script/DeployBase.s.sol --rpc-url http://147.182.164.208:8545 --broadcast

# 2. Fund KeeperHub wallet (0xC204...0bf8) with 100 ETH
curl -X POST http://147.182.164.208:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"anvil_setBalance","params":["0xC204c6FEC66FbFa5467B8080638C939DF9850bf8","0x56BC75E2D63100000"],"id":1}'

# 3. Re-set KeeperHub custom RPC (if it was deleted)
# Run in browser DevTools Console on app.keeperhub.com:
# fetch('/api/user/rpc-preferences/8453', {
#   method: 'PUT',
#   headers: { 'Content-Type': 'application/json' },
#   body: JSON.stringify({ primaryRpcUrl: 'http://147.182.164.208:8545', fallbackRpcUrl: '' })
# }).then(r => r.json()).then(console.log)
```

---

## Useful Commands

```bash
# Check if Anvil is running
curl -s -X POST http://147.182.164.208:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","id":1}' | jq '.result'
# Expected: "0x2105" (8453)

# Check current fork block
curl -s -X POST http://147.182.164.208:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","id":1}' | jq '.result'

# Check any address balance
curl -s -X POST http://147.182.164.208:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["0xADDRESS","latest"],"id":1}' | jq '.result'

# Fund any address with ETH (Anvil-only)
curl -X POST http://147.182.164.208:8545 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"anvil_setBalance","params":["0xADDRESS","0x56BC75E2D63100000"],"id":1}'

# View Anvil logs
ssh root@147.182.164.208 "tail -100 anvil.log"

# Restart Anvil
ssh root@147.182.164.208 "pkill anvil; nohup anvil --fork-url \$BASE_RPC --host 0.0.0.0 --port 8545 > anvil.log 2>&1 &"
```
