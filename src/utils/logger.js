import { format } from "node:util";

/**
 * Unified, colorized, redaction-aware logging facade.
 *
 * Provides a single source of truth for log formatting across the bot. Every
 * line is tagged with a colored `[LEVEL]` prefix and a timestamp, and any
 * secret-shaped values are stripped before reaching stdout.
 *
 * Two entry points:
 *  - `createLogger(scope)` — scoped logger for new code.
 *  - `installGlobalConsole()` — patches the global console so existing
 *    `console.log("[INFO] ...")` style calls are colorized consistently.
 *
 * @module utils/logger
 */

const useColor =
  process.env.NO_COLOR === undefined &&
  process.env.FORCE_COLOR !== "0" &&
  (process.stdout?.isTTY || process.env.FORCE_COLOR);

/** ANSI styles keyed by log level. */
const COLORS = {
  DEBUG: "\u001b[34m", // blue
  INFO: "\u001b[36m", // cyan
  SUCCESS: "\u001b[32m", // green
  WARN: "\u001b[33m", // yellow
  ERROR: "\u001b[31m", // red
  DIM: "\u001b[2m",
  RESET: "\u001b[0m",
};

const LEVELS = ["DEBUG", "INFO", "SUCCESS", "WARN", "ERROR"];

const paint = (style, text) =>
  useColor ? `${style}${text}${COLORS.RESET}` : text;

const REDACTION_PATTERNS = [
  /\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,7}\.[A-Za-z0-9_-]{27,}\b/g,
  /(Bearer\s+)[A-Za-z0-9._-]{8,}/gi,
  /(eyJ[A-Za-z0-9._-]{20,})/g,
];

/**
 * Redacts secret-shaped substrings from a single log argument.
 * @param {unknown} arg
 * @returns {unknown}
 */
const redact = (arg) => {
  if (arg instanceof Error) return arg;
  const text = typeof arg === "string" ? arg : null;
  if (text !== null) {
    return REDACTION_PATTERNS.reduce(
      (acc, pattern) => acc.replace(pattern, "[REDACTED]"),
      text,
    );
  }
  if (arg && typeof arg === "object") {
    const formatted = format(arg);
    const cleaned = REDACTION_PATTERNS.reduce(
      (acc, pattern) => acc.replace(pattern, "[REDACTED]"),
      formatted,
    );
    return cleaned === formatted ? arg : cleaned;
  }
  return arg;
};

/** Short HH:MM:SS timestamp for log lines. */
const timestamp = () => new Date().toTimeString().slice(0, 8);

/**
 * Formats the colored prefix shared by every log line.
 * @param {string} level
 * @param {string|null} scope
 * @returns {string}
 */
const prefix = (level, scope) => {
  const color = COLORS[level] ?? COLORS.INFO;
  const time = paint(COLORS.DIM, timestamp());
  const tag = paint(color, `[${level}]`);
  const scopeTag = scope ? ` ${paint(COLORS.DIM, `[${scope}]`)}` : "";
  return `${time} ${tag}${scopeTag}`;
};

/** Maps a level to the underlying console method. */
const methodFor = (level) => {
  if (level === "ERROR") return console.error;
  if (level === "WARN") return console.warn;
  if (level === "DEBUG") return console.debug;
  return console.log;
};

/**
 * Creates a logger bound to a module scope. Each method prefixes a colored
 * level + scope tag and routes to the matching console method with secrets
 * redacted.
 *
 * @param {string} scope - Short module identifier, e.g. "KB" or "ticket".
 * @returns {{debug: Function, info: Function, success: Function, warn: Function, error: Function}}
 */
export const createLogger = (scope) => {
  const emit = (level, args) =>
    methodFor(level)(prefix(level, scope), ...args.map(redact));
  return {
    debug: (...args) => emit("DEBUG", args),
    info: (...args) => emit("INFO", args),
    success: (...args) => emit("SUCCESS", args),
    warn: (...args) => emit("WARN", args),
    error: (...args) => emit("ERROR", args),
  };
};

const LEVEL_TAG = new RegExp(`^\\[(${LEVELS.join("|")})\\]\\s?`);

/**
 * Rewrites a leading `[LEVEL]` tag in the first argument into the unified,
 * colorized prefix. Returns the original args unchanged when no tag is present.
 * @param {unknown[]} args
 * @returns {unknown[]}
 */
const colorizeArgs = (args) => {
  if (!args.length || typeof args[0] !== "string") return args.map(redact);
  const match = args[0].match(LEVEL_TAG);
  if (!match) return args.map(redact);
  const level = match[1];
  const rest = args[0].slice(match[0].length);
  const head = rest ? `${prefix(level)} ${redact(rest)}` : prefix(level);
  return [head, ...args.slice(1).map(redact)];
};

/**
 * Patches the global console so existing `[LEVEL]`-prefixed log calls across
 * the codebase render with the unified colorized format. Idempotent.
 * @returns {void}
 */
export function installGlobalConsole() {
  if (console.__shanthaPatched) return;
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
    info: console.info.bind(console),
  };

  const wrap = (fn) => (...args) => fn(...colorizeArgs(args));

  console.log = wrap(original.log);
  console.warn = wrap(original.warn);
  console.error = wrap(original.error);
  console.debug = wrap(original.debug);
  console.info = wrap(original.info);
  console.__shanthaPatched = true;
}
