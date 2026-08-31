import { format } from "node:util";

const useColor =
  process.env.NO_COLOR === undefined &&
  process.env.FORCE_COLOR !== "0" &&
  (process.stdout?.isTTY || process.env.FORCE_COLOR);

const COLORS = {
  DEBUG: "\u001b[34m",
  INFO: "\u001b[36m",
  SUCCESS: "\u001b[32m",
  WARN: "\u001b[33m",
  ERROR: "\u001b[31m",
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

const timestamp = () => new Date().toTimeString().slice(0, 8);

const prefix = (level, scope) => {
  const color = COLORS[level] ?? COLORS.INFO;
  const time = paint(COLORS.DIM, timestamp());
  const tag = paint(color, `[${level}]`);
  const scopeTag = scope ? ` ${paint(COLORS.DIM, `[${scope}]`)}` : "";
  return `${time} ${tag}${scopeTag}`;
};

const methodFor = (level) => {
  if (level === "ERROR") return console.error;
  if (level === "WARN") return console.warn;
  if (level === "DEBUG") return console.debug;
  return console.log;
};

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

const colorizeArgs = (args) => {
  if (!args.length || typeof args[0] !== "string") return args.map(redact);
  const match = args[0].match(LEVEL_TAG);
  if (!match) return args.map(redact);
  const level = match[1];
  const rest = args[0].slice(match[0].length);
  const head = rest ? `${prefix(level)} ${redact(rest)}` : prefix(level);
  return [head, ...args.slice(1).map(redact)];
};

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
