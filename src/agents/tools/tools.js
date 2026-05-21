/**
 * @file tools.js
 * @description Unified Tools Implementation. All agent tools in one place using AI SDK.
 */

import { tool } from "ai";
import { z } from "zod";
import {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorSpacingSize,
} from "discord.js";
import { icon } from "../../utils/icons.js";
import config from "../config.js";
import {
  createPrivateVC,
  canCreate,
  getVCByMember,
} from "../../utils/privateVCManager.js";
import * as modTools from "../../utils/moderation.js";

let client = null;

/**
 * Initializes the tools with the Discord client.
 * @param {object} discordClient - The Discord client instance.
 */
export function initializeTools(discordClient) {
  client = discordClient;
  modTools.setupModerationTools(discordClient);
  console.log("[TOOLS] Initialized with Discord client");
}

const memberCacheMap = new Map();
const MEMBER_CACHE_TTL = 60_000;

/**
 * Fetches members of a guild, utilizing a cache to avoid rate limits.
 * @param {object} guild - The Discord guild object.
 * @returns {Promise<object>} The fetched members.
 */
async function fetchMembersWithCache(guild) {
  const cached = memberCacheMap.get(guild.id);
  if (cached && Date.now() - cached.timestamp < MEMBER_CACHE_TTL) {
    return cached.members;
  }
  const members = await guild.members.fetch({ force: true });
  memberCacheMap.set(guild.id, { members, timestamp: Date.now() });
  return members;
}

/**
 * Fetches members of a guild freshly, bypassing the cache.
 * @param {object} guild - The Discord guild object.
 * @returns {Promise<object>} The fetched members.
 */
async function fetchMembersFresh(guild) {
  const members = await guild.members.fetch({ force: true });
  memberCacheMap.set(guild.id, { members, timestamp: Date.now() });
  return members;
}

/**
 * Command Executor Tool - Executes Discord commands autonomously.
 */
