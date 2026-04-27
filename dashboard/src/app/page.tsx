import { getDashboardStats, getRecentFills, getRecentSlashes } from "@/lib/queries";
import { FillFeed } from "@/components/fill-feed";
import { SlashFeed } from "@/components/slash-feed";
import { StatsBar } from "@/components/stats-bar";

export const dynamic = "force-dynamic";
export const revalidate = 5; // ISR: revalidate every 5 seconds

export default async function HomePage() {
  let stats = { totalFills: 0, totalChallenges: 0, totalSlashes: 0, totalSlashedUSDC: 0 };
  let fills: Awaited<ReturnType<typeof getRecentFills>> = [];
  let slashes: Awaited<ReturnType<typeof getRecentSlashes>> = [];

  try {
    [stats, fills, slashes] = await Promise.all([
      getDashboardStats(),
      getRecentFills(20),
      getRecentSlashes(10),
    ]);
  } catch (err) {
    // MongoDB may not be available during development
    console.error("[dashboard] Failed to fetch data:", err);
  }

  return (
    <main style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <StatsBar
        totalFills={stats.totalFills}
        totalChallenges={stats.totalChallenges}
        totalSlashes={stats.totalSlashes}
        totalSlashedUSDC={stats.totalSlashedUSDC}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginTop: "24px",
        }}
      >
        <section>
          <h2 style={{ fontSize: "16px", marginBottom: "12px", color: "#aaa" }}>
            Recent Fills
          </h2>
          <FillFeed fills={fills} />
        </section>

        <section>
          <h2 style={{ fontSize: "16px", marginBottom: "12px", color: "#aaa" }}>
            Recent Slashes
          </h2>
          <SlashFeed slashes={slashes} />
        </section>
      </div>
    </main>
  );
}
