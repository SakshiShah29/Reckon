import { NextResponse } from "next/server";
import { getRecentFills } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);

  try {
    const fills = await getRecentFills(Math.min(limit, 200));
    return NextResponse.json(fills);
  } catch (err) {
    console.error("[api/fills] Error:", err);
    return NextResponse.json({ error: "Failed to fetch fills" }, { status: 500 });
  }
}
