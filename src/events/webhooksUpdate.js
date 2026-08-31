import { Events, AuditLogEvent } from "discord.js";
import { checkWebhookCreate } from "../utils/automodRunner.js";
import { loadConfig } from "../utils/automodManager.js";

export default {
  name: Events.WebhooksUpdate,
  async execute(channel) {
    if (!channel.guild) return;

    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.raid) return;

    try {
      const logs = await channel.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.WebhookCreate,
      });
      const entry = logs.entries.first();
      if (!entry) return;
      if (entry.executor?.id === channel.client.user.id) return;
      if (Date.now() - entry.createdTimestamp > 5000) return;
      await checkWebhookCreate(channel.guild, entry.executor);
    } catch (error) {
      console.error(
        "[AutoMod] Error fetching audit logs for webhook update:",
        error.message,
      );
    }
  },
};
