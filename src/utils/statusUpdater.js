import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import config from "../../config.js";
import supabase from "./supabaseClient.js";
import { EMBED_COLOR, addFooter } from "./embed.js";
import { icon } from "./icons.js";

let statusMessage = null;
let updateInterval = null;

/**
 * Pulls a fresh member + presence snapshot from the gateway, bounded by a short
 * timeout so it can never hang the way an unbounded fetch can. Falls back to the
 * existing cache if the live fetch times out or fails.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @returns {Promise<void>}
 */
async function refreshMemberData(guild) {
  try {
    await guild.members.fetch({ withPresences: true, time: 15_000 });
  } catch (error) {
    const benign =
      error.code === "GuildMembersTimeout" ||
      error.code === "RateLimitError" ||
      error.name === "GatewayRateLimitError";
    if (!benign) {
      console.error("[ERROR] Failed to fetch members:", error);
    }
  }
}

/**
 * Builds the server-stats container.
 * @param {import('discord.js').Guild} guild - The Discord guild.
 * @param {boolean} [live=true] - When true, pull a fresh member/presence snapshot
 *   before counting; when false, use the in-memory cache as-is.
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
export async function createStatusContainer(guild, live = true) {
  if (live) {
    await refreshMemberData(guild);
  }

  const totalMembers = guild.memberCount;
  const botCount = guild.members.cache.filter((member) => member.user.bot).size;
  const humanCount = Math.max(totalMembers - botCount, 0);
  const onlineMembers = guild.presences.cache.filter((p) => {
    if (p.status === "offline") return false;
    const member = guild.members.cache.get(p.userId);
    return member && !member.user.bot;
  }).size;

  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
  const updatedAt = Math.floor(Date.now() / 1000);

  const content = `## ${icon("LOCK")} sᴇʀᴠᴇʀ sᴛᴀᴛs \u200B\n\n\n• **${humanCount}** ᴍᴇᴍʙᴇʀs • **${botCount}** ʙᴏᴛs • **${guild.channels.cache.size}** ᴄʜᴀɴɴᴇʟs\n\n\`\`\`ansi\n\u001b[1;32m ${onlineMembers} ᴏɴʟɪɴᴇ \u001b[0m\`\`\`\`\`\`ansi\n\u001b[1;31m ${Math.max(totalMembers - onlineMembers, 0)} ᴏғғʟɪɴᴇ \u001b[0m\`\`\`\nLast updated <t:${updatedAt}:R>`;
  const iconUrl = guild.iconURL({ dynamic: true, size: 256 });

  if (iconUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(content),
    );
  }

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small),
  );

  return container;
}

/**
 * Updates (or creates) the server-stats dashboard message.
 * @param {import('discord.js').Client} client - The Discord client.
 * @param {boolean} [live=true] - When true, pull a fresh member/presence snapshot
 *   before rendering; when false, render from the in-memory cache (used by the
 *   high-frequency join/leave/update events that already keep the cache current).
 * @returns {Promise<void>}
 */
export async function updateStatusMessage(client, live = true) {
  try {
    const guild = client.guilds.cache.get(config.guildId);
    if (!guild) {
      console.error("[ERROR] Guild not found!");
      return;
    }

    const channel = guild.channels.cache.get(config.statusChannelId);
    if (!channel) {
      console.error("[ERROR] Verification channel not found!");
      return;
    }

    const container = await createStatusContainer(guild, live);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("refresh_stats")
        .setLabel("sʏɴᴄ")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setLabel("ɢᴜɪᴅᴇ")
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://discord.com/channels/${config.guildId}/1515070265221185596`,
        ),
      new ButtonBuilder()
        .setLabel("ʀᴜʟᴇs")
        .setStyle(ButtonStyle.Link)
        .setURL(
          `https://discord.com/channels/${config.guildId}/${config.rulesChannelId}`,
        ),
    );

    if (config.instagramUrl) {
      row.addComponents(
        new ButtonBuilder()
          .setEmoji(icon("INSTAGRAM"))
          .setLabel(" ")
          .setStyle(ButtonStyle.Link)
          .setURL(config.instagramUrl),
      );
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId("status_whatsapp")
        .setEmoji(icon("WHATSAPP"))
        .setStyle(ButtonStyle.Secondary),
    );

    if (!statusMessage) {
      try {
        const { data } = await supabase
          .from("bot_settings")
          .select("value")
          .eq("key", "stats_message_id")
          .single();

        if (data?.value) {
          try {
            statusMessage = await channel.messages.fetch(data.value);
            console.log("[INFO] Restored stats message from saved ID");
          } catch {
            statusMessage = null;
          }
        }
      } catch (error) {
        console.error(
          "[WARN] Could not load stats message ID from DB:",
          error.message,
        );
      }

      if (!statusMessage) {
        try {
          const messages = await channel.messages.fetch({ limit: 10 });
          const existing = messages.find((m) => {
            if (m.author.id !== client.user.id) return false;
            const flat = JSON.stringify(m.components ?? []);
            return flat.includes("refresh_stats");
          });
          if (existing) {
            statusMessage = existing;
            console.log("[INFO] Found existing stats message in channel scan");
          }
        } catch (err) {
          console.error(
            "[ERROR] Failed to scan channel for stats message:",
            err.message,
          );
        }
      }
    }

    container.addActionRowComponents(row);
    addFooter(container);

    if (statusMessage) {
      try {
        const isLegacy = statusMessage.embeds?.length > 0;
        if (isLegacy) {
          await statusMessage.delete().catch(() => {});
          statusMessage = null;
        } else {
          await statusMessage.edit({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          });
        }
      } catch (error) {
        console.error(
          "[ERROR] Could not edit message, creating new one:",
          error.message,
        );
        statusMessage = null;
      }
    }

    if (!statusMessage) {
      statusMessage = await channel
        .send({
          components: [container],
          flags: MessageFlags.IsComponentsV2,
        })
        .catch((err) => {
          console.error("[ERROR] Failed to send status message:", err);
          return null;
        });

      if (statusMessage) {
        console.log("[INFO] New server info message created!");
        try {
          await supabase
            .from("bot_settings")
            .upsert(
              { key: "stats_message_id", value: statusMessage.id },
              { onConflict: "key" },
            );
        } catch (err) {
          console.error("[WARN] Could not save stats message ID:", err.message);
        }
      }
    }
  } catch (error) {
    console.error("[ERROR] Failed to update server info:", error);
  }
}

export function startStatusUpdater(client) {
  console.log(
    `[INFO] Shantha starting server monitoring (interval: ${config.updateInterval} minutes)`,
  );

  updateStatusMessage(client);

  updateInterval = setInterval(
    () => {
      updateStatusMessage(client);
    },
    config.updateInterval * 60 * 1000,
  );
}

export function stopStatusUpdater() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log("[INFO] Server monitoring stopped");
  }
}

/**
 * Retrieves the current status message instance.
 * @returns {import('discord.js').Message|null} The status message.
 */
export function getStatusMessage() {
  return statusMessage;
}

/**
 * Sets the current status message instance.
 * @param {import('discord.js').Message} message - The status message to set.
 */
export function setStatusMessage(message) {
  statusMessage = message;
}
