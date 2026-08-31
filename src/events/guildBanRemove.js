import { Events, AuditLogEvent } from "discord.js";
import { checkMassUnban } from "../utils/automodRunner.js";
import { loadConfig } from "../utils/automodManager.js";

export default {
  name: Events.GuildBanRemove,
  async execute(ban) {
    if (!ban.guild) return;

    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.raid) return;

    try {
      const logs = await ban.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberBanRemove,
      });
      const entry = logs.entries.first();
      if (!entry || entry.target?.id !== ban.user.id) return;
      if (entry.executor?.id === ban.client.user.id) return;
      if (Date.now() - entry.createdTimestamp > 5000) return;
      await checkMassUnban(ban.guild, entry.executor);
    } catch (error) {
      console.error(
        "[AutoMod] Error fetching audit logs for unban:",
        error.message,
      );
    }
  },
};
