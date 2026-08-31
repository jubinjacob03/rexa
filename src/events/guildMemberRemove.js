import { Events, AuditLogEvent } from "discord.js";
import { updateStatusMessage } from "../utils/statusUpdater.js";
import { checkMassKick } from "../utils/automodRunner.js";
import { loadConfig } from "../utils/automodManager.js";

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    console.log(`[INFO] Member left: ${member.user.tag}`);

    const cfg = await loadConfig();
    if (cfg.enabled && cfg.raid) {
      try {
        const fetchedLogs = await member.guild.fetchAuditLogs({
          limit: 1,
          type: AuditLogEvent.MemberKick,
        });
        const kickLog = fetchedLogs.entries.first();
        if (
          kickLog &&
          kickLog.target.id === member.id &&
          Date.now() - kickLog.createdTimestamp < 5000
        ) {
          await checkMassKick(member.guild, kickLog.executor);
        }
      } catch (error) {
        console.error(
          "[AutoMod] Error fetching audit logs for kick:",
          error.message,
        );
      }
    }

    setTimeout(() => updateStatusMessage(member.client, false), 2000);
  },
};
