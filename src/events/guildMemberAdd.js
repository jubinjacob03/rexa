import { Events } from 'discord.js';
import { updateStatusMessage } from '../utils/statusUpdater.js';
import config from '../../config.js';

export default {
    name: Events.GuildMemberAdd,
    async execute(member) {
        console.log(`[INFO] Member joined: ${member.user.tag}`);
        
        // Auto-assign bot role if member is a bot
        if (member.user.bot && config.botRoleId) {
            try {
                await member.roles.add(config.botRoleId);
                console.log(`[INFO] Assigned Bot role to ${member.user.tag}`);
            } catch (error) {
                console.error(`[ERROR] Failed to assign Bot role to ${member.user.tag}:`, error);
            }
        }
        
        // Trigger an immediate info update when someone joins
        setTimeout(() => updateStatusMessage(member.client), 2000);
    },
};
