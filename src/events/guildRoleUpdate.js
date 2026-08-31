import { Events, AuditLogEvent } from "discord.js";
import { checkRoleUpdate } from "../utils/automodRunner.js";
import { loadConfig } from "../utils/automodManager.js";

export default {
  name: Events.GuildRoleUpdate,
  async execute(oldRole, newRole) {
    if (!newRole.guild) return;
    if (oldRole.permissions.bitfield === newRole.permissions.bitfield) return;

    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.raid) return;

    try {
      const logs = await newRole.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.RoleUpdate,
      });
      const entry = logs.entries.first();
      if (!entry || entry.target?.id !== newRole.id) return;
      if (Date.now() - entry.createdTimestamp > 5000) return;
      await checkRoleUpdate(oldRole, newRole, entry.executor);
    } catch (error) {
      console.error(
        "[AutoMod] Error fetching audit logs for role update:",
        error.message,
      );
    }
  },
};
