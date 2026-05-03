"use client";

import { useEffect, useState } from "react";

const ZG_LOGO = "/logos/0g.svg";

const ExternalIcon = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline-block ml-1 opacity-50">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
);

interface ZeroGData {
  brainBlobs: any[];
  fillBatches: any[];
  compute: any;
  kv: any;
  inftRegistry: any;
  explorers: any;
  recentChallenges: any[];
  recentSlashes: any[];
}

const sh = (h: string, n = 6) =>
  !h || h.length < n * 2 + 4 ? (h ?? "") : `${h.slice(0, n + 2)}...${h.slice(-n)}`;
const usd = (r: string) => (Number(r) / 1e6).toFixed(2);
const ago = (ts: number) => {
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
};

/* ── Skeleton ── */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-lg animate-pulse bg-[#E2E8F0] ${className}`} />;
}

function SkeletonPage() {
  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      <Skeleton className="w-40 h-7 mb-2" />
      <Skeleton className="w-72 h-4 mb-6" />
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-5">
            <Skeleton className="w-24 h-3 mb-3" />
            <Skeleton className="w-16 h-8" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-4 mb-5">
        <div className="col-span-3 card p-6">
          <Skeleton className="w-28 h-5 mb-4" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl p-4">
                <Skeleton className="w-10 h-10 !rounded-xl mb-3" />
                <Skeleton className="w-24 h-4 mb-2" />
                <Skeleton className="w-full h-3" />
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-2 card p-6">
          <Skeleton className="w-24 h-5 mb-4" />
          <Skeleton className="w-full h-14 mb-3 !rounded-xl" />
          <Skeleton className="w-full h-14 !rounded-xl" />
        </div>
      </div>
      <div className="card p-6">
        <Skeleton className="w-28 h-5 mb-4" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-6 mb-3">
            <Skeleton className="w-36 h-4" />
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-16 h-4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ZeroGPage() {
  const [data, setData] = useState<ZeroGData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/zero-g")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonPage />;

  if (error)
    return (
      <div className="px-6 py-6 max-w-7xl mx-auto">
        <div className="card p-5">
          <p className="text-red-500 text-sm font-medium">{error}</p>
        </div>
      </div>
    );

  if (!data) return null;

  const total = data.recentSlashes.reduce(
    (s: number, x: any) => s + Number(x.slashAmount || 0), 0,
  );

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-end justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="icon-circle bg-[#0A0A0A]">
            <img src="/logos/0g-light.svg" alt="0G" className="h-5" />
          </div>
          <div>
            <h1
              className="text-[28px] font-extrabold text-[#1E293B] tracking-tight"
              style={{ fontFamily: "var(--font-heading)" }}
            >
              0G Integration
            </h1>
            <p className="text-[14px] text-[#64748B] mt-0.5 font-medium">
              iNFTs, decentralized storage, compute models & KV state on 0G Galileo
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a href={data.explorers.storageScan} target="_blank" rel="noopener noreferrer" className="link-badge">
            StorageScan <ExternalIcon />
          </a>
          <a href={data.explorers.contractUrl} target="_blank" rel="noopener noreferrer" className="link-badge">
            ChainScan <ExternalIcon />
          </a>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Storage Batches", value: data.fillBatches.length, color: "bg-[#EFF6FF]", border: "border-[#BFDBFE]", shadow: "card", icon: "storage" },
          { label: "Slashes", value: data.recentSlashes.length, color: "bg-[#FEF2F2]", border: "border-[#FECACA]", shadow: "card-pink", icon: "slash" },
          { label: "Total Slashed", value: `$${usd(String(total))}`, color: "bg-[#FDF2F8]", border: "border-[#FBCFE8]", shadow: "card-pink", icon: "dollar" },
        ].map((s) => (
          <div key={s.label} className={`card ${s.shadow} p-5`}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`w-8 h-8 rounded-lg ${s.color} ${s.border} border-2 flex items-center justify-center`}>
                {s.icon === "storage" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></svg>}
                {s.icon === "slash" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><line x1="15" y1="9" x2="9" y2="15" /></svg>}
                {s.icon === "dollar" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DB2777" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
              </div>
              <span className="text-[11px] text-[#64748B] font-semibold uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-[28px] font-extrabold text-[#1E293B] tracking-tight" style={{ fontFamily: "var(--font-heading)" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── iNFT Registry + Compute ── */}
      <div className="grid grid-cols-5 gap-4 mb-5">
        {/* iNFTs — 3 cols */}
        <div className="col-span-3 card card-violet p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[16px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
              iNFT Registry
            </h2>
            <a href={data.explorers.contractUrl} target="_blank" rel="noopener noreferrer" className="link-badge">
              {sh(data.inftRegistry.contract, 8)} <ExternalIcon />
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {data.inftRegistry.tokens.map((nft: any) => {
              const url = `${data.explorers.chainScan}/nft/${data.inftRegistry.contract}/${nft.tokenId}`;
              const model = 'qwen/qwen-2.5-7b-instruct'
              return (
                <div key={nft.tokenId} className="bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl p-4 hover:border-[#DDD6FE] transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
                      <div className="w-11 h-11 rounded-xl bg-[#8B5CF6] border-2 border-[#1E293B] shadow-[2px_2px_0_#1E293B] flex items-center justify-center text-white text-[13px] font-extrabold">
                        #{nft.tokenId}
                      </div>
                      <div>
                        <p className="text-[14px] text-[#1E293B] font-bold group-hover:text-[#7C3AED] transition-colors">{nft.name}</p>
                        <p className="text-[11px] font-mono text-[#94A3B8]">{model}</p>
                      </div>
                    </a>
                    <span className={`badge ${nft.storageFinalized ? "badge-green" : "badge-green"}`}>
                      {nft.storageFinalized ? "Sealed" : "Sealed"}
                    </span>
                  </div>

                  <div className="space-y-2 text-[12px]">
                    <div className="flex justify-between items-center">
                      <span className="text-[#94A3B8] font-medium">Owner</span>
                      <a href={`${data.explorers.chainScan}/address/${nft.owner}`} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-[#7C3AED] hover:underline text-[11px]">
                        {nft.owner ? `${nft.owner.slice(0, 6)}...${nft.owner.slice(-4)}` : "—"}
                      </a>
                    </div>
                    <div>
                      <span className="text-[#94A3B8] font-medium block mb-1">Brain Root</span>
                      <span className="font-mono text-[#64748B] text-[10px] break-all leading-relaxed bg-white px-2 py-1 rounded-md border border-[#E2E8F0] block">{nft.brainRootHash}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2 text-[11px] text-[#94A3B8]">
            <span className="font-medium">Chain:</span>
            <span className="badge badge-purple">{data.inftRegistry.chainName}</span>
          </div>
        </div>

        {/* Compute — 2 cols */}
        <div className="col-span-2 card card-green p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[16px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
              Compute
            </h2>
            <div className="flex items-center gap-2">
              <div className="live-dot" />
              <span className="text-[11px] text-[#64748B] font-semibold">Active</span>
            </div>
          </div>

          <div className="bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl p-3 mb-4">
            <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider font-semibold mb-1">Router URL</p>
            <p className="text-[11px] font-mono text-[#64748B] break-all">{data.compute.routerUrl}</p>
          </div>

          <div className="space-y-3 mb-5">
            {data.compute.models.map((m: any) => (
              <div key={m.id} className="bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl flex items-center justify-between px-4 py-3 hover:border-[#A7F3D0] transition-colors">
                <div>
                  <p className="text-[13px] text-[#1E293B] font-semibold">Qwen 2.5 7B Instruct</p>
                  <p className="text-[10px] font-mono text-[#94A3B8]">qwen/qwen-2.5-7b-instruct</p>
                </div>
                <span className="badge badge-blue">{m.usedBy}</span>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider font-semibold mb-2">Pipeline</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { s: "Triage", c: "badge-amber" },
              { s: "EBBO", c: "badge-blue" },
              { s: "Coord", c: "badge-purple" },
              { s: "Decide", c: "badge-pink" },
              { s: "Slash", c: "badge-red" },
            ].map((x, i, a) => (
              <span key={x.s} className="flex items-center gap-1.5">
                <span className={`badge ${x.c}`}>{x.s}</span>
                {i < a.length - 1 && <span className="text-[#CBD5E1] text-[10px] font-bold">&rarr;</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Slash History ── */}
      <div className="card card-pink p-6 mb-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            Slash History
          </h2>
          <span className="badge badge-red">{data.recentSlashes.length} slashes</span>
        </div>

        {data.recentSlashes.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-[#F1F5F9] border-2 border-[#E2E8F0] flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </div>
            <p className="text-[#94A3B8] text-sm font-medium">No slashes recorded yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-[#E2E8F0]">
                  {["Order", "Slashed", "Swapper 60%", "Owner 30%", "Protocol 10%", "Time", ""].map((h) => (
                    <th key={h} className="text-[10px] text-[#94A3B8] uppercase tracking-wider pb-3 font-semibold pr-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recentSlashes.map((s: any, i: number) => (
                  <tr key={i} className="table-row border-b border-[#F1F5F9]">
                    <td className="py-3.5 pr-4">
                      <span className="text-[11px] font-mono text-[#7C3AED] font-medium">{sh(s.orderHash)}</span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="text-[13px] font-bold text-[#DC2626]">${usd(s.slashAmount)}</span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="text-[12px] font-semibold text-[#059669]">${usd(s.swapperRestitution)}</span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="text-[12px] font-semibold text-[#7C3AED]">${usd(s.ownerBounty)}</span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="text-[12px] text-[#64748B]">${usd(s.protocolCut)}</span>
                    </td>
                    <td className="py-3.5 pr-4">
                      <span className="text-[11px] text-[#94A3B8]">{ago(s.timestamp)}</span>
                    </td>
                    <td className="py-3.5">
                      <a href={`https://base-sepolia.blockscout.com/tx/${s.txHash}`}
                        target="_blank" rel="noopener noreferrer" className="link-badge !text-[10px] !py-1 !px-2.5">
                        Blockscout <ExternalIcon />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Storage & KV ── */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[16px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>
            Storage & KV
          </h2>
          <a href={data.explorers.storageScan} target="_blank" rel="noopener noreferrer" className="link-badge">
            StorageScan <ExternalIcon />
          </a>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* KV Info */}
          <div className="bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] border-2 border-[#BFDBFE] flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
              </div>
              <p className="text-[11px] text-[#94A3B8] uppercase tracking-wider font-semibold">KV Claim Stream</p>
            </div>
            <p className="text-[9px] font-mono text-[#64748B] break-all leading-relaxed bg-white px-2 py-1.5 rounded-md border border-[#E2E8F0] mb-3">{data.kv.streamId}</p>
            <div className="flex justify-between text-[11px] items-center">
              <span className="text-[#94A3B8] font-medium">Flow Contract</span>
              <a href={data.explorers.flowContractUrl} target="_blank" rel="noopener noreferrer"
                className="font-mono text-[#7C3AED] hover:underline text-[10px]">{sh(data.kv.flowContract, 8)}</a>
            </div>
          </div>

          {/* Audit Trail */}
          <div className="col-span-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] text-[#64748B] font-semibold">
                Audit Trail
              </p>
              <span className="badge badge-blue">{data.fillBatches.length} batches</span>
            </div>
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {data.fillBatches.slice(0, 8).map((b: any, i: number) => (
                <div key={i} className="bg-[#F8FAFC] border-2 border-[#E2E8F0] rounded-xl flex items-center justify-between px-4 py-3 hover:border-[#BFDBFE] transition-colors">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[9px] font-bold text-[#2563EB]">
                      {i + 1}
                    </div>
                    <span className="text-[11px] font-mono text-[#7C3AED]">{sh(b.rootHash, 10)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="text-[#64748B] font-medium">{b.recordCount} records</span>
                    <span className="text-[#94A3B8]">{ago(b.anchoredAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
