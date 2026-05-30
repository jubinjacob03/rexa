import { format } from "node:util";

/**
 * Scoped, redaction-aware logging facade.
 *
 * Wraps the global console with a level + module-scope prefix (matching the bot's
 * existing `[LEVEL]` convention) and strips secret-shaped values so tokens and API
 * keys never reach stdout or log aggregators.
 *
 * @module utils/logger
 */

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

/**
 * Creates a logger bound to a module scope. Each method prefixes the level and
 * scope tag and routes to the matching console method with secrets redacted.
 *
 * @param {string} scope - Short module identifier, e.g. "KB" or "ticket".
 * @returns {{debug: Function, info: Function, warn: Function, error: Function}}
 */
export const createLogger = (scope) => {
  const tag = `[${scope}]`;
  const emit = (method, level, args) =>
    method(`[${level}]`, tag, ...args.map(redact));
  return {
    debug: (...args) => emit(console.debug, "DEBUG", args),
    info: (...args) => emit(console.log, "INFO", args),
    warn: (...args) => emit(console.warn, "WARN", args),
    error: (...args) => emit(console.error, "ERROR", args),
  };
};
