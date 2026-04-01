/**
 * Shared logger — lightweight, level-based, namespace-aware.
 *
 * Usage:
 *   import { createLogger } from '../logger';
 *   const log = createLogger('my-module');
 *   log.info('Starting...', { count: 5 });
 *
 * Environment:
 *   LOG_LEVEL=debug|info|warn|error   (default: info)
 *   LOG_FILE=true                     → appends to data/logs/YYYY-MM-DD.log
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { dateToString, getTimeString } from "@shared/dates";

// ─── Level ordering ───────────────────────────────────────────────────────────
export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ─── ANSI colours (no external dep) ──────────────────────────────────────────
const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  debug: "\x1b[36m", // cyan
  info: "\x1b[32m", // green
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
};

const isTTY = process.stdout.isTTY ?? false;

// ─── Configuration ────────────────────────────────────────────────────────────
const minLevel: number =
  LEVEL_ORDER[(process.env["LOG_LEVEL"] as LogLevel) ?? "info"] ??
  LEVEL_ORDER.info;
const logToFile = process.env["LOG_FILE"] === "true";

// ─── File sink (lazy init) ────────────────────────────────────────────────────
let fileStream: fs.WriteStream | null = null;

function getFileStream(): fs.WriteStream {
  if (!fileStream) {
    const logDir = path.join(process.cwd(), "data", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const today = dateToString();
    fileStream = fs.createWriteStream(path.join(logDir, `${today}.log`), {
      flags: "a",
    });
  }
  return fileStream;
}

// ─── Logger interface ─────────────────────────────────────────────────────────
export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────
export function createLogger(namespace: string): Logger {
  function write(level: LogLevel, msg: string, args: unknown[]): void {
    if (LEVEL_ORDER[level] < minLevel) return;

    const ts = getTimeString(); // HH:MM:SS
    const label = level.toUpperCase().padEnd(5);
    const suffix = args.length
      ? " " +
        args
          .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
          .join(" ")
      : "";

    const plain = `[${ts}] [${label}] [${namespace}] ${msg}${suffix}`;
    const colored = isTTY
      ? `${C.dim}[${ts}]${C.reset} ${C[level]}[${label}]${C.reset} ${C.dim}[${namespace}]${C.reset} ${msg}${suffix}`
      : plain;

    if (level === "error") {
      console.error(colored);
    } else {
      console.log(colored);
    }

    if (logToFile) getFileStream().write(plain + "\n");
  }

  return {
    debug: (msg, ...args) => write("debug", msg, args),
    info: (msg, ...args) => write("info", msg, args),
    warn: (msg, ...args) => write("warn", msg, args),
    error: (msg, ...args) => write("error", msg, args),
  };
}

/** Default application-level logger (namespace: 'app'). */
export const log: Logger = createLogger("app");
