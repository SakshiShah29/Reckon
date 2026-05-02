"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ── Types ── */
interface LogLine {
  id: number;
  agentId: string;
  line: string;
  timestamp: number;
}

/* ── Constants ── */
const AGENTS = [
  { id: "agent-0", name: "Sentinel", model: "qwen-2.5-7b-instruct", tokenId: 0 },
  { id: "agent-2", name: "Warden", model: "GLM-5-FP8", tokenId: 2 },
] as const;

const STAGE_COLORS: Record<string, string> = {
  boot: "#c4b5fd",
  triage: "#fde68a",
  ebbo: "#818cf8",
  coordinate: "#86efac",
  decide: "#67e8f9",
  submit: "#fca5a5",
  orchestrator: "rgba(255,255,255,0.4)",
  listener: "rgba(255,255,255,0.35)",
  bootstrap: "#c4b5fd",
  storage: "#93c5fd",
  tx: "#f9a8d4",
  error: "#fca5a5",
  info: "rgba(255,255,255,0.25)",
  mesh: "#86efac",
};

const TABS = ["All Agents", "Sentinel (#0)", "Warden (#2)"] as const;

function agentColor(id: string): string {
  if (id === "agent-0") return "#c4b5fd";
  if (id === "agent-2") return "#818cf8";
  if (id === "agent-3") return "#86efac";
  if (id === "mesh") return "#67e8f9";
  return "rgba(255,255,255,0.3)";
}

function parseStage(line: string): string {
  const m = line.match(/^\[(\w[\w-]*)\]/);
  if (m) return m[1];
  if (line.startsWith("===")) return "boot";
  if (line.startsWith("▶") || line.startsWith("■")) return "info";
  if (/error|Error|ENOTFOUND|failed/i.test(line)) return "error";
  if (/Transaction submitted|tx:/i.test(line)) return "tx";
  if (/download|upload|storage/i.test(line)) return "storage";
  return "info";
}

function stripStageTag(line: string): string {
  return line.replace(/^\[\w[\w-]*\]\s*/, "");
}

const POLL_INTERVAL = 5000;

