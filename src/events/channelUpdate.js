import { Events, AuditLogEvent } from "discord.js";
import { checkChannelUpdate } from "../utils/automodRunner.js";
import { loadConfig } from "../utils/automodManager.js";

export default {
  name: Events.ChannelUpdate,
  async execute(oldChannel, newChannel) {
    if (!newChannel.guild) return;
    if (oldChannel.name === newChannel.name) return;

    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.raid) return;

    try {
      const logs = await newChannel.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.ChannelUpdate,
      });
      const entry = logs.entries.first();
      if (!entry || entry.target?.id !== newChannel.id) return;
      if (Date.now() - entry.createdTimestamp > 5000) return;
      await checkChannelUpdate(oldChannel, newChannel, entry.executor);
    } catch (error) {
      console.error(
        "[AutoMod] Error fetching audit logs for channel update:",
        error.message,
      );
    }
  },
};
