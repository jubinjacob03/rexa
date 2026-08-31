import { Events, AuditLogEvent } from "discord.js";
import { checkChannelCreate } from "../utils/automodRunner.js";
import { loadConfig } from "../utils/automodManager.js";

export default {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild) return;

    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.raid) return;

    try {
      const logs = await channel.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.ChannelCreate,
      });
      const entry = logs.entries.first();
      if (!entry || entry.target?.id !== channel.id) return;
      if (Date.now() - entry.createdTimestamp > 5000) return;
      await checkChannelCreate(channel, entry.executor);
    } catch (error) {
      console.error(
        "[AutoMod] Error fetching audit logs for channel create:",
        error.message,
      );
    }
  },
};
