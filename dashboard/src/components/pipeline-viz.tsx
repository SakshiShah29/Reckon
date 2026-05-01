"use client";

import { useState, useEffect } from "react";

/* ────── Types ────── */

interface PipelineStage {
  name: string;
  color: string;
}

interface MeshNode {
  id: number;
  peerKey: string;
  label: string;
}

/* ────── Constants ────── */

const STAGES: PipelineStage[] = [
  { name: "triage", color: "#f59e0b" },
  { name: "ebbo", color: "#6366f1" },
  { name: "coordinate", color: "#00D4AA" },
  { name: "decide", color: "#34d399" },
  { name: "submit", color: "#ef4444" },
];

const MESH_NODES: MeshNode[] = [
  { id: 0, peerKey: "0x4a8f…e7c1", label: "Agent #0 (Hub)" },
  { id: 2, peerKey: "0xb3d2…91fa", label: "Agent #2" },
  { id: 3, peerKey: "0xc7e5…3b08", label: "Agent #3" },
];

/* ────── Component ────── */

export function PipelineViz() {
  const [activeStage, setActiveStage] = useState<number>(2);
  const [currentFill, setCurrentFill] = useState<string | null>("0x7f3a…2b91");
  const [nodesOnline, setNodesOnline] = useState<Record<number, boolean>>({ 0: true, 2: true, 3: true });

  /* Simulate stage progression for demo */
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStage((prev) => {
        if (prev >= STAGES.length - 1) {
          /* Reset with a "new" fill */
          setCurrentFill((f) => (f === "0x7f3a…2b91" ? "0xe902…cc18" : "0x7f3a…2b91"));
          return 0;
        }
        return prev + 1;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="grid grid-cols-[1fr_320px] gap-4">
      {/* Pipeline Flow */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white text-[13px] font-medium">Pipeline Status</p>
            <p className="text-[11px] text-[#555]">5-stage challenger pipeline flow</p>
          </div>
          {currentFill && (
            <div className="flex items-center gap-2">
              <div className="live-dot" />
              <span className="text-[11px] text-[#888] font-mono">Processing {currentFill}</span>
            </div>
          )}
        </div>

        {/* Stage boxes with arrows */}
        <div className="flex items-center justify-between gap-1 mt-6 mb-2">
          {STAGES.map((stage, idx) => {
            const isActive = idx <= activeStage;
            const isCurrent = idx === activeStage;
            const color = stage.color;

            return (
              <div key={stage.name} className="flex items-center flex-1">
                {/* Stage box */}
                <div
                  className="flex-1 py-3 px-2 rounded-lg text-center transition-all duration-500 relative"
                  style={{
                    background: isActive ? `${color}15` : "#1a1a1a",
                    border: `1px solid ${isActive ? `${color}40` : "#282828"}`,
                    boxShadow: isCurrent ? `0 0 16px ${color}20` : "none",
                  }}
                >
                  {/* Animated glow ring for current stage */}
                  {isCurrent && (
                    <div
                      className="absolute inset-0 rounded-lg animate-pulse"
                      style={{
                        border: `1px solid ${color}60`,
                        pointerEvents: "none",
                      }}
                    />
                  )}

                  <p
                    className="text-[12px] font-medium transition-colors duration-500"
                    style={{ color: isActive ? color : "#444" }}
                  >
                    {stage.name}
                  </p>
                  <p
                    className="text-[9px] mt-0.5 transition-colors duration-500"
                    style={{ color: isActive ? `${color}99` : "#333" }}
                  >
                    {isCurrent ? "running" : isActive ? "done" : "pending"}
                  </p>
                </div>

                {/* Arrow between stages */}
                {idx < STAGES.length - 1 && (
                  <div className="flex-shrink-0 mx-1">
                    <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                      <path
                        d="M0 6H16M16 6L12 2M16 6L12 10"
                        stroke={idx < activeStage ? STAGES[idx + 1].color : "#333"}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ transition: "stroke 0.5s" }}
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stage progress bar */}
        <div className="mt-4 h-1 rounded-full bg-[#1a1a1a] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${((activeStage + 1) / STAGES.length) * 100}%`,
              background: `linear-gradient(90deg, ${STAGES[0].color}, ${STAGES[activeStage].color})`,
            }}
          />
        </div>
      </div>

      {/* AXL Mesh Status */}
      <div className="card p-5">
        <div className="mb-4">
          <p className="text-white text-[13px] font-medium">AXL Mesh</p>
          <p className="text-[11px] text-[#555]">Hub-spoke topology (Gensyn)</p>
        </div>

        {/* Mesh visualization */}
        <div className="relative" style={{ height: 180 }}>
          <svg width="100%" height="100%" viewBox="0 0 280 180" fill="none" className="absolute inset-0">
            {/* Connection lines: hub (node 0) to spoke nodes */}
            {/* Hub at center-top, spokes at bottom-left and bottom-right */}
            <line x1="140" y1="45" x2="60" y2="140" stroke="#00D4AA" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="4 3" />
            <line x1="140" y1="45" x2="220" y2="140" stroke="#00D4AA" strokeWidth="1" strokeOpacity="0.3" strokeDasharray="4 3" />
            {/* Peer-to-peer line (through hub) */}
            <line x1="60" y1="140" x2="220" y2="140" stroke="#333" strokeWidth="1" strokeOpacity="0.2" strokeDasharray="2 4" />

            {/* Animated data packets on the hub-spoke lines */}
            <circle r="2" fill="#00D4AA" opacity="0.8">
              <animateMotion dur="3s" repeatCount="indefinite" path="M140,45 L60,140" />
            </circle>
            <circle r="2" fill="#6366f1" opacity="0.8">
              <animateMotion dur="3.5s" repeatCount="indefinite" path="M140,45 L220,140" />
            </circle>
            <circle r="2" fill="#a78bfa" opacity="0.6">
              <animateMotion dur="4s" repeatCount="indefinite" path="M60,140 L140,45" />
            </circle>
          </svg>

          {/* Node circles overlaid */}
          {MESH_NODES.map((node, idx) => {
            const online = nodesOnline[node.id];
            const positions = [
              { left: "50%", top: "10px", transform: "translateX(-50%)" },    /* Hub: center top */
              { left: "5px", top: "110px", transform: "none" },                /* Spoke left */
              { right: "5px", top: "110px", transform: "none" },               /* Spoke right */
            ];
            const pos = positions[idx];
            const nodeColor = idx === 0 ? "#a78bfa" : idx === 1 ? "#6366f1" : "#00D4AA";

            return (
              <div
                key={node.id}
                className="absolute flex flex-col items-center"
                style={pos}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
                  style={{
                    background: online ? `${nodeColor}20` : "#1a1a1a",
                    border: `2px solid ${online ? nodeColor : "#333"}`,
                    color: online ? nodeColor : "#444",
                    boxShadow: online ? `0 0 12px ${nodeColor}30` : "none",
                  }}
                >
                  #{node.id}
                </div>
                <p className="text-[10px] text-[#888] mt-1 font-medium whitespace-nowrap">{node.label}</p>
                <p className="text-[9px] text-[#444] font-mono">{node.peerKey}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <div
                    className={online ? "live-dot" : ""}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: online ? "#34d399" : "#444",
                    }}
                  />
                  <span className="text-[8px]" style={{ color: online ? "#34d399" : "#555" }}>
                    {online ? "connected" : "disconnected"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Mesh stats */}
        <div className="flex gap-4 mt-2 pt-3 border-t border-[#1e1e1e]">
          <div>
            <p className="text-[9px] text-[#555] uppercase tracking-wider">Peers</p>
            <p className="text-white text-[13px] font-medium">3/3</p>
          </div>
          <div>
            <p className="text-[9px] text-[#555] uppercase tracking-wider">Messages</p>
            <p className="text-white text-[13px] font-medium font-mono">247</p>
          </div>
          <div>
            <p className="text-[9px] text-[#555] uppercase tracking-wider">Latency</p>
            <p className="text-white text-[13px] font-medium font-mono">42ms</p>
          </div>
        </div>
      </div>
    </div>
  );
}
