import { NextResponse } from "next/server";
import { getRecentSlashes } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);

  try {
    const slashes = await getRecentSlashes(Math.min(limit, 200));
    return NextResponse.json(slashes);
  } catch (err) {
    console.error("[api/slashes] Error:", err);
    return NextResponse.json({ error: "Failed to fetch slashes" }, { status: 500 });
  }
}
