interface StatsBarProps {
  totalFills: number;
  totalChallenges: number;
  totalSlashes: number;
  totalSlashedUSDC: number;
}

export function StatsBar({
  totalFills,
  totalChallenges,
  totalSlashes,
  totalSlashedUSDC,
}: StatsBarProps) {
  const stats = [
    { label: "Total Fills", value: totalFills.toLocaleString() },
    { label: "Challenges", value: totalChallenges.toLocaleString() },
    { label: "Slashes", value: totalSlashes.toLocaleString() },
    {
      label: "Total Slashed",
      value: `$${totalSlashedUSDC.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: "16px",
      }}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          style={{
            padding: "16px",
            backgroundColor: "#141414",
            borderRadius: "8px",
            border: "1px solid #222",
          }}
        >
          <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
            {stat.label}
          </div>
          <div style={{ fontSize: "24px", fontWeight: 600, color: "#fff" }}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
