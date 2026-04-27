import type { SlashDocRecord } from "@reckon-protocol/types";

interface SlashFeedProps {
  slashes: SlashDocRecord[];
}

export function SlashFeed({ slashes }: SlashFeedProps) {
  if (slashes.length === 0) {
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
        No slashes yet. All solvers behaving... for now.
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
      {slashes.map((slash) => (
        <div
          key={`${slash.orderHash}-${slash.timestamp}`}
          style={{
            padding: "12px",
            backgroundColor: "#1a0a0a",
            borderRadius: "8px",
            border: "1px solid #3a1a1a",
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
            <span style={{ color: "#ef4444", fontWeight: 600 }}>
              SLASHED
            </span>
            <span style={{ color: "#555" }}>
              {new Date(slash.timestamp * 1000).toLocaleTimeString()}
            </span>
          </div>
          <div style={{ color: "#fca5a5", marginBottom: "4px" }}>
            {formatUSDC(slash.slashAmount)} USDC slashed
          </div>
          <div style={{ display: "flex", gap: "12px", color: "#888", fontSize: "11px" }}>
            <span>Swapper: {formatUSDC(slash.swapperRestitution)}</span>
            <span>Owner: {formatUSDC(slash.ownerBounty)}</span>
            <span>Protocol: {formatUSDC(slash.protocolCut)}</span>
          </div>
          {slash.nlExplanation && (
            <div
              style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "#aaa",
                fontStyle: "italic",
              }}
            >
              {slash.nlExplanation}
            </div>
          )}
          <div
            style={{
              marginTop: "4px",
              fontSize: "11px",
              color: "#555",
              fontFamily: "monospace",
            }}
          >
            Order: {slash.orderHash.slice(0, 10)}...
            {" | "}Agent #{slash.agentTokenId}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatUSDC(amount: string): string {
  const val = Number(BigInt(amount)) / 1e6;
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
