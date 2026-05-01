"use client";

const infts = [
  {
    tokenId: 0,
    owner: "0x9fE4…6D12",
    brainRoot: "0xf9b98c78…",
    model: "qwen-2.5-7b-instruct",
    minSlashThreshold: "500,000 USDC",
    historicalSlashes: 0,
    sealed: true,
  },
  {
    tokenId: 2,
    owner: "0xA3b1…8E07",
    brainRoot: "0x3f4662c8…",
    model: "GLM-5-FP8",
    minSlashThreshold: "500,000 USDC",
    historicalSlashes: 0,
    sealed: true,
  },
  {
    tokenId: 3,
    owner: "0x7c2D…F490",
    brainRoot: "0x8a89df0a…",
    model: "GLM-5-FP8",
    minSlashThreshold: "500,000 USDC",
    historicalSlashes: 0,
    sealed: true,
  },
];

const accentColors = ["#00D4AA", "#6366f1", "#a78bfa"];

export function ZeroGInft() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white text-[14px] font-medium">iNFT Registry — ChallengerNFT</p>
          <p className="text-[11px] text-[#555] mt-0.5">On-chain iNFT tokens with sealed brain blobs</p>
        </div>
        <span className="text-[10px] font-medium text-[#00D4AA] bg-[#00D4AA]/10 px-2 py-0.5 rounded">
          0G Galileo (16602)
        </span>
      </div>

      {/* Contract address */}
      <div className="flex items-center gap-2 mb-4 bg-[#1a1a1a] rounded-lg px-3 py-2">
        <span className="text-[10px] text-[#555]">Contract:</span>
        <span className="text-[11px] font-mono text-[#6366f1]">0x98b6D753…8582a0</span>
        <button className="text-[10px] text-[#555] hover:text-[#888] transition-colors ml-auto">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      </div>

      {/* iNFT Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {infts.map((nft, i) => (
          <div
            key={nft.tokenId}
            className="bg-[#1a1a1a] rounded-lg p-4 border border-[#222] relative overflow-hidden"
          >
            {/* Top accent gradient */}
            <div
              className="absolute top-0 left-0 right-0 h-[2px]"
              style={{
                background: `linear-gradient(90deg, ${accentColors[i]}88, ${accentColors[i]}22)`,
              }}
            />

            <div className="flex items-center justify-between mb-3">
              <span className="text-[14px] text-white font-semibold">Token #{nft.tokenId}</span>
              <span
                className="text-[10px] font-medium px-2 py-0.5 rounded"
                style={{
                  color: nft.sealed ? "#34d399" : "#f59e0b",
                  backgroundColor: nft.sealed ? "#34d39915" : "#f59e0b15",
                }}
              >
                {nft.sealed ? "Sealed" : "Unsealed"}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#555]">Owner</span>
                <span className="text-[11px] font-mono text-[#a78bfa]">{nft.owner}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#555]">Brain Root</span>
                <span className="text-[11px] font-mono text-[#6366f1]">{nft.brainRoot}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#555]">Model</span>
                <span className="text-[11px] font-mono text-[#888]">{nft.model}</span>
              </div>

              <div className="border-t border-[#222] pt-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#555]">Min Slash</span>
                  <span className="text-[11px] text-[#ccc]">{nft.minSlashThreshold}</span>
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-[10px] text-[#555]">Historical Slashes</span>
                  <span
                    className="text-[11px] font-medium"
                    style={{ color: nft.historicalSlashes > 0 ? "#ef4444" : "#34d399" }}
                  >
                    {nft.historicalSlashes}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
