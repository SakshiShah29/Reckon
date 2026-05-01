const TOKEN_MAP: Record<string, { symbol: string; decimals: number }> = {
  "0x868d2ea6d9885e3909ab82a9b5ac1ee02d50cf93": { symbol: "USDC", decimals: 6 },
  "0xb8d5d470ffc5d08cf3b0be5f6bce8dff54cc84d8": { symbol: "WETH", decimals: 18 },
};

export function resolveToken(addr: string) {
  return TOKEN_MAP[addr.toLowerCase()] ?? { symbol: addr.slice(0, 6) + "\u2026", decimals: 18 };
}

export function formatAmount(raw: string, decimals: number): string {
  const n = Number(BigInt(raw)) / 10 ** decimals;
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals <= 6 ? 2 : 6 });
}
