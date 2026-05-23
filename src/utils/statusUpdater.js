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

export async function createStatusContainer(guild) {
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

  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
  const updatedAt = Math.floor(Date.now() / 1000);

  const content = `## 🔒 sᴇʀᴠᴇʀ sᴛᴀᴛs \u200B\n\n\n• **${humanCount}** ᴍᴇᴍʙᴇʀs • **${botCount}** ʙᴏᴛs • **${guild.channels.cache.size}** ᴄʜᴀɴɴᴇʟs\n\n\`\`\`ansi\n\u001b[1;32m ${onlineMembers} ᴏɴʟɪɴᴇ \u001b[0m\`\`\`\`\`\`ansi\n\u001b[1;31m ${totalMembers - onlineMembers} ᴏғғʟɪɴᴇ \u001b[0m\`\`\`\nLast updated <t:${updatedAt}:R>`;
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

    const container = await createStatusContainer(guild);

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
          console.log(
            `[INFO] Server info updated at ${new Date().toLocaleTimeString()}`,
          );
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
      statusMessage = await channel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      }).catch(err => {
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
