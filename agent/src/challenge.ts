// Re-exports from split modules (decide.ts + submit.ts).
// New code should import from those modules directly.
export { decideChallenge, type ChallengeDecision } from "./decide.js";
export { submitChallenge, type SubmitResult, type SubmitConfig } from "./submit.js";
