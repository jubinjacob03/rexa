/**
 * Unified Tools Implementation
 * All agent tools in one place using AI SDK
 */

import { tool } from "ai";
import { z } from "zod";
import { EmbedBuilder } from "discord.js";
import knowledgeBase from "./knowledge-base.js";
import config from "../config.js";

// Discord client reference
let client = null;

export function initializeTools(discordClient) {
  client = discordClient;
  console.log("[TOOLS] Initialized with Discord client");
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
      return { success: false, error: `Command blocked: ${command}` };
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
      const guild = await client.guilds.fetch(guildId);

      if (infoType === "stats") {
        await guild.members.fetch();
        return {
          success: true,
          serverName: guild.name,
          memberCount: guild.memberCount,
          onlineCount: guild.members.cache.filter(
            (m) => m.presence?.status !== "offline",
          ).size,
          channelCount: guild.channels.cache.size,
          roleCount: guild.roles.cache.size,
        };
      }

      if (infoType === "member" && targetId) {
        const member = await guild.members.fetch(targetId);
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
        await guild.members.fetch();
        const q = searchQuery.toLowerCase();
        const results = [
          ...guild.members.cache
            .filter(
              (m) =>
                m.user.username.toLowerCase().includes(q) ||
                m.displayName.toLowerCase().includes(q) ||
                (m.nickname && m.nickname.toLowerCase().includes(q)),
            )
            .values(),
        ]
          .slice(0, limit || 10)
          .map((m) => ({
            id: m.id,
            username: m.user.username,
            displayName: m.displayName,
            nickname: m.nickname || null,
            status: m.presence?.status || "offline",
          }));
        return { success: true, results, count: results.length };
      }

      if (infoType === "members") {
        await guild.members.fetch();
        const members = [...guild.members.cache.values()].map((m) => ({
          id: m.id,
          username: m.user.username,
          displayName: m.displayName,
          nickname: m.nickname || null,
          status: m.presence?.status || "offline",
          roles: m.roles.cache
            .filter((r) => r.name !== "@everyone")
            .map((r) => ({ id: r.id, name: r.name })),
        }));
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

    // Resolve the user's current voice channel for the play action
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

// Export all tools as object
export default {
  ragTool,
  commandExecutorTool,
  serverInfoTool,
  musicControlTool,
  embedGeneratorTool,
};
