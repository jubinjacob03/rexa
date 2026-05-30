import { createLogger } from "./logger.js";

/**
 * Resilience primitives shared across the bot: retry-with-backoff, safe interaction
 * acknowledgement, intentional promise suppression, and a size/TTL-bounded map.
 *
 * @module utils/resilience
 */

const log = createLogger("resilience");

/**
 * Discord REST error codes representing an interaction or message that can no longer
 * be acted upon. Expected during normal operation, never treated as bugs.
 *
 * - 10003: Unknown channel
 * - 10008: Unknown message
 * - 10062: Unknown interaction (token expired before acknowledgement)
 * - 40060: Interaction already acknowledged
 *
 * @type {ReadonlySet<number>}
 */
export const IGNORABLE_DISCORD_CODES = new Set([10003, 10008, 10062, 40060]);

/**
 * @param {unknown} error
 * @returns {boolean} True if the error is a known, expected Discord API code.
 */
export const isIgnorableDiscordError = (error) =>
  Boolean(error) &&
  typeof error === "object" &&
  IGNORABLE_DISCORD_CODES.has(error.code);

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Invokes an async function, retrying on failure with exponential backoff.
 *
 * @template T
 * @param {() => Promise<T>} fn - The operation to attempt.
 * @param {Object} [options]
 * @param {number} [options.retries=3] - Max retries after the first attempt.
 * @param {number} [options.baseDelayMs=200] - Initial backoff, doubled each attempt.
 * @param {number} [options.maxDelayMs=5000] - Cap on a single backoff delay.
 * @param {(error: unknown, attempt: number) => boolean} [options.shouldRetry]
 * @param {(error: unknown, attempt: number, delayMs: number) => void} [options.onRetry]
 * @returns {Promise<T>}
 * @throws Re-throws the last error if all attempts fail.
 */
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

/**
 * Awaits a promise, suppressing only expected Discord errors and logging the rest.
 * Replaces empty `catch {}` blocks so genuine failures stay visible.
 *
 * @param {Promise<unknown>} promise
 * @param {string} context - Description of the operation for logs.
 * @returns {Promise<void>}
 */
export async function swallow(promise, context) {
  try {
    await promise;
  } catch (error) {
    if (isIgnorableDiscordError(error)) return;
    log.warn(`${context}:`, error?.message || error);
  }
}

/**
 * Acknowledges a Discord interaction once, tolerating double-handling and expired
 * tokens.
 *
 * @param {import('discord.js').BaseInteraction} interaction
 * @param {Object} [options]
 * @param {"deferReply"|"deferUpdate"} [options.mode="deferReply"]
 * @param {boolean} [options.ephemeral=true]
 * @returns {Promise<boolean>} True if this call acknowledged it; false if already acked/expired.
 */
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

/**
 * A Map with a maximum size and optional per-entry TTL. On overflow the least
 * recently used entry is evicted; reads and writes refresh recency.
 *
 * For pure caches where dropping an entry is harmless. Not for collections that own
 * un-managed resources (timers, connections) — those need explicit cleanup.
 *
 * @template K, V
 */
export class BoundedMap {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSize=1000]
   * @param {number} [options.ttlMs=0] - 0 disables expiry.
   */
  constructor({ maxSize = 1000, ttlMs = 0 } = {}) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    /** @type {Map<K, {value: V, expires: number}>} */
    this.store = new Map();
  }

  /** @param {K} key @returns {boolean} */
  has(key) {
    return this.get(key) !== undefined;
  }

  /** @param {K} key @returns {V|undefined} */
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

  /** @param {K} key @param {V} value @returns {this} */
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

  /** @param {K} key @returns {boolean} */
  delete(key) {
    return this.store.delete(key);
  }

  /** Removes all entries. */
  clear() {
    this.store.clear();
  }

  /** @returns {number} */
  get size() {
    return this.store.size;
  }

  /**
   * Iterates live entries, dropping any that have expired.
   * @returns {IterableIterator<[K, V]>}
   */
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
