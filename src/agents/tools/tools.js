/**
 * Unified Tools Implementation
 * All agent tools in one place using AI SDK
 */

import { tool } from "ai";
import { z } from "zod";
import { EmbedBuilder } from "discord.js";
import knowledgeBase from "./knowledge-base.js";
import config from "../config.js";
import {
  createPrivateVC,
  canCreate,
  getVCByMember,
} from "../../utils/privateVCManager.js";

let client = null;

export function initializeTools(discordClient) {
  client = discordClient;
  console.log("[TOOLS] Initialized with Discord client");
}

// Member cache: avoid force-fetching on every call (Discord rate limits)
const memberCacheMap = new Map();
const MEMBER_CACHE_TTL = 60_000;

async function fetchMembersWithCache(guild) {
  const cached = memberCacheMap.get(guild.id);
  if (cached && Date.now() - cached.timestamp < MEMBER_CACHE_TTL) {
    return cached.members;
  }
  const members = await guild.members.fetch({ force: true });
  memberCacheMap.set(guild.id, { members, timestamp: Date.now() });
  return members;
}

async function fetchMembersFresh(guild) {
  const members = await guild.members.fetch({ force: true });
  memberCacheMap.set(guild.id, { members, timestamp: Date.now() });
  return members;
}

/**
 * RAG Tool - Knowledge base search using AI SDK embeddings
 */
export const ragTool = tool({
  description: `Search knowledge base for information about Shantha, Remani, commands, and server features. Use this to get accurate information instead of guessing.`,
  parameters: z.object({
    query: z.string().describe("Search query"),
    category: z
      .enum([
        "server",
        "shantha",
        "remani",
        "commands",
        "music",
        "verification",
        "private_vc",
        "general",
      ])
      .optional(),
    topK: z.number().min(1).max(10).optional().default(5),
  }),
  execute: async ({ query, category, topK }) => {
    const result = await knowledgeBase.search(query, { category, topK });
    return result.success
      ? {
          results: result.results.map((r) => ({
            text: r.text,
            relevance: r.similarity,
            source: r.metadata.category,
          })),
          totalMatches: result.totalMatches,
        }
      : { error: result.error };
  },
});

/**
 * Command Executor - Execute Discord commands
 */
