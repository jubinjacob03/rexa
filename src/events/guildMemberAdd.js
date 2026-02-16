import { Events } from 'discord.js';
import { updateStatusMessage } from '../utils/statusUpdater.js';

export default {
    name: Events.GuildMemberAdd,
    async execute(member) {
        console.log(`[INFO] Member joined: ${member.user.tag}`);
        // Trigger an immediate info update when someone joins
        setTimeout(() => updateStatusMessage(member.client), 2000);
    },
};
