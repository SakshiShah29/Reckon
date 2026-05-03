"use client";

import { useEffect, useState } from "react";

const ZG_LOGO = "https://docs.0g.ai/img/0G-Logo-Light.svg";
const EXTERNAL_ICON = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-40">
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

/* ── Skeleton loaders ── */
function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg animate-pulse ${className}`}
      style={{ background: "rgba(255,255,255,0.04)" }}
    />
  );
}

function SkeletonPage() {
  return (
    <div className="px-8 py-6">
      {/* Overview skeleton */}
      <div className="glass p-8 mb-5">
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="w-7 h-7 !rounded-xl" />
          <Skeleton className="w-32 h-5" />
        </div>
        <div className="grid grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <Skeleton className="w-24 h-3 mb-3" />
              <Skeleton className="w-16 h-8" />
            </div>
          ))}
        </div>
      </div>
      {/* Cards skeleton */}
      <div className="grid grid-cols-5 gap-5 mb-5">
        <div className="col-span-3 glass p-6">
          <Skeleton className="w-28 h-4 mb-5" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="glass-inner p-4">
                <div className="flex items-center gap-3 mb-3">
                  <Skeleton className="w-10 h-10 !rounded-2xl" />
                  <div>
                    <Skeleton className="w-20 h-4 mb-1" />
                    <Skeleton className="w-32 h-3" />
                  </div>
                </div>
                <Skeleton className="w-full h-3 mb-2" />
                <Skeleton className="w-3/4 h-3" />
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-2 glass p-6">
          <Skeleton className="w-24 h-4 mb-5" />
          <Skeleton className="w-full h-12 mb-3 !rounded-2xl" />
          <Skeleton className="w-full h-14 mb-2 !rounded-2xl" />
          <Skeleton className="w-full h-14 !rounded-2xl" />
        </div>
      </div>
      {/* Table skeleton */}
      <div className="glass p-6">
        <Skeleton className="w-28 h-4 mb-5" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex gap-6 mb-4">
            <Skeleton className="w-36 h-4" />
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-16 h-4" />
            <Skeleton className="w-12 h-4" />
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
      <div className="p-8">
        <div className="glass p-5"><p className="text-red-300/70 text-sm">{error}</p></div>
      </div>
    );

  if (!data) return null;

  const total = data.recentSlashes.reduce(
    (s: number, x: any) => s + Number(x.slashAmount || 0), 0,
  );

  return (
    <div className="px-8 py-6">
      {/* ── Overview ── */}
      <div className="glass p-8 mb-5">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src={ZG_LOGO} alt="0G" className="h-6 opacity-70" />
            <h1 className="text-[18px] font-semibold text-white/85">Overview</h1>
          </div>
          <div className="flex gap-2">
            <a href={data.explorers.storageScan} target="_blank" rel="noopener noreferrer" className="link-badge">
              StorageScan {EXTERNAL_ICON}
            </a>
            <a href={data.explorers.contractUrl} target="_blank" rel="noopener noreferrer" className="link-badge">
              ChainScan {EXTERNAL_ICON}
            </a>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6">
          {[
            { l: "iNFTs Minted", v: data.inftRegistry.totalSupply, c: "text-white/80" },
            { l: "Storage Batches", v: data.fillBatches.length, c: "text-white/80" },
            { l: "Slashes", v: data.recentSlashes.length, c: "text-rose-300/80" },
            { l: "Total Slashed", v: `$${usd(String(total))}`, c: "text-rose-300/80" },
          ].map((s) => (
            <div key={s.l}>
              <p className="text-[10px] text-white/20 uppercase tracking-wider mb-2">{s.l}</p>
              <p className={`text-[30px] font-bold tracking-tight ${s.c}`}>{s.v}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── iNFTs + Compute ── */}
      <div className="grid grid-cols-5 gap-5 mb-5">
        {/* iNFTs — 3 cols */}
        <div className="col-span-3 glass p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[14px] font-medium text-white/70">iNFT Registry</h2>
            <a href={data.explorers.contractUrl} target="_blank" rel="noopener noreferrer" className="link-badge">
              {sh(data.inftRegistry.contract, 8)} {EXTERNAL_ICON}
            </a>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {data.inftRegistry.tokens.map((nft: any) => {
              const url = `${data.explorers.chainScan}/nft/${data.inftRegistry.contract}/${nft.tokenId}`;
              return (
                <div key={nft.tokenId} className="glass-inner p-4">
                  <div className="flex items-center justify-between mb-3">
                    <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 group">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-400/20 to-indigo-400/20 border border-white/[0.06] flex items-center justify-center text-white/60 text-[12px] font-bold">
                        #{nft.tokenId}
                      </div>
                      <div>
                        <p className="text-[13px] text-white/75 font-medium group-hover:text-white/90 transition-colors">{nft.name}</p>
                        <p className="text-[10px] font-mono text-white/20">{nft.model}</p>
                      </div>
                    </a>
                    <span className={`badge ${nft.storageFinalized ? "badge-green" : "badge-amber"}`}>
                      {nft.storageFinalized ? "Sealed" : "Pending"}
                    </span>
                  </div>
                  <div className="space-y-2 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-white/20">Owner</span>
                      <a href={`${data.explorers.chainScan}/address/${nft.owner}`} target="_blank" rel="noopener noreferrer"
                        className="font-mono text-purple-300/50 hover:text-purple-300/80 transition-colors">
                        {nft.owner ? `${nft.owner.slice(0, 6)}...${nft.owner.slice(-4)}` : "—"}
                      </a>
                    </div>
                    <div>
                      <span className="text-white/20 block mb-0.5">Brain Root</span>
                      <span className="font-mono text-indigo-300/40 text-[10px] break-all leading-relaxed">{nft.brainRootHash}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compute — 2 cols */}
        <div className="col-span-2 glass p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <img src={ZG_LOGO} alt="" className="h-4 opacity-40" />
              <h2 className="text-[14px] font-medium text-white/70">Compute</h2>
            </div>
            <div className="flex items-center gap-2">
              <div className="live-dot" />
              <span className="text-[10px] text-white/20">Active</span>
            </div>
          </div>

          <div className="glass-inner p-3 mb-4">
            <p className="text-[9px] text-white/15 uppercase tracking-wider mb-1">Router</p>
            <p className="text-[10px] font-mono text-indigo-300/40 break-all">{data.compute.routerUrl}</p>
          </div>

          <div className="space-y-2.5 mb-5">
            {data.compute.models.map((m: any) => (
              <div key={m.id} className="glass-inner flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[12px] text-white/70 font-medium">{m.name}</p>
                  <p className="text-[10px] font-mono text-white/15">{m.id}</p>
                </div>
                <span className="badge badge-blue">{m.usedBy}</span>
              </div>
            ))}
          </div>

          <p className="text-[9px] text-white/15 uppercase tracking-wider mb-2">Pipeline</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { s: "Triage", c: "badge-amber" },
              { s: "EBBO", c: "badge-blue" },
              { s: "Coord", c: "badge-purple" },
              { s: "Decide", c: "badge-pink" },
              { s: "Slash", c: "badge-red" },
            ].map((x, i, a) => (
              <span key={x.s} className="flex items-center gap-1.5">
                <span className={`badge ${x.c} !text-[9px]`}>{x.s}</span>
                {i < a.length - 1 && <span className="text-white/10 text-[10px]">&rarr;</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Slash History ── */}
      <div className="glass p-6 mb-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[14px] font-medium text-white/70">Slash History</h2>
          <span className="badge badge-red">{data.recentSlashes.length} slashes</span>
        </div>

        {data.recentSlashes.length === 0 ? (
          <p className="text-center text-white/20 py-8 text-sm">No slashes recorded yet</p>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.04]">
                {["Order", "Slashed", "Swapper 60%", "Owner 30%", "Protocol 10%", "Time", ""].map((h) => (
                  <th key={h} className="text-[10px] text-white/15 uppercase tracking-wider pb-3 font-medium pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recentSlashes.map((s: any, i: number) => (
                <tr key={i} className="table-row border-b border-white/[0.02]">
                  <td className="py-4 pr-4">
                    <span className="text-[11px] font-mono text-purple-300/50">{sh(s.orderHash)}</span>
                  </td>
                  <td className="py-4 pr-4 text-[13px] font-semibold text-rose-300/70">${usd(s.slashAmount)}</td>
                  <td className="py-4 pr-4 text-[12px] text-emerald-300/50">${usd(s.swapperRestitution)}</td>
                  <td className="py-4 pr-4 text-[12px] text-purple-300/50">${usd(s.ownerBounty)}</td>
                  <td className="py-4 pr-4 text-[12px] text-white/20">${usd(s.protocolCut)}</td>
                  <td className="py-4 pr-4 text-[11px] text-white/15">{ago(s.timestamp)}</td>
                  <td className="py-4">
                    <a href={`https://base-sepolia.blockscout.com/tx/${s.txHash}`}
                      target="_blank" rel="noopener noreferrer" className="link-badge !text-[10px] !py-1 !px-2.5">
                      Blockscout {EXTERNAL_ICON}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Storage ── */}
      <div className="glass p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <img src={ZG_LOGO} alt="" className="h-4 opacity-40" />
            <h2 className="text-[14px] font-medium text-white/70">Storage & KV</h2>
          </div>
          <a href={data.explorers.storageScan} target="_blank" rel="noopener noreferrer" className="link-badge">
            StorageScan {EXTERNAL_ICON}
          </a>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="glass-inner p-4">
            <p className="text-[9px] text-white/15 uppercase tracking-wider mb-2">KV Claim Stream</p>
            <p className="text-[9px] font-mono text-indigo-300/35 break-all leading-relaxed mb-3">{data.kv.streamId}</p>
            <div className="flex justify-between text-[10px]">
              <span className="text-white/15">Flow Contract</span>
              <a href={data.explorers.flowContractUrl} target="_blank" rel="noopener noreferrer"
                className="font-mono text-purple-300/40 hover:text-purple-300/60 transition-colors">{sh(data.kv.flowContract, 8)}</a>
            </div>
          </div>

          <div className="col-span-2">
            <p className="text-[10px] text-white/20 mb-2">Audit Trail &middot; {data.fillBatches.length} batches</p>
            <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
              {data.fillBatches.slice(0, 8).map((b: any, i: number) => (
                <div key={i} className="glass-subtle flex items-center justify-between px-3 py-2.5">
                  <span className="text-[10px] font-mono text-purple-300/40">{sh(b.rootHash, 10)}</span>
                  <div className="flex items-center gap-4 text-[10px]">
                    <span className="text-white/20">{b.recordCount} records</span>
                    <span className="text-white/12">{ago(b.anchoredAt)}</span>
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
