import type { FillRecord } from "@reckon-protocol/types";

interface FillFeedProps {
  fills: FillRecord[];
}

export function FillFeed({ fills }: FillFeedProps) {
  if (fills.length === 0) {
    return (
      <div
        style={{
          padding: "24px",
          backgroundColor: "#141414",
          borderRadius: "8px",
          border: "1px solid #222",
          color: "#555",
          textAlign: "center",
        }}
      >
        No fills recorded yet. Waiting for FillRecorded events...
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {fills.map((fill) => (
        <div
          key={fill.orderHash}
          style={{
            padding: "12px",
            backgroundColor: "#141414",
            borderRadius: "8px",
            border: "1px solid #222",
            fontSize: "13px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "4px",
            }}
          >
            <span style={{ color: "#6366f1", fontFamily: "monospace" }}>
              {fill.orderHash.slice(0, 10)}...{fill.orderHash.slice(-6)}
            </span>
            <span style={{ color: "#555" }}>block {fill.fillBlock}</span>
          </div>
          <div style={{ display: "flex", gap: "16px", color: "#aaa" }}>
            <span>
              In: {formatAmount(fill.inputAmount, fill.tokenIn)}
            </span>
            <span>
              Out: {formatAmount(fill.outputAmount, fill.tokenOut)}
            </span>
            <span>Tolerance: {fill.eboToleranceBps}bp</span>
          </div>
          <div
            style={{
              marginTop: "4px",
              fontSize: "11px",
              color: "#555",
              fontFamily: "monospace",
            }}
          >
            Solver: {fill.fillerNamehash.slice(0, 14)}...
          </div>
        </div>
      ))}
    </div>
  );
}

function formatAmount(amount: string, token: string): string {
  // Simple formatting — USDC has 6 decimals, WETH has 18
  const isUSDC = token.toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
  const decimals = isUSDC ? 6 : 18;
  const val = Number(BigInt(amount)) / Math.pow(10, decimals);
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: isUSDC ? 2 : 6,
  });
}
