/**
 * Pretty terminal logger for the Reckon Challenger Agent.
 * Zero dependencies — uses raw ANSI escape codes.
 */

// ── ANSI color codes ────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // foreground
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // bright foreground
  gray: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",

  // background
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
} as const;

// ── Unicode symbols ─────────────────────────────────────────
const sym = {
  check: "✓",
  cross: "✗",
  arrow: "→",
  arrowDown: "↓",
  dot: "●",
  ring: "○",
  star: "★",
  bolt: "⚡",
  warn: "⚠",
  info: "ℹ",
  heart: "♥",
  pipe: "│",
  pipeBold: "┃",
  corner: "└",
  tee: "├",
  topCorner: "┌",
  dash: "─",
  doubleDash: "═",
  block: "█",
  halfBlock: "▌",
} as const;

// ── Module colors ───────────────────────────────────────────
const MODULE_COLORS: Record<string, string> = {
  orchestrator: c.brightCyan,
  boot: c.brightMagenta,
  bootstrap: c.magenta,
  listener: c.brightBlue,
  triage: c.yellow,
  ebbo: c.brightGreen,
  coordinate: c.cyan,
  decide: c.brightYellow,
  submit: c.brightRed,
};

// ── Timestamp ───────────────────────────────────────────────
function timestamp(): string {
  const now = new Date();
  const h = now.getHours().toString().padStart(2, "0");
  const m = now.getMinutes().toString().padStart(2, "0");
  const s = now.getSeconds().toString().padStart(2, "0");
  const ms = now.getMilliseconds().toString().padStart(3, "0");
  return `${c.dim}${h}:${m}:${s}.${ms}${c.reset}`;
}

// ── Module badge ────────────────────────────────────────────
function badge(mod: string): string {
  const color = MODULE_COLORS[mod] ?? c.white;
  return `${color}${c.bold}[${mod}]${c.reset}`;
}

// ── Pipeline step indicator ─────────────────────────────────
const PIPELINE_STEPS = ["triage", "ebbo", "coordinate", "decide", "submit"] as const;

function stepIndicator(currentStep: string): string {
  const parts = PIPELINE_STEPS.map((step) => {
    if (step === currentStep) {
      return `${c.brightWhite}${c.bold}${sym.dot} ${step}${c.reset}`;
    }
    const idx = PIPELINE_STEPS.indexOf(step as (typeof PIPELINE_STEPS)[number]);
    const curIdx = PIPELINE_STEPS.indexOf(currentStep as (typeof PIPELINE_STEPS)[number]);
    if (idx < curIdx) {
      return `${c.green}${sym.check} ${step}${c.reset}`;
    }
    return `${c.dim}${sym.ring} ${step}${c.reset}`;
  });
  return parts.join(` ${c.dim}${sym.arrow}${c.reset} `);
}

