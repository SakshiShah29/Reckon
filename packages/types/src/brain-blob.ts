export interface SlashRecord {
  orderHash: `0x${string}`;
  slashAmountUSDC: string;
  timestamp: number;
  benchmarkPrice: string;
  actualPrice: string;
}

export interface EBBOThresholdPrefs {
  /** Minimum slash amount (in USDC atomic units) to justify challenge gas + bond risk */
  minSlash: string;
  /** Maximum percentage of bond to risk on a single challenge (0-100) */
  maxBondPct: number;
}

export interface ModelConfig {
  model: "Qwen3-32B" | "Qwen2.5-0.5B-Instruct";
  maxTokens: number;
}

export interface BrainBlob {
  /** Ed25519 private key for AXL identity, hex-encoded 32 bytes */
  axl_ed25519_secret: string;
  /** EBBO threshold preferences for challenge decision logic */
  ebbo_threshold_prefs: EBBOThresholdPrefs;
  /** KeeperHub API key, kh_-prefixed, per-agent */
  kh_api_key: string;
  /** 0G Compute model configuration */
  model_config: ModelConfig;
  /** Historical slash records for performance tracking */
  performance_history: SlashRecord[];
}

export interface SealedBrainBlob {
  /** AES-256-GCM encrypted brain blob */
  ciphertext: string; // base64
  /** 12-byte nonce used for AES-256-GCM */
  nonce: string; // base64
  /** 16-byte authentication tag */
  tag: string; // base64
  /** AES key wrapped under PBKDF2-derived key from owner's signature */
  wrappedKey: string; // base64
  /** Salt used for PBKDF2 key derivation */
  salt: string; // base64
}
