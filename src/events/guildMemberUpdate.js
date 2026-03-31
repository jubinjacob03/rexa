import { Events } from "discord.js";
import { updateStatusMessage } from "../utils/statusUpdater.js";
import { checkMemberUpdate } from "../utils/automodRunner.js";

let _statusDebounceTimer = null;

export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      console.log(`[INFO] Member roles updated: ${newMember.user.tag}`);
      clearTimeout(_statusDebounceTimer);
      _statusDebounceTimer = setTimeout(
        () => updateStatusMessage(newMember.client),
        15000,
      );
    }
    
    await checkMemberUpdate(oldMember, newMember);
  },
};
