import { NextRequest, NextResponse } from "next/server";
import { addLog, getLogs, parseLogLine } from "@/lib/log-store";

export const dynamic = "force-dynamic";

// POST /api/logs — agents post log lines here
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, lines } = body as { agentId: number; lines: string[] };

    if (typeof agentId !== "number" || !Array.isArray(lines)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    for (const raw of lines) {
      const { stage, message } = parseLogLine(raw);
      addLog({ agentId, timestamp: Date.now(), stage, message, raw });
    }

    return NextResponse.json({ ok: true, count: lines.length });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

// GET /api/logs?agentId=1&limit=100 — fetch historical logs
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const limit = parseInt(searchParams.get("limit") ?? "100", 10);

  const entries = getLogs(
    agentId ? parseInt(agentId, 10) : undefined,
    limit
  );
  return NextResponse.json(entries);
}
