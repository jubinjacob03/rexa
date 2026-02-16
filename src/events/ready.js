import { Events } from 'discord.js';
import { startStatusUpdater } from '../utils/statusUpdater.js';

export default {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        console.log(`[SUCCESS] Shantha logged in as ${client.user.tag}`);
        console.log(`[INFO] Shantha is ready and serving ${client.guilds.cache.size} guild(s)`);
        
        // Start server monitoring
        startStatusUpdater(client);
    },
};
