import { Events, AuditLogEvent } from "discord.js";
import { checkRoleDelete } from "../utils/automodRunner.js";

export default {
  name: Events.GuildRoleDelete,
  async execute(role) {
    if (!role.guild) return;

    try {
      const fetchedLogs = await role.guild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.RoleDelete,
      });
      const deleteLog = fetchedLogs.entries.first();
      if (!deleteLog) return;

      const { executor, target } = deleteLog;
      if (target.id === role.id) {
        await checkRoleDelete(role.guild, executor);
      }
    } catch (error) {
      console.error(
        "[AutoMod] Error fetching audit logs for role delete:",
        error.message,
      );
    }
  },
};
