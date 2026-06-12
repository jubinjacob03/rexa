import { Events, AuditLogEvent } from "discord.js";
import { checkMessageDelete } from "../utils/automodRunner.js";

/**
 * Tracks message IDs that the bot itself deleted (spam purges, etc.) so the
 * delete-audit logic can skip them. Backed by a Map with TTL eviction so that
 * IDs whose MessageDelete event never arrives (bulk deletes, already-gone
 * messages) cannot accumulate unbounded. Exposes a Set-compatible API.
 */
const IGNORED_TTL_MS = 60 * 1000;
const _ignored = new Map();

export const ignoredDeletes = {
  add(id) {
    _ignored.set(id, Date.now());
  },
  has(id) {
    return _ignored.has(id);
  },
  delete(id) {
    return _ignored.delete(id);
  },
  get size() {
    return _ignored.size;
  },
};

setInterval(() => {
  const cutoff = Date.now() - IGNORED_TTL_MS;
  for (const [id, ts] of _ignored) {
    if (ts < cutoff) _ignored.delete(id);
  }
}, IGNORED_TTL_MS).unref();

/**
 * Handles the MessageDelete event.
 * @module events/messageDelete
 */
export default {
  name: Events.MessageDelete,
  /**
   * Executes the event handler.
   * @param {import("discord.js").Message} message - The message that was deleted.
   * @returns {Promise<void>}
   */
  async execute(message) {
    if (!message.guild || message.author?.bot) return;

    if (ignoredDeletes.has(message.id)) {
      ignoredDeletes.delete(message.id);
      return;
    }

    try {
      const fetchedLogs = await message.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MessageDelete,
      });
      const deletionLog = fetchedLogs.entries.first();

      let executor = message.author;

      if (deletionLog && Date.now() - deletionLog.createdTimestamp < 5000) {
        if (deletionLog.target.id === message.author.id) {
          executor = deletionLog.executor;
        }
      }

      if (executor.bot) return;

      await checkMessageDelete(message, executor);
    } catch {}
  },
};
