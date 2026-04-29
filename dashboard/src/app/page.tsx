import { StatsCards } from "@/components/stats-cards";
import { FillChart } from "@/components/fill-chart";
import { IndexerHealth } from "@/components/indexer-health";
import { SolverLeaderboard } from "@/components/solver-leaderboard";
import { SlashDonut } from "@/components/slash-donut";
import { FillFeed } from "@/components/fill-feed";
import { ChallengeFeed } from "@/components/challenge-feed";

export default function HomePage() {
  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
          <p className="text-[13px] text-[#666] mt-1">Real-time solver fill monitoring and EBBO challenge tracking on Base</p>
        </div>
        <button className="text-[13px] text-[#888] bg-[#141414] hover:bg-[#1a1a1a] border border-[#222] px-3 py-1.5 rounded-lg transition-colors">
          + Add widget
        </button>
      </div>

      {/* Row 1: Stats + Health Card */}
      <div className="grid grid-cols-[1fr_280px] gap-4">
        {/* Left: Stats row */}
        <StatsCards />
        {/* Right: Health card */}
        <IndexerHealth />
      </div>

      {/* Row 2: Chart + Challenge + Daily Limit */}
      <div className="grid grid-cols-[1fr_280px] gap-4 mt-4">
        <FillChart />
        <div className="flex flex-col gap-4">
          {/* Challenge Window */}
          <div className="card p-4">
            <p className="text-[11px] text-[#666] mb-1">Active challenge window</p>
            <div className="flex items-end justify-between mb-2">
              <span className="text-[13px] text-[#888]">$10,000 at risk across 8 fills</span>
              <span className="text-[13px] text-white font-medium">69%</span>
            </div>
            <div className="h-2 rounded-full bg-[#1a1a1a] overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-[#a78bfa] to-[#00D4AA] progress-fill" style={{ width: "69%" }} />
            </div>
          </div>
          {/* Recent Fills mini */}
          <FillFeed />
        </div>
      </div>

      {/* Row 3: Leaderboard + Donut + Challenges */}
      <div className="grid grid-cols-3 gap-4 mt-4">
        <SolverLeaderboard />
        <SlashDonut />
        <ChallengeFeed />
      </div>
    </div>
  );
}