export const commandExecutorTool = tool({
  description: `Execute Discord commands autonomously. Use for actions like playing music, managing channels, or triggering bot functions.`,
  parameters: z.object({
    command: z.string().describe("Command name without slash"),
    parameters: z.record(z.string(), z.any()).optional(),
    channelId: z.string().optional(),
    userId: z.string().optional(),
    guildId: z.string().optional(),
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
 * Server Info Tool
 */
export const serverInfoTool = tool({
  description: `Get Discord server or member information. Use this tool to:
  - Get server stats (infoType="stats")  
  - Get specific member info (infoType="member", targetId=user_id)
  - Get channel info (infoType="channel", targetId=channel_id)
  - Search members (infoType="search", searchQuery="name_to_search")
  - List all members with IDs, roles, nicknames, and online status (infoType="members")
  
  REQUIRED: Always provide guildId (server ID) and infoType.
  For member queries, provide targetId with the user's ID.`,
  parameters: z.object({
    infoType: z
      .enum(["stats", "member", "channel", "search", "members"])
      .describe(
        "Type of info: stats (server stats), member (user info), channel (channel info), search (find members), or members (list all members with roles and status)",
      ),
    guildId: z.string().describe("The Discord server/guild ID"),
    targetId: z
      .string()
      .optional()
      .describe("User ID for member queries or channel ID for channel queries"),
    searchQuery: z
      .string()
      .optional()
      .describe(
        "Search term for finding members (only with infoType='search')",
      ),
    limit: z.number().optional().default(10).describe("Max results for search"),
  }),
  execute: async ({ infoType, guildId, targetId, searchQuery, limit }) => {
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
        const results = [
          ...fetched
            .filter(
              (m) =>
                !m.user.bot &&
                (m.user.username.toLowerCase().includes(q) ||
                  m.displayName.toLowerCase().includes(q) ||
                  (m.nickname && m.nickname.toLowerCase().includes(q))),
            )
            .values(),
        ]
          .sort((a, b) => b.roles.cache.size - a.roles.cache.size)
          .slice(0, limit || 5)
          .map((m) => ({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName,
            nickname: m.nickname || null,
            status: m.presence?.status || "offline",
            roles: m.roles.cache
              .filter((r) => r.name !== "@everyone")
              .map((r) => r.name),
          }));
        return { success: true, results, count: results.length };
      }

      if (infoType === "members") {
        const fetched = await fetchMembersWithCache(guild);
        const members = [...fetched.filter((m) => !m.user.bot).values()].map(
          (m) => ({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName,
            nickname: m.nickname || null,
            status: m.presence?.status || "offline",
            roles: m.roles.cache
              .filter((r) => r.name !== "@everyone")
              .map((r) => ({ id: r.id, name: r.name })),
          }),
        );
        return { success: true, members, count: members.length };
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
 * Music Control Tool
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
 * Embed Generator Tool
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
    footer: z.string().optional(),
  }),
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
      const embed = new EmbedBuilder().setTitle(title).setTimestamp();

      if (description) embed.setDescription(description);

      const colors = {
        blue: "#3498db",
        green: "#2ecc71",
        red: "#e74c3c",
        purple: "#9b59b6",
        gold: "#f1c40f",
        orange: "#e67e22",
      };
      embed.setColor(colors[color?.toLowerCase()] || color || "#3498db");

      if (fields)
        fields.forEach((f) =>
          embed.addFields({
            name: f.name,
            value: f.value,
            inline: f.inline || false,
          }),
        );
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (image) embed.setImage(image);
      if (footer) embed.setFooter({ text: footer });

      return {
        success: true,
        embed: embed.toJSON(),
        preview: `Embed: ${title}`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

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

// ── Moderation permission role IDs (from moderation-context.md) ──────────────
const OWNER_ROLE_ID = "1473075468088377352";
const MOD_ROLE_IDS = new Set([
  "1473075468088377349",
  "1473075468088377350",
  "1473075468088377352",
]);

/**
 * Check if a guild member (by userId) has the required permission level.
 * level: "owner" | "mod"
 */
async function checkModPermission(guild, userId, level) {
  if (!userId) return false;
  const invoker = await guild.members
    .fetch({ user: userId, force: false })
    .catch(() => null);
  if (!invoker) return false;
  const roleIds = invoker.roles.cache.map((r) => r.id);
  if (level === "owner") return roleIds.includes(OWNER_ROLE_ID);
  if (level === "mod") return roleIds.some((id) => MOD_ROLE_IDS.has(id));
  return true;
}

/**
 * Discord Action Tool — real Discord API moderation/admin actions
 *
 * Mod-level (voice-mute/unmute, voice-deafen/undeafen, timeout, remove-timeout,
 *            change-nickname, change-bot-nickname):
 *   Requires one of roles: 1473075468088377349 | 1473075468088377350 | 1473075468088377352
 *
 * Owner-level (kick, ban):
 *   Requires role: 1473075468088377352
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

      // ── Permission level required per action ─────────────────────────────
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
        const allowed = await checkModPermission(guild, userId, "owner");
        if (!allowed)
          return {
            success: false,
            error:
              "🔒 Permission denied. Only the server Owner can perform kick/ban actions.",
          };
      } else if (modActions.has(action)) {
        const allowed = await checkModPermission(guild, userId, "mod");
        if (!allowed)
          return {
            success: false,
            error:
              "🔒 Permission denied. You need a Moderator or higher role to perform this action.",
          };
      }

      // ── change-bot-nickname (no target member needed) ─────────────────────
      if (action === "change-bot-nickname") {
        const me = await guild.members.fetchMe();
        await me.setNickname(nickname ?? null, reason);
        return {
          success: true,
          message: nickname
            ? `My nickname has been changed to "${nickname}".`
            : "My nickname has been reset.",
        };
      }

      // ── Resolve target member by fuzzy name match ─────────────────────────
      const q = (targetName || "").toLowerCase();
      const member = q
        ? guild.members.cache.find(
            (m) =>
              !m.user.bot &&
              (m.displayName.toLowerCase().includes(q) ||
                m.user.username.toLowerCase().includes(q) ||
                (m.nickname && m.nickname.toLowerCase().includes(q))),
          )
        : null;

      if (!member)
        return {
          success: false,
          error: `Member "${targetName}" not found in this server.`,
        };

      // ── Prevent actions on the bot itself ────────────────────────────────
      if (member.id === client.user.id)
        return { success: false, error: "I can't moderate myself." };

      switch (action) {
        case "voice-mute":
          if (!member.voice?.channel)
            return {
              success: false,
              error: `${member.displayName} is not in a voice channel.`,
            };
          await member.voice.setMute(true, reason);
          return {
            success: true,
            message: `${member.displayName} has been server-muted in voice.`,
          };

        case "voice-unmute":
          if (!member.voice?.channel)
            return {
              success: false,
              error: `${member.displayName} is not in a voice channel.`,
            };
          await member.voice.setMute(false, reason);
          return {
            success: true,
            message: `${member.displayName} has been server-unmuted.`,
          };

        case "voice-deafen":
          if (!member.voice?.channel)
            return {
              success: false,
              error: `${member.displayName} is not in a voice channel.`,
            };
          await member.voice.setDeaf(true, reason);
          return {
            success: true,
            message: `${member.displayName} has been server-deafened.`,
          };

        case "voice-undeafen":
          if (!member.voice?.channel)
            return {
              success: false,
              error: `${member.displayName} is not in a voice channel.`,
            };
          await member.voice.setDeaf(false, reason);
          return {
            success: true,
            message: `${member.displayName} has been server-undeafened.`,
          };

        case "timeout": {
          const ms = Math.min(durationMinutes, 40320) * 60 * 1000;
          await member.timeout(ms, reason);
          return {
            success: true,
            message: `${member.displayName} has been timed out for ${durationMinutes} minute(s).`,
          };
        }

        case "remove-timeout":
          await member.timeout(null, reason);
          return {
            success: true,
            message: `${member.displayName}'s timeout has been removed.`,
          };

        case "kick":
          await member.kick(reason);
          return {
            success: true,
            message: `${member.displayName} has been kicked from the server.`,
          };

        case "ban":
          await member.ban({
            reason,
            deleteMessageSeconds: deleteDays * 86400,
          });
          return {
            success: true,
            message: `${member.displayName} has been banned from the server.`,
          };

        case "change-nickname":
          await member.setNickname(nickname ?? null, reason);
          return {
            success: true,
            message: nickname
              ? `${member.displayName}'s nickname has been changed to "${nickname}".`
              : `${member.displayName}'s nickname has been reset.`,
          };

        case "add-role": {
          if (!roleName)
            return {
              success: false,
              error: "roleName is required for add-role.",
            };
          const rq = roleName.toLowerCase();
          const role = guild.roles.cache.find((r) =>
            r.name.toLowerCase().includes(rq),
          );
          if (!role)
            return {
              success: false,
              error: `Role "${roleName}" not found in this server.`,
            };
          if (member.roles.cache.has(role.id))
            return {
              success: false,
              error: `${member.displayName} already has the "${role.name}" role.`,
            };
          await member.roles.add(role, reason);
          return {
            success: true,
            message: `The "${role.name}" role has been added to ${member.displayName}.`,
          };
        }

        case "remove-role": {
          if (!roleName)
            return {
              success: false,
              error: "roleName is required for remove-role.",
            };
          const rq = roleName.toLowerCase();
          const role = guild.roles.cache.find((r) =>
            r.name.toLowerCase().includes(rq),
          );
          if (!role)
            return {
              success: false,
              error: `Role "${roleName}" not found in this server.`,
            };
          if (!member.roles.cache.has(role.id))
            return {
              success: false,
              error: `${member.displayName} doesn't have the "${role.name}" role.`,
            };
          await member.roles.remove(role, reason);
          return {
            success: true,
            message: `The "${role.name}" role has been removed from ${member.displayName}.`,
          };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
});

export default {
  ragTool,
  commandExecutorTool,
  serverInfoTool,
  musicControlTool,
  embedGeneratorTool,
  createPrivateVCTool,
  discordActionTool,
};
