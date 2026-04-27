import { NextResponse } from "next/server";
import { getSolverReputation, getFillsBySolver } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const namehash = searchParams.get("namehash");

  if (!namehash) {
    return NextResponse.json(
      { error: "namehash query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const [reputation, fills] = await Promise.all([
      getSolverReputation(namehash),
      getFillsBySolver(namehash, 50),
    ]);

    return NextResponse.json({ reputation, fills });
  } catch (err) {
    console.error("[api/solver] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch solver data" },
      { status: 500 },
    );
  }
}