export const commandExecutorTool = tool({
  description: `Execute Discord commands autonomously. Use for actions like playing music, managing channels, or triggering bot functions.`,
  parameters: z.object({
    command: z.string().describe("Command name without slash"),
    parameters: z.record(z.string(), z.any()).optional(),
    channelId: z.string().optional(),
    userId: z.string().optional().describe("invoking user's Discord ID"),
    guildId: z.string().optional().describe("server ID"),
    username: z.string().optional().describe("invoking user's username"),
  }),
  execute: async ({ command, parameters, channelId, userId, guildId }) => {
    if (!config.commandExecution.enabled) {
      return { success: false, error: "Command execution disabled" };
    }
    if (config.commandExecution.blockedCommands.includes(command)) {
      return {
        success: false,
        error: `The /${command} command can only be used as a Discord slash command, not via chat.`,
      };
    }

    try {
      const cmd = client.commands?.get(command);
      if (!cmd)
        return { success: false, error: `Command not found: ${command}` };

      await cmd.execute({
        commandName: command,
        options: {
          get: (key) => parameters?.[key],
          getString: (key) => parameters?.[key]?.toString(),
          getInteger: (key) => parseInt(parameters?.[key]),
          getBoolean: (key) => Boolean(parameters?.[key]),
        },
        channelId,
        userId,
        guildId,
        client,
        reply: async (content) => ({ content }),
        deferReply: async () => {},
        editReply: async (content) => ({ content }),
        followUp: async (content) => ({ content }),
      });

      return { success: true, command, result: "Executed successfully" };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Server Info Tool - Retrieves Discord server or member information.
 */
export const serverInfoTool = tool({
  description: `Get Discord server or member information. Use this tool to:
  - Get server stats (infoType="stats")  
  - Get specific member info (infoType="member", targetId=user_id)
  - Get channel info (infoType="channel", targetId=channel_id)
  - Search members by username, nickname, or ID (infoType="search", searchQuery="name_or_id")
  - List all current members in the server (infoType="presentMembers")
  - Find people with specific role(s) (infoType="roleMembers", roleName="role_name")
  - List of people who have been kicked (infoType="kickedMembers")
  - List of people who have been banned (infoType="bannedMembers")
  
  REQUIRED: Always provide guildId (server ID) and infoType.
  For lists with many people, the AI agent will respond natively with an Embed table containing the users.`,
  parameters: z.object({
    infoType: z
      .enum([
        "stats",
        "member",
        "channel",
        "search",
        "presentMembers",
        "roleMembers",
        "kickedMembers",
        "bannedMembers",
      ])
      .describe(
        "Type of info to retrieve from the server. (stats, member, channel, search, presentMembers, roleMembers, kickedMembers, bannedMembers)",
      ),
    guildId: z.string().describe("The Discord server/guild ID"),
    targetId: z
      .string()
      .optional()
      .describe("User ID for member queries or channel ID for channel queries"),
    searchQuery: z
      .string()
      .optional()
      .describe("Search term for finding members by username, nickname, or ID"),
    roleName: z
      .string()
      .optional()
      .describe(
        "Name of the role to find members for (only with infoType='roleMembers')",
      ),
    limit: z
      .number()
      .optional()
      .default(20)
      .describe("Max results for lists/searches"),
    userId: z.string().optional().describe("invoking user's Discord ID"),
    username: z.string().optional().describe("invoking user's username"),
  }),
  execute: async ({
    infoType,
    guildId,
    targetId,
    searchQuery,
    roleName,
    limit,
  }) => {
    if (!client) return { success: false, error: "Client not initialized" };

    try {
      const guild = await client.guilds.fetch({ guild: guildId, force: true });

      if (infoType === "stats") {
        await fetchMembersFresh(guild);
        const onlineCount = guild.presences.cache.filter((p) => {
          if (p.status === "offline") return false;
          const member = guild.members.cache.get(p.userId);
          return member && !member.user.bot;
        }).size;
        return {
          success: true,
          serverName: guild.name,
          memberCount: guild.memberCount,
          onlineCount,
          channelCount: guild.channels.cache.size,
          roleCount: guild.roles.cache.size,
        };
      }

      if (infoType === "member" && targetId) {
        const member = await guild.members.fetch({
          user: targetId,
          force: true,
        });
        return {
          success: true,
          username: member.user.username,
          displayName: member.displayName,
          nickname: member.nickname || null,
          userId: member.user.id,
          roles: member.roles.cache.map((r) => r.name),
          roleIds: member.roles.cache.map((r) => r.id),
          status: member.presence?.status || "offline",
          joinedAt: member.joinedAt,
        };
      }

      if (infoType === "channel" && targetId) {
        const channel = await guild.channels.fetch(targetId);
        return {
          success: true,
          name: channel.name,
          type: channel.type,
          memberCount: channel.members?.size || 0,
        };
      }

      if (infoType === "search" && searchQuery) {
        const fetched = await fetchMembersWithCache(guild);
        const q = searchQuery.toLowerCase();

        let results = [];

        // Exact ID match
        const exactMatch = fetched.get(searchQuery);
        if (exactMatch && !exactMatch.user.bot) {
          results.push(exactMatch);
        } else {
          results = [
            ...fetched
              .filter(
                (m) =>
                  !m.user.bot &&
                  (m.user.id === searchQuery ||
                    m.user.username.toLowerCase().includes(q) ||
                    m.displayName.toLowerCase().includes(q) ||
                    (m.nickname && m.nickname.toLowerCase().includes(q))),
              )
              .values(),
          ];
        }

        results = results.slice(0, limit || 20).map((m) => ({
          id: m.id,
          username: m.user.username,
          displayName: m.displayName,
          nickname: m.nickname || null,
          status: m.presence?.status || "offline",
          roles: m.roles.cache
            .filter((r) => r.name !== "@everyone")
            .map((r) => r.name)
            .join(", "),
        }));
        return { success: true, results, count: results.length };
      }

      if (infoType === "presentMembers") {
        const fetched = await fetchMembersWithCache(guild);
        const members = [...fetched.filter((m) => !m.user.bot).values()]
          .map((m) => ({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName,
            nickname: m.nickname || null,
            status: m.presence?.status || "offline",
          }))
          .slice(0, limit || 50);
        return {
          success: true,
          members,
          count: fetched.filter((m) => !m.user.bot).size,
          returned: members.length,
        };
      }

      if (infoType === "roleMembers" && roleName) {
        const fetched = await fetchMembersWithCache(guild);
        const q = roleName.toLowerCase();
        const role = guild.roles.cache.find(
          (r) => r.name.toLowerCase().includes(q) || r.id === roleName,
        );

        if (!role)
          return { success: false, error: `Role '${roleName}' not found.` };

        const roleMembers = [
          ...fetched
            .filter((m) => !m.user.bot && m.roles.cache.has(role.id))
            .values(),
        ]
          .map((m) => ({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName,
          }))
          .slice(0, limit || 50);

        return {
          success: true,
          roleName: role.name,
          roleId: role.id,
          members: roleMembers,
          count: role.members.size,
          returned: roleMembers.length,
        };
      }

      if (infoType === "bannedMembers") {
        const bans = await guild.bans.fetch({ limit: limit || 50 });
        const bannedUsers = bans.map((ban) => ({
          userId: ban.user.id,
          username: ban.user.username,
          reason: ban.reason || "No reason provided",
        }));

        return {
          success: true,
          bannedMembers: bannedUsers,
          count: bannedUsers.length,
        };
      }

      if (infoType === "kickedMembers") {
        const auditLogs = await guild.fetchAuditLogs({
          limit: limit || 50,
          type: 20,
        }); // AuditLogEvent.MemberKick = 20
        const kicks = auditLogs.entries.map((entry) => ({
          action: "Kicked",
          targetId: entry.target?.id,
          targetUsername: entry.target?.username || "Unknown",
          executorId: entry.executor?.id,
          executorUsername: entry.executor?.username || "Unknown",
          reason: entry.reason || "No reason provided",
          createdAt: entry.createdAt,
        }));

        return { success: true, kickedMembers: kicks, count: kicks.length };
      }

      return {
        success: false,
        error: "Invalid info type or missing parameters",
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Music Control Tool - Controls the Remani music bot.
 */
export const musicControlTool = tool({
  description: `Control Remani music bot: play, pause, resume, skip, stop, queue, volume, nowplaying.`,
  parameters: z.object({
    action: z.enum([
      "play",
      "pause",
      "resume",
      "skip",
      "stop",
      "queue",
      "volume",
      "nowplaying",
    ]),
    query: z.string().optional(),
    volume: z.number().min(0).max(100).optional(),
    userId: z.string(),
    guildId: z.string(),
    username: z.string().optional().describe("invoking user's username"),
  }),
  execute: async ({ action, query, volume, userId, guildId }) => {
    const baseURL = process.env.REMANI_API_URL || "http://localhost:8000";
    const headers = {
      "Content-Type": "application/json",
      ...(process.env.REMANI_API_KEY
        ? { Authorization: `Bearer ${process.env.REMANI_API_KEY}` }
        : {}),
    };

    let voiceChannelId = null;
    if (action === "play") {
      const guild = client?.guilds.cache.get(guildId);
      const member = guild?.members.cache.get(userId);
      voiceChannelId = member?.voice?.channelId || null;
      if (!voiceChannelId) {
        return {
          success: false,
          error: "You must be in a voice channel to play music.",
        };
      }
    }

    const actionMap = {
      play: { path: "/play", body: { guildId, query, userId, voiceChannelId } },
      pause: { path: "/pause", body: { guildId } },
      resume: { path: "/resume", body: { guildId } },
      skip: { path: "/skip", body: { guildId } },
      stop: { path: "/stop", body: { guildId } },
      queue: {
        path: "/queue",
        body: null,
        method: "GET",
        params: `?guildId=${guildId}`,
      },
      volume: { path: "/volume", body: { guildId, volume } },
      nowplaying: {
        path: "/status",
        body: null,
        method: "GET",
        params: `?guildId=${guildId}`,
      },
    };

    const { path, body, method = "POST", params = "" } = actionMap[action];

    try {
      const url = `${baseURL}${path}${params}`;
      const options = {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
      };
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        return { success: false, error: data?.error || `HTTP ${res.status}` };
      return { success: true, action, ...data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Embed Generator Tool - Creates beautiful Discord embeds.
 */
export const embedGeneratorTool = tool({
  description: `Create beautiful Discord embeds with rich formatting, colors, fields, and images.`,
  parameters: z.object({
    title: z.string(),
    description: z.string().optional(),
    color: z.string().optional(),
    fields: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
          inline: z.boolean().optional(),
        }),
      )
      .optional(),
    thumbnail: z.string().optional(),
    image: z.string().optional(),
    footer: z.string().optional(),    userId: z.string().optional().describe("invoking user's Discord ID"),
    guildId: z.string().optional().describe("server ID"),
    username: z.string().optional().describe("invoking user's username"),  }),
  execute: async ({
    title,
    description,
    color,
    fields,
    thumbnail,
    image,
    footer,
  }) => {
    try {
      const container = new ContainerBuilder();
      const colors = {
        blue: "#3498db",
        green: "#2ecc71",
        red: "#e74c3c",
        purple: "#9b59b6",
        gold: "#f1c40f",
        orange: "#e67e22",
      };
      
      let hexColor = colors[color?.toLowerCase()] || color || "#3498db";
      if (typeof hexColor === "string") {
        hexColor = parseInt(hexColor.replace("#", ""), 16);
      }
      container.setAccentColor(hexColor);

      let headerText = "";
      if (title) headerText += `## ${title}\n`;
      if (description) headerText += `${description}`;

      if (headerText) {
        if (thumbnail) {
          const section = new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(headerText.trim())
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail));
          container.addSectionComponents(section);
        } else {
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(headerText.trim())
          );
        }
      }

      if (fields && Array.isArray(fields) && fields.length > 0) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        fields.forEach((f) => {
          container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**${f.name}**\n${f.value}`)
          );
        });
      }

      if (image) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`[Image](${image})`)
        );
      }

      if (footer) {
        container.addSeparatorComponents(
          new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
        );
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-*${footer}*-`)
        );
      }

      return {
        success: true,
        components: [container],
        preview: `Embed: ${title}`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Create Private VC Tool - Creates a real private voice channel for specified members.
 */
export const createPrivateVCTool = tool({
  description: `Create a real private voice channel for specified members. Resolves member names to Discord members and calls the actual private VC system. Use this whenever a user asks to create a private VC for themselves and/or others.`,
  parameters: z.object({
    guildId: z.string().describe("The Discord server/guild ID"),
    invokerUserId: z
      .string()
      .describe("The user ID of the person requesting the private VC"),
    memberNames: z
      .array(z.string())
      .optional()
      .describe(
        "Display names or usernames of additional members to invite (besides the invoker)",
      ),
    userId: z.string().optional().describe("invoking user's Discord ID"),
    username: z.string().optional().describe("invoking user's username"),
  }),
  execute: async ({ guildId, invokerUserId, memberNames = [] }) => {
    if (!client) return { success: false, error: "Client not initialized" };

    try {
      const guild = await client.guilds.fetch({ guild: guildId, force: true });
      await guild.members.fetch({ force: true });

      const invoker = await guild.members
        .fetch({ user: invokerUserId, force: true })
        .catch(() => null);
      if (!invoker)
        return { success: false, error: "Invoker not found in server" };

      if (getVCByMember(invokerUserId)) {
        return {
          success: false,
          error: "You already have an active private VC. Leave it first.",
        };
      }
      if (!canCreate()) {
        return {
          success: false,
          error:
            "Maximum simultaneous private VCs reached. Wait for one to close.",
        };
      }

      const memberMap = new Map([[invokerUserId, invoker]]);
      for (const name of memberNames) {
        const q = name.toLowerCase();
        const found = guild.members.cache.find(
          (m) =>
            !m.user.bot &&
            (m.user.username.toLowerCase().includes(q) ||
              m.displayName.toLowerCase().includes(q) ||
              (m.nickname && m.nickname.toLowerCase().includes(q))),
        );
        if (found) memberMap.set(found.id, found);
      }

      const members = [...memberMap.values()];
      const channel = await createPrivateVC(guild, members);
      if (!channel) {
        return {
          success: false,
          error: "Failed to create private VC — please try again.",
        };
      }

      const invited = members
        .filter((m) => m.id !== invokerUserId)
        .map((m) => m.displayName);
      return {
        success: true,
        channelId: channel.id,
        channelName: channel.name,
        members: members.map((m) => m.displayName),
        message: invited.length
          ? `Private VC "${channel.name}" created for you and ${invited.join(", ")}.`
          : `Private VC "${channel.name}" created for you.`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

/**
 * Escalate Ticket Tool - Escalates a user's support ticket to human staff.
 */
export const escalateTicketTool = tool({
  description: `Escalates a user's support ticket to human staff. Use this ONLY if the user is in a ticket thread, you cannot solve their problem, or they explicitly demand a human moderator. Provide a summary of the issue.`,
  parameters: z.object({
    summary: z
      .string()
      .describe(
        "A very brief 1-2 sentence summary of what the user needs help with and what troubleshooting steps you've already tried.",
      ),
    channelId: z
      .string()
      .describe("The ID of the channel/thread the command is executed in."),
    userId: z.string().optional().describe("invoking user's Discord ID"),
    guildId: z.string().optional().describe("server ID"),
    username: z.string().optional().describe("invoking user's username"),
  }),
  execute: async ({ summary, channelId }) => {
    try {
      if (!client) return { output: "Error: Discord client not initialized." };
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) return { output: `[SYSTEM] Could not find channel.` };

      await channel.send({
        content: `🔔 <@&${config.moderatorRoleId}> **TICKET ESCALATION!**\n**AI Context Summary:**\n> ${summary}`,
      });

      return {
        output:
          "[SYSTEM] Ticket successfully escalated to staff. They have been pinged.",
      };
    } catch (e) {
      console.error("[TOOLS] Escalate ticket failed:", e);
      return { output: `[SYSTEM] Error: ${e.message}` };
    }
  },
});

/**
 * Discord Action Tool - Performs a real Discord moderation or administration action.
 */
export const discordActionTool = tool({
  description: `Perform a real Discord moderation or administration action directly via the Discord API.
Available actions:
  Mod-level: voice-mute, voice-unmute, voice-deafen, voice-undeafen, timeout, remove-timeout, change-nickname, change-bot-nickname
  Owner-level: kick, ban, add-role, remove-role
The tool enforces role-based permissions internally. Always pass userId (invoker) so permissions can be verified.`,
  parameters: z.object({
    action: z
      .enum([
        "voice-mute",
        "voice-unmute",
        "voice-deafen",
        "voice-undeafen",
        "timeout",
        "remove-timeout",
        "kick",
        "ban",
        "change-nickname",
        "change-bot-nickname",
        "add-role",
        "remove-role",
      ])
      .describe("The Discord action to perform"),
    guildId: z.string().describe("The Discord guild/server ID"),
    userId: z
      .string()
      .optional()
      .describe(
        "The invoking user's Discord ID (auto-provided — used for permission check)",
      ),
    targetName: z
      .string()
      .optional()
      .describe(
        "Display name, nickname, or username of the target member (fuzzy match). Not needed for change-bot-nickname.",
      ),
    durationMinutes: z
      .number()
      .optional()
      .describe("Timeout duration in minutes (1–40320). Defaults to 5."),
    deleteDays: z
      .number()
      .min(0)
      .max(7)
      .optional()
      .describe(
        "For ban: number of days of messages to delete (0–7, default 0).",
      ),
    reason: z.string().optional().describe("Audit-log reason for the action"),
    nickname: z
      .string()
      .optional()
      .describe(
        "New nickname. For change-nickname: the target user's new nickname (omit to reset). For change-bot-nickname: the bot's new nickname.",
      ),
    roleName: z
      .string()
      .optional()
      .describe(
        "For add-role / remove-role: the name of the role to add or remove from the target member (fuzzy match against role names).",
      ),
    username: z.string().optional().describe("invoking user's username"),
  }),
  execute: async ({
    action,
    guildId,
    userId,
    targetName,
    durationMinutes = 5,
    deleteDays = 0,
    reason = "Requested via Shantha",
    nickname,
    roleName,
  }) => {
    if (!client) return { success: false, error: "Client not initialized" };

    try {
      const guild = await client.guilds.fetch({ guild: guildId, force: true });
      await guild.members.fetch({ force: true });

      const ownerActions = new Set(["kick", "ban", "add-role", "remove-role"]);
      const modActions = new Set([
        "voice-mute",
        "voice-unmute",
        "voice-deafen",
        "voice-undeafen",
        "timeout",
        "remove-timeout",
        "change-nickname",
        "change-bot-nickname",
      ]);

      if (ownerActions.has(action)) {
        const allowed = await modTools.checkModerationPermission(
          guild,
          userId,
          "owner",
        );
        if (!allowed)
          return {
            success: false,
            error: `${icon("LOCK")} ᴘᴇʀᴍɪssɪᴏɴ ᴅᴇɴɪᴇᴅ. ᴏɴʟʏ ᴛʜᴇ sᴇʀᴠᴇʀ ᴏᴡɴᴇʀ ᴄᴀɴ ᴘᴇʀғᴏʀᴍ ᴋɪᴄᴋ/ʙᴀɴ ᴀᴄᴛɪᴏɴs.`,
          };
      } else if (modActions.has(action)) {
        const allowed = await modTools.checkModerationPermission(
          guild,
          userId,
          "mod",
        );
        if (!allowed)
          return {
            success: false,
            error: `${icon("LOCK")} ᴘᴇʀᴍɪssɪᴏɴ ᴅᴇɴɪᴇᴅ. ʏᴏᴜ ɴᴇᴇᴅ ᴀ ᴍᴏᴅᴇʀᴀᴛᴏʀ ᴏʀ ʜɪɢʜᴇʀ ʀᴏʟᴇ ᴛᴏ ᴘᴇʀғᴏʀᴍ ᴛʜɪs ᴀᴄᴛɪᴏɴ.`,
          };
      }

      if (action === "change-bot-nickname") {
        const message = await modTools.changeBotNickname(
          guild,
          nickname,
          reason,
        );
        return { success: true, message };
      }

      const member = modTools.resolveMemberByName(guild, targetName);
      let message = "";

      switch (action) {
        case "voice-mute":
          message = await modTools.voiceMute(member, reason);
          break;
        case "voice-unmute":
          message = await modTools.voiceUnmute(member, reason);
          break;
        case "voice-deafen":
          message = await modTools.voiceDeafen(member, reason);
          break;
        case "voice-undeafen":
          message = await modTools.voiceUndeafen(member, reason);
          break;
        case "timeout":
          message = await modTools.timeout(member, durationMinutes, reason);
          break;
        case "remove-timeout":
          message = await modTools.removeTimeout(member, reason);
          break;
        case "kick":
          message = await modTools.kick(member, reason);
          break;
        case "ban":
          message = await modTools.ban(member, deleteDays, reason);
          break;
        case "change-nickname":
          message = await modTools.changeNickname(member, nickname, reason);
          break;
        case "add-role":
          message = await modTools.addRole(guild, member, roleName, reason);
          break;
        case "remove-role":
          message = await modTools.removeRole(guild, member, roleName, reason);
          break;
        default:
          return { success: false, error: `Unknown action: ${action}` };
      }

      return { success: true, message };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

export default {
  commandExecutorTool,
  serverInfoTool,
  musicControlTool,
  embedGeneratorTool,
  createPrivateVCTool,
  discordActionTool,
};
