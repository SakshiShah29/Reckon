// In-memory log store with ring buffer per agent

export interface LogEntry {
  agentId: number;
  timestamp: number;
  stage: string; // "boot" | "triage" | "ebbo" | "coordinate" | "decide" | "submit" | "orchestrator" | "listener"
  message: string;
  raw: string;
}

const MAX_LOGS_PER_AGENT = 500;
const logs: Map<number, LogEntry[]> = new Map();
const subscribers: Set<(entry: LogEntry) => void> = new Set();

export function addLog(entry: LogEntry): void {
  const agentLogs = logs.get(entry.agentId) ?? [];
  agentLogs.push(entry);
  if (agentLogs.length > MAX_LOGS_PER_AGENT) agentLogs.shift();
  logs.set(entry.agentId, agentLogs);
  subscribers.forEach((fn) => fn(entry));
}

export function getLogs(agentId?: number, limit = 100): LogEntry[] {
  if (agentId !== undefined) {
    return (logs.get(agentId) ?? []).slice(-limit);
  }
  const all: LogEntry[] = [];
  logs.forEach((entries) => all.push(...entries));
  return all.sort((a, b) => a.timestamp - b.timestamp).slice(-limit);
}

export function subscribe(fn: (entry: LogEntry) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

// Parse a raw log line to extract stage
export function parseLogLine(raw: string): { stage: string; message: string } {
  const match = raw.match(/\[(\w+)\]\s*(.*)/);
  if (match) return { stage: match[1], message: match[2] };
  return { stage: "info", message: raw };
}
