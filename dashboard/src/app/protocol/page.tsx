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
        <h1 className="text-2xl font-semibold text-white">Protocol</h1>
        <p className="text-[13px] text-[#666] mt-1">
          Fills, challenges, and solver reputation
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0.5 mb-5">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              activeTab === tab
                ? "bg-[#1a1a1a] text-white"
                : "text-[#666] hover:text-[#999]"
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
