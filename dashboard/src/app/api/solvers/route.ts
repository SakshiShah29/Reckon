import { NextResponse } from "next/server";
import { getSolverLeaderboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const solvers = await getSolverLeaderboard();
    return NextResponse.json(solvers);
  } catch (err) {
    console.error("[api/solvers] Error:", err);
    return NextResponse.json({ error: "Failed to fetch solvers" }, { status: 500 });
  }
}
