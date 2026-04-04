import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import voiceManager from "../voice/VoiceManager.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { eReply } from "../utils/embed.js";
import { i, icon } from "../utils/icons.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show overall bot status"),

  async execute(interaction) {
    await interaction.reply(
      await buildStatusPayload(interaction.client, interaction.guild),
    );
  },
};

export async function buildStatusPayload(client, guild) {
  let status = `\u200b\n${icon("UPTIME")} **ᴜᴘᴛɪᴍᴇ :** ${formatUptime(client.uptime)}\n\n`;
  status += `${icon("STATS")} **ɢᴜɪʟᴅs :** ${client.guilds.cache.size}\n\n`;
  status += `${icon("MEMBERS")} **ᴜsᴇʀs :** ${client.users.cache.size}\n\n`;
  status += `${icon("CHANNELS")} **ᴄʜᴀɴɴᴇʟs :** ${client.channels.cache.size}\n\n`;

  const voiceStatus = voiceManager.getStatus(guild.id);
  if (voiceStatus.connected) {
    const channel = guild.channels.cache.get(voiceStatus.channelId);
    status += `${icon("VOICE")} **ᴠᴏɪᴄᴇ :** ᴄᴏɴɴᴇᴄᴛᴇᴅ ᴛᴏ **${channel?.name || "ᴜɴᴋɴᴏᴡɴ"}**\n\n`;

    if (voiceStatus.currentSound) {
      status += `${icon("MUSIC")} **ᴘʟᴀʏɪɴɢ :** ${voiceStatus.currentSound.soundName}\n\n`;
      status += `${icon("TIMER")} **ᴘʀᴏɢʀᴇss :** ${Math.floor(voiceStatus.progress)}s\n\n`;
    }

    if (voiceStatus.queueLength > 0) {
      status += `${icon("CLIPBOARD")} **ǫᴜᴇᴜᴇ :** ${voiceStatus.queueLength} sᴏᴜɴᴅ(s)\n\n`;
    }
  } else {
    status += `${icon("OFFLINE")} **ᴠᴏɪᴄᴇ :** ɴᴏᴛ ᴄᴏɴɴᴇᴄᴛᴇᴅ\n\n`;
  }

  try {
    const verificationPath = join(
      __dirname,
      "..",
      "..",
      "data",
      "verification.json",
    );
    const verificationData = JSON.parse(readFileSync(verificationPath, "utf8"));
    if (verificationData[guild.id]) {
      const cfg = verificationData[guild.id];
      status += `\n${icon("SAVED")} **ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ:** ᴀᴄᴛɪᴠᴇ`;
      if (cfg.verificationChannelId)
        status += ` (<#${cfg.verificationChannelId}>)`;
    }
  } catch {
    // not configured
  }

  const refreshRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("refresh_bot_status")
      .setLabel("ʀᴇғʀᴇsʜ")
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    ...eReply(`${i("BOT")} ʙᴏᴛ sᴛᴀᴛᴜs`, status),
    components: [refreshRow],
  };
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
