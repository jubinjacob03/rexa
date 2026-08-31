import { Events, AuditLogEvent } from "discord.js";
import { checkMassBan } from "../utils/automodRunner.js";
import { loadConfig } from "../utils/automodManager.js";

export default {
  name: Events.GuildBanAdd,
  async execute(ban) {
    if (!ban.guild) return;

    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.raid) return;

    try {
      const fetchedLogs = await ban.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.MemberBanAdd,
      });
      const banLog = fetchedLogs.entries.first();
      if (!banLog) return;

      const { executor, target } = banLog;
      if (target.id === ban.user.id && executor.id !== ban.client.user.id) {
        await checkMassBan(ban.guild, executor);
      }
    } catch (error) {
      console.error(
        "[AutoMod] Error fetching audit logs for ban:",
        error.message,
      );
    }
  },
};
