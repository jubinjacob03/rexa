import { SlashCommandBuilder, MessageFlags } from "discord.js";
import voiceManager from "../voice/VoiceManager.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  data: new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show overall bot status"),

  async execute(interaction) {
    const client = interaction.client;
    const guild = interaction.guild;

    let status = `🤖 **Bot Status**\n\n`;
    status += `📡 **Uptime:** ${formatUptime(client.uptime)}\n`;
    status += `📊 **Guilds:** ${client.guilds.cache.size}\n`;
    status += `👥 **Users:** ${client.users.cache.size}\n`;
    status += `💬 **Channels:** ${client.channels.cache.size}\n\n`;

    const voiceStatus = voiceManager.getStatus(guild.id);
    if (voiceStatus.connected) {
      const channel = guild.channels.cache.get(voiceStatus.channelId);
      status += `🔊 **Voice:** Connected to **${channel?.name || "Unknown"}**\n`;

      if (voiceStatus.currentSound) {
        status += `🎵 **Playing:** ${voiceStatus.currentSound.soundName}\n`;
        status += `⏱️ **Progress:** ${Math.floor(voiceStatus.progress)}s\n`;
      }

      if (voiceStatus.queueLength > 0) {
        status += `📋 **Queue:** ${voiceStatus.queueLength} sound(s)\n`;
      }
    } else {
      status += `⚫ **Voice:** Not connected\n`;
    }

    try {
      const verificationPath = join(
        __dirname,
        "..",
        "..",
        "data",
        "verification.json",
      );
      const verificationData = JSON.parse(
        readFileSync(verificationPath, "utf8"),
      );

      if (verificationData[guild.id]) {
        const config = verificationData[guild.id];
        status += `\n✅ **Verification:** Active`;
        if (config.verificationChannelId) {
          status += ` (<#${config.verificationChannelId}>)`;
        }
      }
    } catch (error) {
      // Ignore if verification not configured
    }

    await interaction.reply({
      content: status,
      flags: MessageFlags.Ephemeral,
    });
  },
};

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
