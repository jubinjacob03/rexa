import { Events, AuditLogEvent } from "discord.js";
import { checkGuildUpdate } from "../utils/automodRunner.js";
import { loadConfig } from "../utils/automodManager.js";

export default {
  name: Events.GuildUpdate,
  async execute(oldGuild, newGuild) {
    const cfg = await loadConfig();
    if (!cfg.enabled || !cfg.raid) return;

    try {
      const logs = await newGuild.fetchAuditLogs({
        limit: 1,
        type: AuditLogEvent.GuildUpdate,
      });
      const entry = logs.entries.first();
      if (!entry) return;
      if (entry.executor?.id === newGuild.client.user.id) return;
      if (Date.now() - entry.createdTimestamp > 5000) return;

      const changes = [];
      if (oldGuild.name !== newGuild.name) {
        changes.push(`• Name: \`${oldGuild.name}\` → \`${newGuild.name}\``);
      }
      if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
        changes.push("• Vanity URL changed");
      }
      if (oldGuild.icon !== newGuild.icon) {
        changes.push("• Server icon changed");
      }
      if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        changes.push(
          `• Verification level: ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`,
        );
      }
      if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
        changes.push("• Explicit content filter changed");
      }
      if (oldGuild.ownerId !== newGuild.ownerId) {
        changes.push("• **Ownership transferred**");
      }

      await checkGuildUpdate(
        newGuild,
        entry.executor,
        changes.join("\n") || "Server settings were updated.",
      );
    } catch (error) {
      console.error(
        "[AutoMod] Error fetching audit logs for guild update:",
        error.message,
      );
    }
  },
};
