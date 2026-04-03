import { SlashCommandBuilder, MessageFlags } from "discord.js";
import voiceManager from "../voice/VoiceManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Stop and leave voice channel"),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const connection = voiceManager.getConnection(guildId);

    if (!connection) {
      return interaction.reply({
        content: "\u274c Not connected to any voice channel",
        flags: MessageFlags.Ephemeral,
      });
    }

    voiceManager.stop(guildId);
    voiceManager.leaveChannel(guildId);

    await interaction.reply({
      content: "\u23f9\ufe0f Stopped and left voice channel",
      flags: MessageFlags.Ephemeral,
    });
  },
};
