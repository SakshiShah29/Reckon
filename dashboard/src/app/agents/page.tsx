import { AgentLogs } from "@/components/agent-logs";
import { PipelineViz } from "@/components/pipeline-viz";

export default function AgentsPage() {
  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-end justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agents</h1>
          <p className="text-[13px] text-[#666] mt-1">
            Monitor live agent nodes, orchestrator pipelines, and Gensyn AXL mesh connectivity
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="live-dot" />
          <span className="text-[11px] text-[#888]">Live monitoring</span>
        </div>
      </div>

      {/* Agent cards + Log viewer */}
      <AgentLogs />

      {/* Pipeline visualization + AXL mesh */}
      <div className="mt-4">
        <PipelineViz />
      </div>
    </div>
  );
}
