export interface ClaimMessage {
  /** 32-byte orderHash of the UniswapX fill being claimed */
  orderHash: `0x${string}`;
  /** iNFT tokenId on 0G Galileo */
  agentTokenId: bigint;
  /** Unix seconds, sender's local clock */
  claimedAt: number;
  /** Unix seconds, when this claim expires */
  deadline: number;
  /** Ed25519 signature over keccak256(orderHash || tokenId || claimedAt || deadline) */
  signature: `0x${string}`;
}

export interface ClaimResult {
  outcome: "won" | "lost_to_peer" | "lost_to_kv" | "timeout";
  orderHash: `0x${string}`;
  winnerTokenId?: bigint;
}
