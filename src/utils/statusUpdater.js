import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import config from "../../config.js";
import supabase from "./supabaseClient.js";
import { EMBED_COLOR } from "./embed.js";
import { icon } from "./icons.js";

let statusMessage = null;
let updateInterval = null;

/**
 * Creates the server information embed
 */
export async function createStatusEmbed(guild, client) {
  try {
    await guild.members.fetch();
  } catch (error) {
    if (
      error.code === "RateLimitError" ||
      error.name === "GatewayRateLimitError"
    ) {
      console.log(
        "[WARN] Rate limited, using cached member data for status update",
      );
    } else {
      console.error("[ERROR] Failed to fetch members:", error);
    }
  }

  const totalMembers = guild.memberCount;
  const botCount = guild.members.cache.filter((member) => member.user.bot).size;
  const humanCount = totalMembers - botCount;
  const onlineMembers = guild.members.cache.filter(
    (member) =>
      member.presence?.status === "online" ||
      member.presence?.status === "idle" ||
      member.presence?.status === "dnd",
  ).size;

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("sᴇʀᴠᴇʀ sᴛᴀᴛs")
    .setDescription(
      ` • **${humanCount}** ᴍᴇᴍʙᴇʀs • **${botCount}** ʙᴏᴛs • **${guild.roles.cache.size}** ʀᴏʟᴇs\n\n• **${guild.channels.cache.size}** ᴄʜᴀɴɴᴇʟs\n\n` +
        `\`\`\`ansi\n\u001b[1;32m ${onlineMembers} ᴏɴʟɪɴᴇ \u001b[0m\`\`\` \`\`\`ansi\n\u001b[1;31m ${totalMembers - onlineMembers} ᴏғғʟɪɴᴇ \u001b[0m\`\`\`\u200b`,
    )
    .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
    .setFooter({
      text: `ʟᴀsᴛ ᴜᴘᴅᴀᴛᴇᴅ`,
      iconURL: client.user.displayAvatarURL(),
    })
    .setTimestamp();

  return embed;
}

/**
 * Updates the server information message
 */
export async function updateStatusMessage(client) {
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

    const embed = await createStatusEmbed(guild, client);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("refresh_stats")
        .setLabel("sʏɴᴄ")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("status_roles_info")
        .setLabel("ʀᴏʟᴇs")
        .setStyle(ButtonStyle.Success),
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
            console.log(
              "[INFO] Saved stats message ID no longer valid, will create new",
            );
            statusMessage = null;
          }
        }
      } catch (error) {
        console.error(
          "[WARN] Could not load stats message ID from DB:",
          error.message,
        );
      }
    }

    if (statusMessage) {
      try {
        await statusMessage.edit({
          embeds: [embed],
          components: [row],
        });
        console.log(
          `[INFO] Server info updated at ${new Date().toLocaleTimeString()}`,
        );
      } catch (error) {
        console.error(
          "[ERROR] Could not edit message, creating new one:",
          error.message,
        );
        statusMessage = null;
      }
    }

    if (!statusMessage) {
      statusMessage = await channel.send({
        embeds: [embed],
        components: [row],
      });
      await statusMessage.pin();
      console.log("[INFO] New server info message created and pinned!");
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
  } catch (error) {
    console.error("[ERROR] Failed to update server info:", error);
  }
}

/**
 * Starts server monitoring
 */
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

/**
 * Stops the server monitoring
 */
export function stopStatusUpdater() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log("[INFO] Server monitoring stopped");
  }
}

/**
 * Gets the current status message
 */
export function getStatusMessage() {
  return statusMessage;
}

/**
 * Sets the status message reference
 */
export function setStatusMessage(message) {
  statusMessage = message;
}
