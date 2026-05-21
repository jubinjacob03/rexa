import { Events } from "discord.js";
import { updateStatusMessage } from "../utils/statusUpdater.js";

/**
 * Handles the GuildMemberRemove event.
 * @module events/guildMemberRemove
 */
export default {
  name: Events.GuildMemberRemove,
  /**
   * Executes the event handler.
   * @param {import("discord.js").GuildMember} member - The member that left the guild.
   * @returns {Promise<void>}
   */
  async execute(member) {
    console.log(`[INFO] Member left: ${member.user.tag}`);
    setTimeout(() => updateStatusMessage(member.client), 2000);
  },
};
