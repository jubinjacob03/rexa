import { Events } from 'discord.js';
import { updateStatusMessage } from '../utils/statusUpdater.js';

export default {
    name: Events.GuildMemberRemove,
    async execute(member) {
        console.log(`[INFO] Member left: ${member.user.tag}`);
        // Trigger an immediate info update when someone leaves
        setTimeout(() => updateStatusMessage(member.client), 2000);
    },
};
