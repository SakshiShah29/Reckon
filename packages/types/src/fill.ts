export interface FillRecord {
  orderHash: `0x${string}`;
  filler: `0x${string}`;
  fillerNamehash: `0x${string}`;
  swapper: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  inputAmount: string;
  outputAmount: string;
  eboToleranceBps: number;
  fillBlock: number;
  fillTimestamp: number;
  challengeDeadline: number;
  txHash: `0x${string}`;
}

export interface ChallengeRecord {
  orderHash: `0x${string}`;
  challengerAddress: `0x${string}`;
  challengerNamehash: `0x${string}`;
  agentTokenId: string;
  benchmarkOutput: string;
  actualOutput: string;
  eboToleranceBps: number;
  succeeded: boolean;
  slashAmount?: string;
  challengeBlock: number;
  challengeTimestamp: number;
  txHash: `0x${string}`;
}

export interface SlashDocRecord {
  orderHash: `0x${string}`;
  solverNamehash: `0x${string}`;
  solverEnsName?: string;
  solverAddress?: string;
  reputationPenalty?: string;
  challengerNamehash: `0x${string}`;
  agentTokenId: string;
  slashAmount: string;
  swapperRestitution: string;
  ownerBounty: string;
  protocolCut: string;
  swapperAddress?: string;
  ownerAddress?: string;
  protocolAddress?: string;
  challengerBond?: string;
  nlExplanation?: string;
  timestamp: number;
  txHash: `0x${string}`;
}

export interface ReputationUpdate {
  solverNamehash: `0x${string}`;
  reputationScore: string;
  totalFills: number;
  slashCount: number;
  lastSlashTimestamp?: number;
  updatedAt: number;
}

export interface OwnerAttestation {
  tokenId: string;
  owner: `0x${string}`;
  attestedAt: number;
  txHash: `0x${string}`;
}

export interface FillBatch {
  rootHash: string;
  firstOrderHash: `0x${string}`;
  lastOrderHash: `0x${string}`;
  recordCount: number;
  anchoredAt: number;
  txHash: `0x${string}`;
}