/* ── Skeleton ── */
function TerminalSkeleton() {
  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04]">
        {[80, 60, 60, 60].map((w, i) => (
          <div key={i} className="h-5 rounded-lg animate-pulse" style={{ width: w, background: "rgba(255,255,255,0.04)" }} />
        ))}
      </div>
      <div className="p-4 space-y-2">
        {[...Array(14)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="h-4 w-10 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
            <div className="h-4 rounded animate-pulse" style={{ width: 200 + Math.random() * 300, background: "rgba(255,255,255,0.03)" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export function AgentLogs() {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [availableAgents, setAvailableAgents] = useState<string[]>([]);
  const [lastId, setLastId] = useState(0);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("All Agents");
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async (isInitial = false) => {
    try {
      const url = isInitial
        ? "/api/agent-activity?tail=500"
        : `/api/agent-activity?after=${lastId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();

      if (isInitial) {
        setLogs(data.logs);
      } else if (data.logs.length > 0) {
        setLogs((prev) => {
          const merged = [...prev, ...data.logs];
          return merged.length > 2000 ? merged.slice(-1500) : merged;
        });
      }

      if (data.lastId) setLastId(data.lastId);
      if (data.agents) setAvailableAgents(data.agents);
      setConnected(true);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, [lastId]);

  // Initial fetch
  useEffect(() => {
    fetchLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll every 5 seconds for new logs
  useEffect(() => {
    const iv = setInterval(() => fetchLogs(false), POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [fetchLogs]);

  // Auto-scroll on new logs
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll, activeTab]);

  if (loading) {
    return (
      <div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[0, 1].map((i) => (
            <div key={i} className="glass p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                <div className="space-y-1.5">
                  <div className="h-4 w-20 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                  <div className="h-3 w-28 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.03)" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <TerminalSkeleton />
      </div>
    );
  }

  // Check which agents have logs
  function agentHasLogs(agentId: string): boolean {
    return availableAgents.includes(agentId);
  }

  function agentLogCount(agentId: string): number {
    return logs.filter((l) => l.agentId === agentId).length;
  }

  function agentLastActivity(agentId: string): string {
    const agentLogs = logs.filter((l) => l.agentId === agentId);
    if (agentLogs.length === 0) return "—";
    const last = agentLogs[agentLogs.length - 1];
    const ago = Math.floor((Date.now() - last.timestamp) / 1000);
    if (ago < 10) return "just now";
    if (ago < 60) return `${ago}s ago`;
    if (ago < 3600) return `${Math.floor(ago / 60)}m ago`;
    return `${Math.floor(ago / 3600)}h ago`;
  }

  // Filter logs by tab
  let filteredLogs = logs;
  if (activeTab === "Sentinel (#0)") {
    filteredLogs = logs.filter((l) => l.agentId === "agent-0");
  } else if (activeTab === "Warden (#2)") {
    filteredLogs = logs.filter((l) => l.agentId === "agent-2");
  }

  // Apply search filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filteredLogs = filteredLogs.filter((l) => l.line.toLowerCase().includes(q));
  }

  return (
    <div>
      {/* Agent Status Cards */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {AGENTS.map((agent) => {
          const online = agentHasLogs(agent.id);
          const color = agentColor(agent.id);
          return (
            <div key={agent.id} className="glass p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-[11px] font-bold border"
                    style={{ background: `${color}15`, borderColor: `${color}30`, color }}
                  >
                    #{agent.tokenId}
                  </div>
                  <div>
                    <p className="text-[13px] text-white/80 font-medium">{agent.name}</p>
                    <p className="text-[10px] font-mono text-white/20">{agent.model}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={online ? "live-dot" : ""}
                    style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: online ? "#86efac" : "rgba(255,255,255,0.15)",
                    }}
                  />
                  <span className="text-[10px]" style={{ color: online ? "rgba(134,239,172,0.8)" : "rgba(255,255,255,0.25)" }}>
                    {online ? "Streaming" : "No logs"}
                  </span>
                </div>
              </div>
              <div className="flex gap-4 pt-3 border-t border-white/[0.04]">
                <div>
                  <p className="text-[9px] text-white/20 uppercase tracking-wider">Lines</p>
                  <p className="text-white/70 text-[13px] font-mono font-medium mt-0.5">{agentLogCount(agent.id)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-white/20 uppercase tracking-wider">Last Activity</p>
                  <p className="text-white/70 text-[13px] font-medium mt-0.5">{agentLastActivity(agent.id)}</p>
                </div>
                <div>
                  <p className="text-[9px] text-white/20 uppercase tracking-wider">Token ID</p>
                  <p className="text-white/70 text-[13px] font-mono font-medium mt-0.5">{agent.tokenId}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Terminal Log Viewer */}
      <div className="glass overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-white/[0.04] px-4">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 py-2.5 text-[12px] font-medium transition-colors relative"
                style={{ color: activeTab === tab ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.25)" }}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-1 right-1 h-[2px] rounded-t" style={{ background: "rgba(196,181,253,0.5)" }} />
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {/* Connection status */}
            <div className="flex items-center gap-1.5 mr-2">
              <div
                className={connected ? "live-dot" : ""}
                style={{
                  width: 5, height: 5, borderRadius: "50%",
                  background: connected ? "#86efac" : "rgba(252,165,165,0.5)",
                }}
              />
              <span className="text-[9px]" style={{ color: connected ? "rgba(134,239,172,0.5)" : "rgba(252,165,165,0.5)" }}>
                {connected ? "Connected" : "Disconnected"}
              </span>
            </div>
            {/* Search */}
            <div className="flex items-center gap-1.5 bg-white/[0.03] border border-white/[0.05] rounded-lg px-2 py-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter..."
                className="bg-transparent text-[11px] text-white/60 outline-none w-20 placeholder-white/15 font-mono"
              />
            </div>
            {/* Auto-scroll */}
            <button
              onClick={() => setAutoScroll((v) => !v)}
              className="text-[10px] px-2 py-1 rounded-lg transition-all"
              style={{
                color: autoScroll ? "rgba(134,239,172,0.7)" : "rgba(255,255,255,0.25)",
                background: autoScroll ? "rgba(134,239,172,0.08)" : "transparent",
                border: `1px solid ${autoScroll ? "rgba(134,239,172,0.15)" : "rgba(255,255,255,0.05)"}`,
              }}
            >
              {autoScroll ? "Auto-scroll" : "Paused"}
            </button>
          </div>
        </div>

        {/* Log lines */}
        <div
          ref={scrollRef}
          className="overflow-y-auto p-3"
          style={{ maxHeight: 520, fontFamily: "var(--font-mono)" }}
        >
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
              </svg>
              <p className="text-white/20 text-[12px] mt-3">
                {searchQuery
                  ? "No logs match your filter"
                  : "No logs yet — run ./run-agent-live.sh to stream agent logs here"}
              </p>
              <p className="text-white/10 text-[10px] mt-1 font-mono">
                cd multi-agent && bash run-agent-live.sh
              </p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const stage = parseStage(log.line);
              const stageColor = STAGE_COLORS[stage] || "rgba(255,255,255,0.25)";
              const aColor = agentColor(log.agentId);
              const displayLine = stripStageTag(log.line);

              return (
                <div
                  key={log.id}
                  className="flex items-start gap-2 py-[3px] -mx-2 px-2 rounded text-[11px] leading-[18px] hover:bg-white/[0.015] transition-colors"
                >
                  {/* Agent badge */}
                  <span
                    className="flex-shrink-0 px-1.5 py-[1px] rounded text-[9px] font-medium"
                    style={{ color: aColor, background: `${aColor}12`, border: `1px solid ${aColor}20` }}
                  >
                    {log.agentId === "mesh" ? "mesh" : `#${log.agentId.replace("agent-", "")}`}
                  </span>

                  {/* Stage tag */}
                  <span
                    className="flex-shrink-0 px-1.5 py-[1px] rounded text-[9px] font-medium min-w-[56px] text-center"
                    style={{ color: stageColor, background: `${stageColor}10` }}
                  >
                    {stage}
                  </span>

                  {/* Message */}
                  <span
                    className="break-all"
                    style={{
                      color: stage === "error" ? "rgba(252,165,165,0.7)"
                        : stage === "tx" ? "rgba(249,168,212,0.7)"
                        : "rgba(255,255,255,0.55)",
                    }}
                  >
                    {highlightMessage(displayLine)}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-white/[0.04] text-[10px] text-white/15">
          <span>{filteredLogs.length} lines{searchQuery && " (filtered)"}</span>
          <span>Polling every {POLL_INTERVAL / 1000}s &middot; POST /api/agent-activity</span>
        </div>
      </div>
    </div>
  );
}

/* ── Highlight hex hashes and dollar amounts ── */
function highlightMessage(msg: string): React.ReactNode {
  const parts = msg.split(/(0x[a-fA-F0-9]{6,}|(?:\$[\d,.]+))/g);
  if (parts.length === 1) return msg;
  return parts.map((part, i) => {
    if (part.startsWith("0x")) return <span key={i} className="text-purple-300/50">{part}</span>;
    if (part.startsWith("$")) return <span key={i} className="text-emerald-300/60">{part}</span>;
    return part;
  });
}
