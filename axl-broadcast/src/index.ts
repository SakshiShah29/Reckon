/**
 * @reckon-protocol/axl-claim-broadcast
 *
 * First-claim-wins dedup over Gensyn AXL mesh for Reckon challenger agents.
 * Wraps the GossipSub fork pattern with claim signing, verification, and
 * the timer state machine for backoff/deadline semantics.
 *
 * Phase 2 Day 10-11 (Builder B) — implementation pending.
 * Phase 3 Day 17-18 (Builder B) — publish to npm.
 *
 * See gensyn-implementation-guide-v0.7.md §2-3 for the full design.
 */

export { AXL_CLAIM_TOPIC, AXL_BACKOFF_SECONDS, AXL_DEADLINE_SECONDS } from "@reckon-protocol/types";
export type { ClaimMessage, ClaimResult } from "@reckon-protocol/types";

// Placeholder: AxlClaimBroker will be implemented in Phase 2
// export { AxlClaimBroker } from "./broker.js";
