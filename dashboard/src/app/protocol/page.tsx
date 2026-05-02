"use client";

import { useState } from "react";
import { ProtocolFills } from "@/components/protocol-fills";
import { ProtocolChallenges } from "@/components/protocol-challenges";
import { ProtocolSolvers } from "@/components/protocol-solvers";

const tabs = ["Fills", "Challenges", "Solvers"] as const;
type Tab = (typeof tabs)[number];

export default function ProtocolPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Fills");

  return (
    <div className="p-5">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[20px] font-semibold text-white/90 tracking-tight">Protocol</h1>
        <p className="text-[13px] text-white/35 mt-1">
          Fills, challenges, and solver reputation
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-5">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-[6px] rounded-xl text-[13px] font-medium transition-all ${
              activeTab === tab
                ? "bg-white/[0.07] text-white/90 border border-white/[0.08]"
                : "text-white/30 hover:text-white/60 border border-transparent"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "Fills" && <ProtocolFills />}
      {activeTab === "Challenges" && <ProtocolChallenges />}
      {activeTab === "Solvers" && <ProtocolSolvers />}
    </div>
  );
}
