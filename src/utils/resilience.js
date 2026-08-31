import { createLogger } from "./logger.js";

const log = createLogger("resilience");

export const IGNORABLE_DISCORD_CODES = new Set([10003, 10008, 10062, 40060]);

export const isIgnorableDiscordError = (error) =>
  Boolean(error) &&
  typeof error === "object" &&
  IGNORABLE_DISCORD_CODES.has(error.code);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 200,
    maxDelayMs = 5000,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error, attempt)) break;
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      if (onRetry) onRetry(error, attempt + 1, delay);
      await sleep(delay);
    }
  }
  throw lastError;
}

export async function swallow(promise, context) {
  try {
    await promise;
  } catch (error) {
    if (isIgnorableDiscordError(error)) return;
    log.warn(`${context}:`, error?.message || error);
  }
}

export async function safeAck(interaction, options = {}) {
  const { mode = "deferReply", ephemeral = true } = options;
  if (interaction.deferred || interaction.replied) return false;
  try {
    if (mode === "deferUpdate") {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply(ephemeral ? { flags: 64 } : {});
    }
    return true;
  } catch (error) {
    if (isIgnorableDiscordError(error)) return false;
    throw error;
  }
}

export class BoundedMap {
  constructor({ maxSize = 1000, ttlMs = 0 } = {}) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires && entry.expires <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.store.has(key)) this.store.delete(key);
    this.store.set(key, {
      value,
      expires: this.ttlMs ? Date.now() + this.ttlMs : 0,
    });
    while (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
    return this;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }

  *entries() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expires && entry.expires <= now) {
        this.store.delete(key);
        continue;
      }
      yield [key, entry.value];
    }
  }
}
