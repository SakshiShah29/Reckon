import { StatsCards } from "@/components/stats-cards";
import { FillChart } from "@/components/fill-chart";
import { IndexerHealth } from "@/components/indexer-health";
import { EbboOracle } from "@/components/ebbo-oracle";
import { ProtocolEconomics } from "@/components/protocol-economics";
import { PartnerLogos } from "@/components/partner-logos";

export default function DashboardPage() {
  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      {/* ── Header with decorative shapes ── */}
      <div className="flex items-end justify-between mb-6 relative">
        <div>
          <h1
            className="text-[28px] font-extrabold text-[#1E293B] tracking-tight"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Dashboard
          </h1>
          <p className="text-[14px] text-[#64748B] mt-1 font-medium">
            Real-time solver fill monitoring and EBBO challenge tracking on Base
          </p>
        </div>
        {/* Decorative floating shapes */}
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-[#FBBF24] border-2 border-[#1E293B] opacity-60" />
          <div className="w-3 h-3 bg-[#F472B6] border-2 border-[#1E293B] rotate-45 opacity-60" />
          <div className="w-5 h-5 rounded-full bg-[#8B5CF6] border-2 border-[#1E293B] opacity-60" />
          <div className="w-3 h-3 bg-[#34D399] border-2 border-[#1E293B] opacity-60" style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }} />
        </div>
      </div>

      {/* ── Row 1: Stat Cards ── */}
      <StatsCards />

      {/* ── Row 2: Chart + Sidebar ── */}
      <div className="grid grid-cols-[1fr_300px] gap-4 mt-5">
        <FillChart />
        <div className="flex flex-col gap-4">
          <EbboOracle />
          <IndexerHealth />
        </div>
      </div>

      {/* ── Row 3: Protocol Economics ── */}
      <div className="mt-5">
        <ProtocolEconomics />
      </div>

      {/* ── Partner Logos ── */}
      <div className="mt-5 border-t-2 border-[#E2E8F0]">
        <PartnerLogos />
      </div>
    </div>
  );
}
