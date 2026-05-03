/**
 * Structured logger for the Reckon Indexer.
 * Adds ISO timestamps, log levels, and module tags to every line.
 * Render picks up stdout/stderr automatically — no external deps needed.
 */

type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, module: string, msg: string, meta?: Record<string, unknown>): string {
  const base = `${formatTimestamp()} [${level}] [${module}] ${msg}`;
  if (meta && Object.keys(meta).length > 0) {
    const pairs = Object.entries(meta)
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
    return `${base} | ${pairs}`;
  }
  return base;
}

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, err?: unknown, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
  return {
    info(msg, meta) {
      console.log(formatMessage("INFO", module, msg, meta));
    },
    warn(msg, meta) {
      console.warn(formatMessage("WARN", module, msg, meta));
    },
    error(msg, err, meta) {
      console.error(formatMessage("ERROR", module, msg, meta));
      if (err instanceof Error) {
        console.error(`  → ${err.message}`);
        if (err.stack) {
          const frames = err.stack.split("\n").slice(1, 4).join("\n");
          console.error(frames);
        }
      } else if (err !== undefined) {
        console.error(`  →`, err);
      }
    },
    debug(msg, meta) {
      if (process.env["LOG_LEVEL"] === "debug") {
        console.log(formatMessage("DEBUG", module, msg, meta));
      }
    },
  };
}

/** Redact a private key for safe logging: 0x1234...abcd */
export function redactKey(key: string): string {
  if (key.length <= 10) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/** Shorten an address or hash: 0x1234...abcd */
export function short(val: string, len = 6): string {
  if (val.length <= len * 2 + 3) return val;
  return `${val.slice(0, len)}...${val.slice(-4)}`;
}

/** Format a duration in ms to a human-readable string */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
