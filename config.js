import dotenv from 'dotenv';
dotenv.config();

export default {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    statusChannelId: process.env.STATUS_CHANNEL_ID,
    updateInterval: parseInt(process.env.UPDATE_INTERVAL) || 5,
    keyRoles: process.env.KEY_ROLES ? process.env.KEY_ROLES.split(',').map(id => id.trim()) : []
};
