"use client";

import { AdjudicationFlow } from "@/components/adjudication-flow";

export default function AdjudicationPage() {
  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 relative">
        <div>
          <h1
            className="text-[28px] font-extrabold text-[#1E293B] tracking-tight"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Adjudication
          </h1>
          <p className="text-[14px] text-[#64748B] mt-1 font-medium">
            How the protocol decides challenges and redistributes solver bonds
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-[#EF4444] border-2 border-[#1E293B] rotate-45 opacity-60" />
          <div className="w-5 h-5 rounded-full bg-[#34D399] border-2 border-[#1E293B] opacity-60" />
          <div className="w-3 h-3 bg-[#FBBF24] border-2 border-[#1E293B] opacity-60" style={{ clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)" }} />
        </div>
      </div>

      <AdjudicationFlow />
    </div>
  );
}
