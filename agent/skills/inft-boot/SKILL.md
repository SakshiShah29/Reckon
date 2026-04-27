---
name: inft-boot
description: Boot the challenger agent by downloading and decrypting its iNFT brain blob from 0G Galileo Storage.
version: 0.1.0
metadata:
  openclaw:
    requires:
      env:
        - ZG_INDEXER_URL
        - ZG_AGENT_PRIVATE_KEY
        - AGENT_TOKEN_ID
        - OWNER_SIGNATURE
      bins:
        - node
    primaryEnv: OWNER_SIGNATURE
    emoji: "brain"
---

## Instructions

This skill handles the challenger agent's boot sequence. It downloads the encrypted brain blob from 0G Galileo Storage and decrypts it using the owner's signature.

### What the brain blob contains

- `axl_ed25519_secret` — Ed25519 private key for AXL mesh identity (hex, 32 bytes)
- `ebbo_threshold_prefs` — Minimum slash amount and max bond percentage for challenge decisions
- `kh_api_key` — KeeperHub API key (kh_-prefixed) for challenge submission
- `model_config` — 0G Compute model selection (Qwen3-32B primary, Qwen2.5-0.5B-Instruct fallback)
- `performance_history` — Historical slash records for performance tracking

### Boot flow

1. Read `BRAIN_ROOT_HASH` env var (or query iNFT tokenURI from ChallengerNFT on 0G Galileo)
2. Download sealed brain blob from 0G Storage via `indexer.download(rootHash, path, true)` — `withProof=true` verifies Merkle root
3. Decrypt using AES-256-GCM with PBKDF2 key derivation (100k iterations, SHA-256) from owner's signature
4. Validate: `axl_ed25519_secret` is 64 hex chars, `kh_api_key` starts with `kh_`, model config is valid
5. Return the decrypted `BrainBlob` for use by other skills

### Usage

```bash
node --import tsx src/boot.ts
```

### Error handling

- If `BRAIN_ROOT_HASH` is not set and on-chain read is not yet implemented, the agent exits with an error
- If decryption fails (wrong owner signature), the agent exits — do NOT run with default config in production
- In development, headless mode is available with fallback defaults
