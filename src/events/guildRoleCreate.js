import { Events, AuditLogEvent } from "discord.js";
import { checkRoleCreate } from "../utils/automodRunner.js";
import { loadConfig } from "../utils/automodManager.js";

export default {
  name: Events.GuildRoleCreate,
  async execute(role) {
    if (!role.guild) return;

    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.raid) return;

    try {
      const logs = await role.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.RoleCreate,
      });
      const entry = logs.entries.first();
      if (!entry || entry.target?.id !== role.id) return;
      if (Date.now() - entry.createdTimestamp > 5000) return;
      await checkRoleCreate(role, entry.executor);
    } catch (error) {
      console.error(
        "[AutoMod] Error fetching audit logs for role create:",
        error.message,
      );
    }
  },
};
