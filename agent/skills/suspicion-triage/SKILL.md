---
name: suspicion-triage
description: Run a quick AI suspicion check on fills via 0G Compute (Qwen3-32B) before expensive EBBO computation.
version: 0.1.0
metadata:
  openclaw:
    requires:
      env:
        - ZG_RPC_URL
        - ZG_AGENT_PRIVATE_KEY
        - ZG_COMPUTE_PROVIDER_ADDRESS
      bins:
        - node
    primaryEnv: ZG_COMPUTE_PROVIDER_ADDRESS
    emoji: "mag"
---

## Instructions

This skill provides a fast, cheap pre-filter before running the full EBBO benchmark computation. It sends fill details to an LLM (Qwen3-32B on 0G Compute) and asks for a 0-1 suspicion score.

### When to use

Call this skill for every new `FillRecorded` event BEFORE running the `ebbo-check` skill. If the triage score is below 0.3, skip EBBO computation entirely — the fill is likely clean.

### How it works

1. Build a structured prompt with fill details (orderHash, amounts, tolerance, filler)
2. Send to 0G Compute via the serving broker + OpenAI SDK compatibility
3. Parse response: regex `/^\s*([01](?:\.\d+)?)/m` to extract the score
4. On parse failure: default to 0.5 (proceed to EBBO)

### Models

- **Primary**: `Qwen3-32B` (4 0G per million tokens) — drop the `Qwen/` prefix when calling
- **Fallback**: `Qwen2.5-0.5B-Instruct` (0.5 0G per million tokens) — used if primary fails

### 0G Compute integration

The broker is initialized via `@0glabs/0g-serving-broker`:
```
createZGComputeNetworkBroker(wallet) → broker
broker.inference.getServiceMetadata(provider) → { endpoint }
broker.inference.getRequestHeaders(provider, prompt) → headers
OpenAI({ baseURL: endpoint + "/v1/proxy", defaultHeaders: headers })
broker.inference.processResponse(provider, completion) → settle payment
```

### Concurrency

Each provider sub-account supports only 1 concurrent request. The Reckon swarm provisions 3 sub-accounts (one per AXL node). Run `npm run provision` to set these up.

### Error handling

- Provider offline → return score 0.5, log warning, proceed to EBBO math
- Sub-account drained → return score 0.5, alert via dashboard
- Parse failure → return score 0.5
- **NEVER block the challenge pipeline** on triage failure
