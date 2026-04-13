import dotenv from "dotenv";
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
  ticketModeratorRoles: ["1020316661070438430"],
  ownerRoleId: process.env.OWNER_ROLE_ID,
  botRoleId: process.env.BOT_ROLE_ID,

  // Image-only channels
  imageOnlyChannels: ["1473075469028167811", "1473075469028167814"],

  // External services integration
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
  },
  api: {
    port: parseInt(process.env.PORT || process.env.API_PORT) || 3001,
    key: process.env.BOT_API_KEY,
    webAppUrl: process.env.WEB_APP_URL || "http://localhost:3000",
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",") || [
      "http://localhost:3000",
    ],
  },
  soundboard: {
    uploadRoles: process.env.UPLOAD_ROLES?.split(",") || [],
  },
  privateVC: {
    categoryId: "1473075468805738543",
    lobbyVCId: "1473075469028167817",
    maxSimultaneous: 5,
    idleTimeoutMs: 5 * 60 * 1000,
    maxLifetimeMs: 3 * 60 * 60 * 1000,
  },

  // Status embed links
  rulesChannelId: process.env.RULES_CHANNEL_ID || "1473075468805738538",
  instagramUrl: process.env.INSTAGRAM_URL || null,
  whatsappUrl: process.env.WHATSAPP_URL || null,
};
