import { NextResponse } from "next/server";
import { getRecentChallenges } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);

  try {
    const challenges = await getRecentChallenges(Math.min(limit, 200));
    return NextResponse.json(challenges);
  } catch (err) {
    console.error("[api/challenges] Error:", err);
    return NextResponse.json({ error: "Failed to fetch challenges" }, { status: 500 });
  }
}
