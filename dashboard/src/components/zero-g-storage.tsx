"use client";

const brainBlobs = [
  {
    agent: "Agent #0",
    rootHash: "0xf9b98c78…",
    model: "qwen-2.5-7b-instruct",
    status: "Decrypted" as const,
    nodesFound: 4,
    nodesSelected: 2,
    downloadTime: "3.2s",
    encryption: "AES-256-GCM",
  },
  {
    agent: "Agent #2",
    rootHash: "0x3f4662c8…",
    model: "GLM-5-FP8",
    status: "Decrypted" as const,
    nodesFound: 4,
    nodesSelected: 2,
    downloadTime: "2.8s",
    encryption: "AES-256-GCM",
  },
  {
    agent: "Agent #3",
    rootHash: "0x8a89df0a…",
    model: "GLM-5-FP8",
    status: "Decrypted" as const,
    nodesFound: 4,
    nodesSelected: 2,
    downloadTime: "4.1s",
    encryption: "AES-256-GCM",
  },
];

const kvOperations = [
  { op: "write", key: "fill:0x8a3f…c912", agent: "Agent #0", status: "Success" as const, reason: "", time: "2m ago" },
  { op: "read", key: "score:0xd1b7…4e08", agent: "Agent #2", status: "Success" as const, reason: "", time: "5m ago" },
  { op: "write", key: "fill:0xf204…7b3c", agent: "Agent #3", status: "Failed" as const, reason: "insufficient funds", time: "9m ago" },
  { op: "read", key: "slash:0x61aa…de90", agent: "Agent #0", status: "Success" as const, reason: "", time: "14m ago" },
];

export function ZeroGStorage() {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-white text-[14px] font-medium">0G Storage — Brain Blobs & KV State</p>
          <p className="text-[11px] text-[#555] mt-0.5">Decentralized storage layer for agent brain data and claim state</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="live-dot" />
          <span className="text-[11px] text-[#555]">Synced</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Brain Blob Downloads — Left */}
        <div className="bg-[#1a1a1a] rounded-lg p-4">
          <p className="text-[12px] text-[#888] font-medium mb-3">Brain Blob Downloads</p>
          <div className="space-y-3">
            {brainBlobs.map((blob, i) => (
              <div key={i} className="bg-[#141414] rounded-lg p-3 border border-[#222]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-white font-medium">{blob.agent}</span>
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded"
                    style={{
                      color: blob.status === "Decrypted" ? "#34d399" : "#f59e0b",
                      backgroundColor: blob.status === "Decrypted" ? "#34d39915" : "#f59e0b15",
                    }}
                  >
                    {blob.status}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#555]">Root Hash</span>
                    <span className="text-[11px] font-mono text-[#6366f1]">{blob.rootHash}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#555]">Model</span>
                    <span className="text-[11px] font-mono text-[#888]">{blob.model}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#555]">Storage Nodes</span>
                    <span className="text-[11px] text-[#888]">{blob.nodesFound} found, {blob.nodesSelected} selected</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#555]">Download Time</span>
                    <span className="text-[11px] text-[#888]">{blob.downloadTime}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#555]">Encryption</span>
                    <span className="text-[11px] font-mono text-[#a78bfa]">{blob.encryption}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KV Claim State — Right */}
        <div className="bg-[#1a1a1a] rounded-lg p-4">
          <p className="text-[12px] text-[#888] font-medium mb-2">KV Claim State</p>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] text-[#555]">Stream ID:</span>
            <span className="text-[11px] font-mono text-[#6366f1] bg-[#6366f115] px-2 py-0.5 rounded">0x7265636b6f6e…</span>
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-[#141414] rounded-lg px-3 py-2 border border-[#222]">
              <p className="text-[9px] text-[#555] uppercase tracking-wider">Writes (24h)</p>
              <p className="text-white text-lg font-medium">842</p>
            </div>
            <div className="bg-[#141414] rounded-lg px-3 py-2 border border-[#222]">
              <p className="text-[9px] text-[#555] uppercase tracking-wider">Reads (24h)</p>
              <p className="text-white text-lg font-medium">3,107</p>
            </div>
          </div>

          {/* KV Operations table */}
          <p className="text-[11px] text-[#555] mb-2">Recent Operations</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#222]">
                  <th className="text-[9px] text-[#555] uppercase tracking-wider pb-2 font-medium">Op</th>
                  <th className="text-[9px] text-[#555] uppercase tracking-wider pb-2 font-medium">Key</th>
                  <th className="text-[9px] text-[#555] uppercase tracking-wider pb-2 font-medium">Agent</th>
                  <th className="text-[9px] text-[#555] uppercase tracking-wider pb-2 font-medium">Status</th>
                  <th className="text-[9px] text-[#555] uppercase tracking-wider pb-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {kvOperations.map((op, i) => (
                  <tr key={i} className="border-b border-[#1e1e1e] hover:bg-[#141414] transition-colors">
                    <td className="py-2">
                      <span
                        className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded"
                        style={{
                          color: op.op === "write" ? "#00D4AA" : "#a78bfa",
                          backgroundColor: op.op === "write" ? "#00D4AA15" : "#a78bfa15",
                        }}
                      >
                        {op.op}
                      </span>
                    </td>
                    <td className="py-2 text-[11px] font-mono text-[#888]">{op.key}</td>
                    <td className="py-2 text-[11px] text-[#ccc]">{op.agent}</td>
                    <td className="py-2">
                      <span className="text-[10px] font-medium" style={{ color: op.status === "Success" ? "#34d399" : "#ef4444" }}>
                        {op.status}
                      </span>
                      {op.reason && <span className="text-[9px] text-[#555] ml-1">({op.reason})</span>}
                    </td>
                    <td className="py-2 text-[10px] text-[#555]">{op.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
