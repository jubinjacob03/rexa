import { Events } from 'discord.js';
import { updateStatusMessage } from '../utils/statusUpdater.js';

export default {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        // Check if roles changed
        if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
            console.log(`[INFO] Member roles updated: ${newMember.user.tag}`);
            // Trigger info update when roles change
            setTimeout(() => updateStatusMessage(newMember.client), 2000);
        }
    },
};
