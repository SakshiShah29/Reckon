// ── Chain IDs ───────────────────────────────────────────────────
export const BASE_MAINNET_CHAIN_ID = 8453;
export const ZG_GALILEO_CHAIN_ID = 16602;

// ── UniswapX ────────────────────────────────────────────────────
export const PRIORITY_ORDER_REACTOR = "0x000000001Ec5656dcdB24D90DFa42742738De729" as const;
export const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

// ── Uniswap v4 ──────────────────────────────────────────────────
export const V4_POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b" as const;
export const V4_STATE_VIEW = "0xa3c0c9b65bad0b08107aa264b0f3db444b867a71" as const;

// ── Token addresses on Base ─────────────────────────────────────
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const WETH_BASE = "0x4200000000000000000000000000000000000006" as const;

// ── EBBO Oracle: top-3 USDC/WETH pools on Base by TVL ──────────
// These are v3 pools; v4 pool IDs added when confirmed in Phase 0
export const CANONICAL_POOLS_USDC_WETH: readonly `0x${string}`[] = [
  "0xd0b53D9277642d899DF5C87A3966A349A798F224", // Uniswap v3 USDC/WETH 0.05%
  "0x4C36388bE6F416A29C8d8Eee81C771cE6bE14B18", // Uniswap v3 USDC/WETH 0.3%
  "0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C", // Uniswap v3 USDC/WETH 1%
] as const;

// ── EBBO Oracle params ──────────────────────────────────────────
export const EBBO_POOL_COUNT = 3;
export const EBBO_PRECISION = 10n ** 18n; // 1e18

// ── Bond params ─────────────────────────────────────────────────
export const BASE_BOND_USDC = 1000n * 10n ** 6n; // 1000 USDC (6 decimals)
export const MIN_BOND_USDC = 100n * 10n ** 6n;   // 100 USDC at rep 1.0
export const CHALLENGER_BOND_PCT = 10; // 10% of solver bond

// ── Challenge timing ────────────────────────────────────────────
export const CHALLENGE_WINDOW_BLOCKS = 1800; // ~30 min on Base (1s blocks)

// ── Slash distribution (basis points) ───────────────────────────
export const SLASH_SWAPPER_BPS = 6000;  // 60%
export const SLASH_OWNER_BPS = 3000;    // 30%
export const SLASH_PROTOCOL_BPS = 1000; // 10%

// ── AXL mesh ────────────────────────────────────────────────────
export const AXL_CLAIM_TOPIC = "reckon/claim/v1";
export const AXL_BACKOFF_SECONDS = 30;
export const AXL_DEADLINE_SECONDS = 60;
export const AXL_KV_VERIFY_TIMEOUT_MS = 2500;

// ── 0G Galileo ──────────────────────────────────────────────────
export const ZG_FLOW_CONTRACT = "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296" as const;
export const ZG_COMPUTE_LEDGER = "0xE70830508dAc0A97e6c087c75f402f9Be669E406" as const;

// ── 0G Storage KV ───────────────────────────────────────────────
// Single protocol-wide streamId for claim_state
// Derived: keccak256("reckon/claim_state/v1")
export const CLAIM_STATE_STREAM_ID = "0x7265636b6f6e2f636c61696d5f73746174652f7631000000000000000000000000" as const;

// ── 0G Compute models ───────────────────────────────────────────
export const PRIMARY_MODEL = "Qwen3-32B" as const;
export const FALLBACK_MODEL = "Qwen2.5-0.5B-Instruct" as const;

// ── Fill batching ───────────────────────────────────────────────
export const FILL_BATCH_SIZE = 50;
export const FILL_BATCH_INTERVAL_MS = 60_000; // 60 seconds

// ── ENS ─────────────────────────────────────────────────────────
export const ENS_PARENT_NAME = "reckon.eth";
export const SOLVERS_PARENT = "solvers.reckon.eth";
export const CHALLENGERS_PARENT = "challengers.reckon.eth";

// ── Reputation ──────────────────────────────────────────────────
export const REP_TEXT_KEY = "reckon.reputation";
export const REP_TOTAL_FILLS_KEY = "reckon.totalFills";
export const REP_SLASH_COUNT_KEY = "reckon.slashCount";
export const REP_LAST_SLASH_KEY = "reckon.lastSlash";

// ── MongoDB collections ─────────────────────────────────────────
export const MONGO_DB_NAME = "reckon";
export const MONGO_COLLECTIONS = {
  fills: "fills",
  challenges: "challenges",
  slashes: "slashes",
  reputationUpdates: "reputation_updates",
  ownerAttestations: "owner_attestations",
  fillBatches: "fill_batches",
} as const;
