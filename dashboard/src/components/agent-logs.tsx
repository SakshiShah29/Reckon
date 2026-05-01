"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ────── Types ────── */

interface LogEntry {
  id: string;
  timestamp: string;
  agentId: number;
  stage: string;
  message: string;
}

/* ────── Constants ────── */

const AGENTS = [
  { id: 0, model: "qwen-2.5-7b-instruct" },
  { id: 2, model: "GLM-5-FP8" },
  { id: 3, model: "GLM-5-FP8" },
] as const;

const STAGE_COLORS: Record<string, string> = {
  boot: "#a78bfa",
  triage: "#f59e0b",
  ebbo: "#6366f1",
  coordinate: "#00D4AA",
  decide: "#34d399",
  submit: "#ef4444",
  orchestrator: "#666",
  listener: "#555",
};

const TABS = ["All Agents", "Agent #0", "Agent #2", "Agent #3"] as const;

/* ────── Helpers ────── */

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return ts;
  }
}

function agentColor(id: number): string {
  if (id === 0) return "#a78bfa";
  if (id === 2) return "#6366f1";
  return "#00D4AA";
}

/* ────── Component ────── */

export function AgentLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string>("All Agents");
  const [autoScroll, setAutoScroll] = useState(true);
  const [lastHeartbeat, setLastHeartbeat] = useState<Record<number, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  /* Scroll to bottom when new logs arrive and auto-scroll is on */
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  /* Fetch historical logs on mount */
  useEffect(() => {
    async function fetchHistorical() {
      try {
        const res = await fetch("/api/logs?limit=200");
        if (!res.ok) return;
        const data: LogEntry[] = await res.json();
        setLogs(data);

        /* Seed heartbeat from historical logs */
        const hb: Record<number, number> = {};
        data.forEach((l) => {
          const t = new Date(l.timestamp).getTime();
          if (!hb[l.agentId] || t > hb[l.agentId]) hb[l.agentId] = t;
        });
        setLastHeartbeat(hb);
      } catch {
        /* API not available — use demo data */
        setLogs(DEMO_LOGS);
        const hb: Record<number, number> = {};
        DEMO_LOGS.forEach((l) => {
          hb[l.agentId] = Date.now();
        });
        setLastHeartbeat(hb);
      }
    }
    fetchHistorical();
  }, []);

  /* SSE connection for live logs */
  useEffect(() => {
    let es: EventSource;
    try {
      es = new EventSource("/api/logs/stream");
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const entry: LogEntry = JSON.parse(event.data);
          setLogs((prev) => {
            const next = [...prev, entry];
            return next.length > 500 ? next.slice(-400) : next;
          });
          setLastHeartbeat((prev) => ({
            ...prev,
            [entry.agentId]: Date.now(),
          }));
        } catch {
          /* skip malformed messages */
        }
      };

      es.onerror = () => {
        /* reconnect handled by browser EventSource */
      };
    } catch {
      /* SSE not available — running with demo data only */
    }

    return () => {
      if (es) es.close();
    };
  }, []);

  /* Filter logs by active tab */
  const filteredLogs = activeTab === "All Agents"
    ? logs
    : logs.filter((l) => `Agent #${l.agentId}` === activeTab);

  const isOnline = useCallback(
    (agentId: number) => {
      const last = lastHeartbeat[agentId];
      if (!last) return false;
      return Date.now() - last < 120_000; /* 2 minutes */
    },
    [lastHeartbeat],
  );

  return (
    <div>
      {/* Agent Status Cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {AGENTS.map((agent) => {
          const online = isOnline(agent.id);
          return (
            <div key={agent.id} className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ background: `${agentColor(agent.id)}20`, border: `1px solid ${agentColor(agent.id)}40` }}
                  >
                    #{agent.id}
                  </div>
                  <div>
                    <p className="text-[13px] text-white font-medium">iNFT #{agent.id}</p>
                    <p className="text-[10px] text-[#555] font-mono">{agent.model}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div
                    className={online ? "live-dot" : ""}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: online ? "#34d399" : "#444",
                    }}
                  />
                  <span className="text-[10px]" style={{ color: online ? "#34d399" : "#555" }}>
                    {online ? "Online" : "Offline"}
                  </span>
                </div>
              </div>
              <div className="flex gap-3 mt-2 pt-2 border-t border-[#1e1e1e]">
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider">Token ID</p>
                  <p className="text-white text-[13px] font-medium mt-0.5">{agent.id}</p>
                </div>
                <div>
                  <p className="text-[10px] text-[#555] uppercase tracking-wider">Status</p>
                  <p className="text-[13px] font-medium mt-0.5" style={{ color: online ? "#34d399" : "#555" }}>
                    {online ? "Active" : "Idle"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Log Viewer */}
      <div className="card overflow-hidden">
        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-[#222] px-4">
          <div className="flex">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-3 py-2.5 text-[12px] font-medium transition-colors relative"
                style={{ color: activeTab === tab ? "#fff" : "#555" }}
              >
                {tab}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00D4AA] rounded-t" />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className="text-[11px] px-2 py-1 rounded transition-colors"
            style={{
              color: autoScroll ? "#00D4AA" : "#555",
              background: autoScroll ? "#00D4AA10" : "transparent",
              border: `1px solid ${autoScroll ? "#00D4AA30" : "#333"}`,
            }}
          >
            {autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
          </button>
        </div>

        {/* Log Lines */}
        <div
          ref={scrollRef}
          className="overflow-y-auto p-3"
          style={{ maxHeight: 500, fontFamily: "var(--font-mono)" }}
        >
          {filteredLogs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-[#444] text-[12px]">No logs available — waiting for agent activity...</p>
            </div>
          ) : (
            filteredLogs.map((log, i) => {
              const stageColor = STAGE_COLORS[log.stage] || "#555";
              return (
                <div
                  key={log.id || i}
                  className="flex items-start gap-2 py-[3px] hover:bg-[#1a1a1a] -mx-2 px-2 rounded text-[11px] leading-[18px]"
                >
                  {/* Timestamp */}
                  <span className="text-[#444] flex-shrink-0 select-none">
                    {formatTime(log.timestamp)}
                  </span>

                  {/* Agent badge */}
                  <span
                    className="flex-shrink-0 px-1 py-[1px] rounded text-[10px] font-medium"
                    style={{
                      color: agentColor(log.agentId),
                      background: `${agentColor(log.agentId)}15`,
                      border: `1px solid ${agentColor(log.agentId)}25`,
                    }}
                  >
                    #{log.agentId}
                  </span>

                  {/* Stage tag */}
                  <span
                    className="flex-shrink-0 px-1.5 py-[1px] rounded text-[10px] font-medium"
                    style={{
                      color: stageColor,
                      background: `${stageColor}15`,
                    }}
                  >
                    [{log.stage}]
                  </span>

                  {/* Message */}
                  <span className="text-[#ccc] break-all">{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

/* ────── Demo data (used when API is not available) ────── */

const DEMO_LOGS: LogEntry[] = [
  { id: "d1", timestamp: new Date(Date.now() - 60000).toISOString(), agentId: 0, stage: "boot", message: "Agent #0 initialized — model qwen-2.5-7b-instruct loaded" },
  { id: "d2", timestamp: new Date(Date.now() - 55000).toISOString(), agentId: 2, stage: "boot", message: "Agent #2 initialized — model GLM-5-FP8 loaded" },
  { id: "d3", timestamp: new Date(Date.now() - 50000).toISOString(), agentId: 3, stage: "boot", message: "Agent #3 initialized — model GLM-5-FP8 loaded" },
  { id: "d4", timestamp: new Date(Date.now() - 45000).toISOString(), agentId: 0, stage: "listener", message: "Listening for UniswapX OrderFilled events on Base mainnet..." },
  { id: "d5", timestamp: new Date(Date.now() - 40000).toISOString(), agentId: 0, stage: "triage", message: "Fill 0xabc1…f4e2 received — USDC→WETH $2,450 via alice.solvers" },
  { id: "d6", timestamp: new Date(Date.now() - 38000).toISOString(), agentId: 0, stage: "triage", message: "Fill passes minimum threshold ($500), routing to EBBO check" },
  { id: "d7", timestamp: new Date(Date.now() - 35000).toISOString(), agentId: 0, stage: "ebbo", message: "Querying Uniswap V3 pool 0x8ad5…3e91 for EBBO reference price" },
  { id: "d8", timestamp: new Date(Date.now() - 33000).toISOString(), agentId: 0, stage: "ebbo", message: "EBBO price: 1 WETH = 2,412.50 USDC — fill price 2,450 — delta +1.55%" },
  { id: "d9", timestamp: new Date(Date.now() - 30000).toISOString(), agentId: 0, stage: "coordinate", message: "Broadcasting fill to AXL mesh — awaiting peer votes" },
  { id: "d10", timestamp: new Date(Date.now() - 28000).toISOString(), agentId: 2, stage: "coordinate", message: "Received fill 0xabc1…f4e2 from AXL mesh — running independent EBBO" },
  { id: "d11", timestamp: new Date(Date.now() - 25000).toISOString(), agentId: 2, stage: "ebbo", message: "Independent EBBO confirms delta +1.52% — within tolerance" },
  { id: "d12", timestamp: new Date(Date.now() - 23000).toISOString(), agentId: 3, stage: "coordinate", message: "Received fill 0xabc1…f4e2 from AXL mesh — running independent EBBO" },
  { id: "d13", timestamp: new Date(Date.now() - 20000).toISOString(), agentId: 3, stage: "ebbo", message: "Independent EBBO confirms delta +1.58% — within tolerance" },
  { id: "d14", timestamp: new Date(Date.now() - 18000).toISOString(), agentId: 0, stage: "coordinate", message: "2/2 peer votes received — consensus: NO CHALLENGE" },
  { id: "d15", timestamp: new Date(Date.now() - 15000).toISOString(), agentId: 0, stage: "decide", message: "Decision: PASS — fill within EBBO tolerance, no challenge needed" },
  { id: "d16", timestamp: new Date(Date.now() - 12000).toISOString(), agentId: 0, stage: "orchestrator", message: "Pipeline complete for fill 0xabc1…f4e2 — recorded to 0G KV" },
  { id: "d17", timestamp: new Date(Date.now() - 8000).toISOString(), agentId: 0, stage: "triage", message: "Fill 0x7f3a…2b91 received — WETH→USDC $18,200 via wintermute" },
  { id: "d18", timestamp: new Date(Date.now() - 5000).toISOString(), agentId: 0, stage: "ebbo", message: "Querying Uniswap V3 pool for EBBO reference price..." },
];
