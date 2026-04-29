"use client";

export function IndexerHealth() {
  return (
    <div className="card p-4 bg-gradient-to-br from-[#141414] to-[#0f1a14] border-[#1a3a2a] relative overflow-hidden">
      {/* "Card" styling like Visa card */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-[10px] text-[#00D4AA] bg-[#00D4AA]/10 px-2 py-0.5 rounded font-medium flex items-center gap-1.5">
          <span className="live-dot" style={{ width: 6, height: 6 }} />
          Live
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#00D4AA" strokeWidth="1.5" opacity="0.5">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
        </svg>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[10px] text-[#555] uppercase tracking-wider mb-1">Indexer Health</p>
          <p className="text-white font-mono text-xl tracking-wide">04 : 23 : 12 <span className="text-[#555] text-[11px] font-sans">uptime</span></p>
        </div>

        <div className="space-y-2 pt-2 border-t border-[#1a1a1a]">
          <Row label="Last block" value="45,231,456" />
          <Row label="Lag" value="2 blocks" color="green" />
          <Row label="Batcher" value="3 records" color="amber" />
          <Row label="RPC" value="Alchemy" />
        </div>
      </div>

      {/* Decorative glow */}
      <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-[#00D4AA] rounded-full opacity-[0.03] blur-2xl" />
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const c = color === "green" ? "text-[#34d399]" : color === "amber" ? "text-[#f59e0b]" : "text-[#ccc]";
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-[#555]">{label}</span>
      <span className={`font-mono ${c}`}>{value}</span>
    </div>
  );
}
