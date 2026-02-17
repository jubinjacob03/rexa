import dotenv from 'dotenv';
dotenv.config();

export default {
    // Bot credentials
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    
    // Server monitoring
    statusChannelId: process.env.STATUS_CHANNEL_ID,
    updateInterval: parseInt(process.env.UPDATE_INTERVAL) || 5,
    
    // Verification system
    verificationChannelId: process.env.VERIFICATION_CHANNEL_ID,
    approvalsChannelId: process.env.APPROVALS_CHANNEL_ID,
    
    // Roles
    unverifiedRoleId: process.env.UNVERIFIED_ROLE_ID,
    friendsRoleId: process.env.FRIENDS_ROLE_ID,
    memberRoleId: process.env.MEMBER_ROLE_ID,
    moderatorRoleId: process.env.MODERATOR_ROLE_ID,
    managerRoleId: process.env.MANAGER_ROLE_ID,
    ownerRoleId: process.env.OWNER_ROLE_ID
};
