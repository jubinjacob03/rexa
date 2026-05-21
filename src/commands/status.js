import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} from "discord.js";
import voiceManager from "../voice/VoiceManager.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { i, icon } from "../utils/icons.js";
import { EPHEMERAL_COLOR, addFooter } from "../utils/embed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show overall bot status"),

  async execute(interaction) {
    const payload = await buildStatusPayload(interaction.client, interaction.guild);
    await interaction.reply({
      ...payload,
      ephemeral: true
    });
  },
};

export async function buildStatusPayload(client, guild) {
  let botStats = `${icon("UPTIME")} **ᴜᴘᴛɪᴍᴇ:** ${formatUptime(client.uptime)}\n`;
  botStats += `${icon("MEMBERS")} **ᴜsᴇʀs:** ${client.users.cache.size}\n`;
  botStats += `${icon("CHANNELS")} **ᴄʜᴀɴɴᴇʟs:** ${client.channels.cache.size}`;

  let voiceStats = "";
  const voiceStatus = voiceManager.getStatus(guild.id);
  if (voiceStatus.connected) {
    const channel = guild.channels.cache.get(voiceStatus.channelId);
    voiceStats += `${icon("VOICE")} **ᴠᴏɪᴄᴇ:** ᴄᴏɴɴᴇᴄᴛᴇᴅ ᴛᴏ **${channel?.name || "ᴜɴᴋɴᴏᴡɴ"}**\n`;

    if (voiceStatus.currentSound) {
      voiceStats += `${icon("MUSIC")} **ᴘʟᴀʏɪɴɢ:** ${voiceStatus.currentSound.soundName}\n`;
      voiceStats += `${icon("TIMER")} **ᴘʀᴏɢʀᴇss:** ${Math.floor(voiceStatus.progress)}s\n`;
    }

    if (voiceStatus.queueLength > 0) {
      voiceStats += `${icon("CLIPBOARD")} **ǫᴜᴇᴜᴇ:** ${voiceStatus.queueLength} sᴏᴜɴᴅ(s)`;
    }
  } else {
    voiceStats += `${icon("OFFLINE")} **ᴠᴏɪᴄᴇ:** ɴᴏᴛ ᴄᴏɴɴᴇᴄᴛᴇᴅ`;
  }

  let verifStats = "";
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
      verifStats += `${icon("SUCCESS")} **ᴠᴇʀɪғɪᴄᴀᴛɪᴏɴ:** ᴀᴄᴛɪᴠᴇ`;
      if (cfg.verificationChannelId)
        verifStats += ` (<#${cfg.verificationChannelId}>)`;
    }
  } catch {
  }

  const refreshRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("refresh_bot_status")
      .setLabel("ʀᴇғʀᴇsʜ")
      .setStyle(ButtonStyle.Secondary),
  );

  const container = new ContainerBuilder()
    .setAccentColor(EPHEMERAL_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${i("BOT")} ʙᴏᴛ sᴛᴀᴛᴜs\n\n${botStats}`)
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(voiceStats)
    );

  if (verifStats) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(verifStats)
      );
  }

  container.addActionRowComponents(refreshRow);

  addFooter(container);

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
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
