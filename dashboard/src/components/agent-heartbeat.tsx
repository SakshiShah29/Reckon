"use client";

import { useEffect, useState, useCallback } from "react";

interface AgentInfo {
  id: string;
  name: string;
  tokenId: string;
  color: string;
}

const AGENTS: AgentInfo[] = [
  { id: "agent-0", name: "Sentinel", tokenId: "#0", color: "#8B5CF6" },
  { id: "agent-2", name: "Warden", tokenId: "#2", color: "#F472B6" },
];

interface AgentState {
  online: boolean;
  lastLine: string;
  lastTimestamp: number;
  stage: string;
}

function parseStage(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("triage") || lower.includes("triaging")) return "Triage";
  if (lower.includes("ebbo") || lower.includes("benchmark")) return "EBBO";
  if (lower.includes("coordinat")) return "Coordinate";
  if (lower.includes("decid") || lower.includes("decision")) return "Decide";
  if (lower.includes("submit") || lower.includes("slash") || lower.includes("challenge")) return "Challenge";
  if (lower.includes("idle") || lower.includes("waiting") || lower.includes("polling")) return "Idle";
  return "Active";
}

function relativeTime(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

const STAGE_COLORS: Record<string, string> = {
  Triage: "#FBBF24",
  EBBO: "#8B5CF6",
  Coordinate: "#3B82F6",
  Decide: "#F472B6",
  Challenge: "#EF4444",
  Idle: "#94A3B8",
  Active: "#34D399",
};

export function AgentHeartbeat() {
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>({});
  const [loading, setLoading] = useState(true);

  const fetchAgentLogs = useCallback(async () => {
    try {
      const results: Record<string, AgentState> = {};

      await Promise.all(
        AGENTS.map(async (agent) => {
          try {
            const res = await fetch(`/api/agent-activity?agent=${agent.id}&tail=3`);
            if (!res.ok) throw new Error("fetch failed");
            const data = await res.json();
            const lines: string[] = data.lines ?? [];
            const lastLine = lines.length > 0 ? lines[lines.length - 1] : "";

            // Try to extract timestamp from line (format: [HH:MM:SS] or epoch)
            const tsMatch = lastLine.match(/\[(\d{2}:\d{2}:\d{2})\]/);
            const now = Math.floor(Date.now() / 1000);
            let lastTimestamp = now;
            if (data.lastModified) {
              lastTimestamp = Math.floor(new Date(data.lastModified).getTime() / 1000);
            }

            const isOnline = now - lastTimestamp < 120; // 2 min threshold
            const stage = lastLine ? parseStage(lastLine) : "Idle";

            // Clean the log line for display
            let displayLine = lastLine
              .replace(/\[\d{2}:\d{2}:\d{2}\]\s*/, "")
              .replace(/^\[agent-\d+\]\s*/, "")
              .trim();
            if (displayLine.length > 60) displayLine = displayLine.slice(0, 57) + "...";

            results[agent.id] = {
              online: isOnline,
              lastLine: displayLine || "No activity yet",
              lastTimestamp,
              stage,
            };
          } catch {
            results[agent.id] = {
              online: false,
              lastLine: "Unreachable",
              lastTimestamp: 0,
              stage: "Idle",
            };
          }
        }),
      );

      setAgentStates(results);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAgentLogs();
    const iv = setInterval(fetchAgentLogs, 5_000);
    return () => clearInterval(iv);
  }, [fetchAgentLogs]);

  return (
    <div className="card card-pink p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="icon-circle" style={{ background: "#F472B6", width: 36, height: 36, borderRadius: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" />
              <circle cx="8" cy="16" r="1" fill="white" /><circle cx="16" cy="16" r="1" fill="white" />
            </svg>
          </div>
          <div>
            <p className="text-[14px] font-bold text-[#1E293B]" style={{ fontFamily: "var(--font-heading)" }}>Agent Heartbeat</p>
            <p className="text-[11px] text-[#64748B]">iNFT challenger agents</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {AGENTS.map((agent) => {
          const state = agentStates[agent.id];
          const online = state?.online ?? false;
          const stage = state?.stage ?? "Idle";
          const stageColor = STAGE_COLORS[stage] ?? "#94A3B8";

          return (
            <div
              key={agent.id}
              className="bg-[#FAFAFA] border-2 rounded-xl p-3 transition-all duration-200 hover:shadow-[3px_3px_0_#FBCFE8]"
              style={{ borderColor: online ? agent.color : "#E2E8F0" }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-lg border-2 border-[#1E293B] flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ background: agent.color }}
                  >
                    {agent.tokenId}
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-[#1E293B]">{agent.name}</p>
                    <p className="text-[10px] font-mono text-[#94A3B8]">{agent.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full border-2"
                    style={{ color: stageColor, borderColor: stageColor, background: `${stageColor}15` }}
                  >
                    {stage}
                  </span>
                  <span className={`w-2.5 h-2.5 rounded-full ${online ? "bg-[#34D399]" : "bg-[#EF4444]"}`} />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-[11px] text-[#64748B] truncate flex-1 mr-2">
                  {loading ? "..." : state?.lastLine ?? "No activity"}
                </p>
                <p className="text-[10px] text-[#94A3B8] font-mono shrink-0">
                  {state?.lastTimestamp ? relativeTime(state.lastTimestamp) : "\u2014"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
