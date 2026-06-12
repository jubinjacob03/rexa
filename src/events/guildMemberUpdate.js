import { Events } from "discord.js";
import { updateStatusMessage } from "../utils/statusUpdater.js";
import { checkMemberUpdate } from "../utils/automodRunner.js";

let _statusDebounceTimer = null;

/**
 * Handles the GuildMemberUpdate event.
 * @module events/guildMemberUpdate
 */
export default {
  name: Events.GuildMemberUpdate,
  /**
   * Executes the event handler.
   * @param {import("discord.js").GuildMember} oldMember - The member before the update.
   * @param {import("discord.js").GuildMember} newMember - The member after the update.
   * @returns {Promise<void>}
   */
  async execute(oldMember, newMember) {
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      console.log(`[INFO] Member roles updated: ${newMember.user.tag}`);
      clearTimeout(_statusDebounceTimer);
      _statusDebounceTimer = setTimeout(
        () => updateStatusMessage(newMember.client, false),
        15000,
      );
    }

    await checkMemberUpdate(oldMember, newMember);
  },
};
