import { mkdirSync, appendFileSync, existsSync, statSync, renameSync } from "fs";
import { join } from "path";
import { CONFIG_DIR } from "../config/index.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, error?: unknown): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOG_DIR = join(CONFIG_DIR, "logs");
const LOG_FILE = join(LOG_DIR, "todoist-cli.log");
const LOG_BACKUP = join(LOG_DIR, "todoist-cli.log.1");
const MAX_LOG_SIZE = 1024 * 1024; // 1 MB

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ---------------------------------------------------------------------------
// State (singleton)
// ---------------------------------------------------------------------------

let initialized = false;
let minLevel: LogLevel = "info";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseLogLevel(value: string | undefined): LogLevel {
  if (!value) return "info";
  const lower = value.toLowerCase();
  if (lower === "debug" || lower === "info" || lower === "warn" || lower === "error") {
    return lower;
  }
  return "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? `${err.name}: ${err.message}`;
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return "";
  return " " + args.map((a) => {
    if (typeof a === "string") return a;
    try {
      return JSON.stringify(a);
    } catch {
      return String(a);
    }
  }).join(" ");
}

function writeLine(line: string): void {
  try {
    appendFileSync(LOG_FILE, line + "\n", "utf-8");
  } catch {
    // Silently ignore write failures — the logger must never throw.
  }
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

function rotateIfNeeded(): void {
  try {
    if (!existsSync(LOG_FILE)) return;
    const stats = statSync(LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      // Keep only 1 backup — overwrite any existing .log.1
      renameSync(LOG_FILE, LOG_BACKUP);
    }
  } catch {
    // Silently ignore rotation failures.
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the logger. Creates the log directory and performs rotation
 * check. Should be called once at app startup. Safe to call multiple times
 * (subsequent calls are no-ops).
 */
export function initLogger(): void {
  if (initialized) return;
  try {
    minLevel = parseLogLevel(process.env.TODOIST_LOG_LEVEL);
    mkdirSync(LOG_DIR, { recursive: true });
    rotateIfNeeded();
    initialized = true;
  } catch {
    // If we cannot create the log directory we degrade silently —
    // subsequent write attempts will individually fail and be caught.
    initialized = true;
  }
}

/**
 * Returns a Logger scoped to the given category. The category appears in
 * each log line between brackets, e.g. `[api:tasks]`.
 *
 * The logger is lazy-initialized: if `initLogger()` has not been called yet,
 * the first `getLogger()` call will trigger initialization automatically.
 */
export function getLogger(category?: string): Logger {
  if (!initialized) {
    initLogger();
  }

  const prefix = category ? ` [${category}]` : "";

  function log(level: LogLevel, msg: string, extra?: unknown[]): void {
    try {
      if (!shouldLog(level)) return;

      const timestamp = new Date().toISOString();
      const tag = level.toUpperCase();
      let line = `[${timestamp}] [${tag}]${prefix} ${msg}`;

      // Append extra args (for debug/info/warn)
      if (extra && extra.length > 0) {
        line += formatArgs(extra);
      }

      writeLine(line);
    } catch {
      // Never throw from the logger.
    }
  }

  return {
    debug(msg: string, ...args: unknown[]): void {
      log("debug", msg, args);
    },

    info(msg: string, ...args: unknown[]): void {
      log("info", msg, args);
    },

    warn(msg: string, ...args: unknown[]): void {
      log("warn", msg, args);
    },

    error(msg: string, error?: unknown): void {
      try {
        if (!shouldLog("error")) return;

        const timestamp = new Date().toISOString();
        let line = `[${timestamp}] [ERROR]${prefix} ${msg}`;
        writeLine(line);

        if (error !== undefined) {
          writeLine("  " + formatError(error));
        }
      } catch {
        // Never throw from the logger.
      }
    },
  };
}
