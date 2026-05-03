import { NextResponse } from "next/server";
import { getSolverByAddress } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address) {
    return NextResponse.json(
      { error: "address query parameter is required" },
      { status: 400 },
    );
  }

  try {
    const solver = await getSolverByAddress(address);
    return NextResponse.json(solver ?? { address, ensName: null, namehash: null, reputationScore: null, totalFills: 0, slashCount: 0, bondAmount: null });
  } catch (err) {
    console.error("[api/solver-info] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch solver info" },
      { status: 500 },
    );
  }
}
