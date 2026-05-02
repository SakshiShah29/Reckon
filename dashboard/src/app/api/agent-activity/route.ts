import { NextRequest, NextResponse } from "next/server";
import { readFile, stat } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * Agent Activity API
 *
 * Two modes:
 * 1. POST — receives log lines from run-agent-live.sh (push mode)
 * 2. GET  — reads log files directly from multi-agent/logs/ (pull mode)
 *
 * The GET handler reads the real log files on each request (polling).
 * It also merges any lines pushed via POST.
 * This means the dashboard works without running any extra scripts.
 */

interface LogLine {
  id: number;
  agentId: string;
  line: string;
  timestamp: number;
}

// ── Push store (POST mode) ──
const pushStore: Map<string, LogLine[]> = new Map();
const MAX_PUSH = 2000;
let pushId = 0;

function addPushedLine(agentId: string, line: string) {
  const entry: LogLine = { id: ++pushId, agentId, line, timestamp: Date.now() };
  const logs = pushStore.get(agentId) ?? [];
  logs.push(entry);
  if (logs.length > MAX_PUSH) logs.splice(0, logs.length - MAX_PUSH);
  pushStore.set(agentId, logs);
}

// ── File reading (pull mode) ──
const LOGS_DIR = path.resolve(process.cwd(), "../multi-agent/logs");

const AGENT_FILES: { file: string; agentId: string }[] = [
  { file: "agent-1.log", agentId: "agent-0" },
  { file: "agent-2.log", agentId: "agent-2" },
];

// Track file sizes for detecting new content
const lastFileSize: Map<string, number> = new Map();
const fileLogCache: Map<string, LogLine[]> = new Map();
let fileIdCounter = 100_000; // offset to avoid collision with push IDs

async function readAgentLogFile(
  filename: string,
  agentId: string,
  tail: number,
): Promise<LogLine[]> {
  const filePath = path.join(LOGS_DIR, filename);

  try {
    const fileStat = await stat(filePath);
    const currentSize = fileStat.size;
    const prevSize = lastFileSize.get(filename) ?? 0;
    const cached = fileLogCache.get(filename);

    // If file hasn't changed and we have cache, return cache
    if (cached && currentSize === prevSize) {
      return cached.slice(-tail);
    }

    // Read the file
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const results: LogLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i].trim();
      if (!raw) continue;
      results.push({
        id: fileIdCounter++,
        agentId,
        line: raw,
        timestamp: fileStat.mtimeMs, // approximate
      });
    }

    lastFileSize.set(filename, currentSize);
    fileLogCache.set(filename, results);

    return results.slice(-tail);
  } catch {
    return [];
  }
}

/**
 * POST /api/agent-activity
 * Body: { agentId: "agent-0", line: "..." }
 * or:   { agentId: "agent-0", lines: ["...", "..."] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId } = body;

    if (!agentId || typeof agentId !== "string") {
      return NextResponse.json({ error: "agentId required" }, { status: 400 });
    }

    if (body.line && typeof body.line === "string") {
      addPushedLine(agentId, body.line);
      return NextResponse.json({ ok: true, count: 1 });
    }

    if (Array.isArray(body.lines)) {
      for (const line of body.lines) {
        if (typeof line === "string" && line.trim()) {
          addPushedLine(agentId, line.trim());
        }
      }
      return NextResponse.json({ ok: true, count: body.lines.length });
    }

    return NextResponse.json({ error: "line or lines required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

/**
 * GET /api/agent-activity?agent=agent-0&tail=300&source=file|push|both
 *
 * source=file  → read from log files only (default)
 * source=push  → read from POST-pushed logs only
 * source=both  → merge both
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentFilter = searchParams.get("agent");
  const tail = Math.min(parseInt(searchParams.get("tail") ?? "300", 10), 2000);
  const source = searchParams.get("source") ?? "both";

  let fileLogs: LogLine[] = [];
  let pushedLogs: LogLine[] = [];

  // Read from log files
  if (source === "file" || source === "both") {
    for (const { file, agentId } of AGENT_FILES) {
      if (agentFilter && agentId !== agentFilter) continue;
      const logs = await readAgentLogFile(file, agentId, tail);
      fileLogs.push(...logs);
    }
  }

  // Read from push store
  if (source === "push" || source === "both") {
    if (agentFilter) {
      pushedLogs = [...(pushStore.get(agentFilter) ?? [])];
    } else {
      pushStore.forEach((logs) => pushedLogs.push(...logs));
    }
    pushedLogs = pushedLogs.slice(-tail);
  }

  // Merge: pushed logs take priority (they're real-time from the script)
  // If we have pushed logs, use those. Otherwise fall back to file logs.
  let results: LogLine[];
  if (pushedLogs.length > 0) {
    results = pushedLogs;
  } else {
    results = fileLogs;
  }

  if (results.length > tail) {
    results = results.slice(-tail);
  }

  // Collect available agent IDs
  const agentSet = new Set<string>();
  results.forEach((l) => agentSet.add(l.agentId));
  pushStore.forEach((_, k) => agentSet.add(k));

  return NextResponse.json({
    logs: results,
    agents: Array.from(agentSet),
    count: results.length,
    source: pushedLogs.length > 0 ? "push" : "file",
  });
}