// ── Main logger ─────────────────────────────────────────────
export const log = {
  /**
   * General info log with module tag
   */
  info(mod: string, msg: string) {
    console.log(`${timestamp()} ${badge(mod)} ${msg}`);
  },

  /**
   * Success log (green checkmark)
   */
  success(mod: string, msg: string) {
    console.log(`${timestamp()} ${badge(mod)} ${c.green}${sym.check}${c.reset} ${msg}`);
  },

  /**
   * Warning log (yellow)
   */
  warn(mod: string, msg: string, err?: unknown) {
    const errStr = err instanceof Error ? ` ${c.dim}(${err.message})${c.reset}` : err ? ` ${c.dim}(${err})${c.reset}` : "";
    console.warn(`${timestamp()} ${badge(mod)} ${c.yellow}${sym.warn}${c.reset} ${c.yellow}${msg}${c.reset}${errStr}`);
  },

  /**
   * Error log (red cross)
   */
  error(mod: string, msg: string, err?: unknown) {
    const errStr = err instanceof Error ? ` ${c.dim}(${err.message})${c.reset}` : err ? ` ${c.dim}(${err})${c.reset}` : "";
    console.error(`${timestamp()} ${badge(mod)} ${c.red}${sym.cross}${c.reset} ${c.red}${msg}${c.reset}${errStr}`);
  },

  /**
   * Fatal error — red background
   */
  fatal(mod: string, msg: string, err?: unknown) {
    const errStr = err instanceof Error ? err.message : String(err ?? "");
    console.error(`${timestamp()} ${c.bgRed}${c.white}${c.bold} FATAL ${c.reset} ${badge(mod)} ${c.red}${msg}${c.reset}`);
    if (errStr) console.error(`         ${c.dim}${errStr}${c.reset}`);
  },

  /**
   * Dim/debug log
   */
  debug(mod: string, msg: string) {
    if (process.env["LOG_LEVEL"] === "debug") {
      console.log(`${timestamp()} ${c.dim}[${mod}] ${msg}${c.reset}`);
    }
  },

  /**
   * Pipeline step: show progress through the pipeline
   */
  step(mod: string, tag: string, msg: string) {
    console.log(`${timestamp()} ${badge(mod)} ${c.dim}${tag}${c.reset} ${msg}`);
    console.log(`         ${stepIndicator(mod)}`);
  },

  /**
   * Fill header — big visual separator for a new fill
   */
  fill(tag: string) {
    const line = sym.dash.repeat(50);
    console.log("");
    console.log(`${c.brightCyan}${c.bold}  ${sym.topCorner}${line}${c.reset}`);
    console.log(`${c.brightCyan}${c.bold}  ${sym.pipe} ${sym.bolt} Fill ${tag}${c.reset}`);
    console.log(`${c.brightCyan}${c.bold}  ${sym.pipe}${c.reset} ${timestamp()}`);
    console.log(`${c.brightCyan}${c.bold}  ${sym.corner}${line}${c.reset}`);
  },

  /**
   * Decision box — highlight CHALLENGE vs SKIP
   */
  decision(tag: string, shouldChallenge: boolean, reason: string) {
    const label = shouldChallenge
      ? `${c.bgRed}${c.white}${c.bold} CHALLENGE ${c.reset}`
      : `${c.bgYellow}${c.black}${c.bold} SKIP ${c.reset}`;
    console.log("");
    console.log(`${timestamp()} ${badge("decide")} ${c.dim}${tag}${c.reset} ${label}`);
    console.log(`         ${c.dim}${sym.corner} ${reason}${c.reset}`);
    console.log("");
  },

  /**
   * Slashable result — highlight shortfall
   */
  slashable(tag: string, shortfall: bigint, expected: bigint) {
    console.log(
      `${timestamp()} ${badge("ebbo")} ${c.dim}${tag}${c.reset} ` +
        `${c.red}${c.bold}SLASHABLE${c.reset} ` +
        `shortfall=${c.brightRed}${shortfall}${c.reset} ` +
        `expected=${c.dim}${expected}${c.reset}`,
    );
  },

  /**
   * Submission result
   */
  submitted(tag: string, txHash: string) {
    console.log("");
    console.log(
      `${timestamp()} ${badge("submit")} ${c.dim}${tag}${c.reset} ` +
        `${c.green}${c.bold}${sym.check} CHALLENGE SUBMITTED${c.reset}`,
    );
    console.log(`         ${c.dim}tx: ${txHash}${c.reset}`);
    console.log("");
  },

  /**
   * Skip reason (gray, not noisy)
   */
  skip(mod: string, tag: string, reason: string) {
    console.log(
      `${timestamp()} ${badge(mod)} ${c.dim}${tag} ${sym.arrow} skip: ${reason}${c.reset}`,
    );
  },

  /**
   * Heartbeat (very subtle)
   */
  heartbeat() {
    console.log(
      `${timestamp()} ${c.dim}${sym.heart} heartbeat — alive, listening for fills${c.reset}`,
    );
  },

  /**
   * NL explanation from triage
   */
  explanation(tag: string, explanation: string) {
    console.log(`${timestamp()} ${badge("submit")} ${c.dim}${tag}${c.reset} ${c.italic}NL: ${explanation}${c.reset}`);
  },

  /**
   * Banner on startup
   */
  banner() {
    console.log("");
    console.log(`${c.brightCyan}${c.bold}  ╔═══════════════════════════════════════════════╗${c.reset}`);
    console.log(`${c.brightCyan}${c.bold}  ║         ${sym.bolt} RECKON CHALLENGER AGENT ${sym.bolt}          ║${c.reset}`);
    console.log(`${c.brightCyan}${c.bold}  ║   cryptoeconomic validation layer for DeFi    ║${c.reset}`);
    console.log(`${c.brightCyan}${c.bold}  ╚═══════════════════════════════════════════════╝${c.reset}`);
    console.log("");
  },

  /**
   * Pipeline summary on startup
   */
  pipeline() {
    console.log(
      `  ${c.dim}pipeline:${c.reset} ` +
        `${c.yellow}triage${c.reset} ${c.dim}→${c.reset} ` +
        `${c.brightGreen}ebbo${c.reset} ${c.dim}→${c.reset} ` +
        `${c.cyan}coordinate${c.reset} ${c.dim}→${c.reset} ` +
        `${c.brightYellow}decide${c.reset} ${c.dim}→${c.reset} ` +
        `${c.brightRed}submit${c.reset}`,
    );
    console.log("");
  },

  /**
   * Shutdown message
   */
  shutdown() {
    console.log("");
    console.log(`${timestamp()} ${badge("orchestrator")} ${c.dim}Shutting down gracefully...${c.reset}`);
    console.log("");
  },
};

export { c, sym };
