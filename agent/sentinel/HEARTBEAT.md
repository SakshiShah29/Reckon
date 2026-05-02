---
interval: 30
---

## Periodic Tasks

Every heartbeat cycle:

1. **Health Check** — Verify Base RPC is responsive. Verify 0G Compute broker has sufficient balance (alert if < 0.5 0G remaining).
2. **Fill Scan** — Poll FillRegistry for any `FillRecorded` events missed since last heartbeat (gap detection). Process any missed fills through the standard triage → EBBO → decide pipeline.
3. **Claim Cleanup** — Check 0G Storage KV for expired claims (past deadline) that were never submitted. Log as `claim_expired_unsubmitted` for debugging.
4. **Stats Log** — Print summary: fills processed, challenges submitted, slashes won, current 0G Compute balance.
