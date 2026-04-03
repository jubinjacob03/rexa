import { SlashCommandBuilder, MessageFlags } from "discord.js";
import voiceManager from "../voice/VoiceManager.js";
import { ChannelType } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join voice channel for playback"),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const member = interaction.member;
    const guild = interaction.guild;
    let targetChannel = member.voice.channel;

    if (!targetChannel) {
      const channels = guild.channels.cache.filter(
        (ch) => ch.type === ChannelType.GuildVoice && ch.members.size > 0,
      );

      if (channels.size === 0) {
        return interaction.editReply("❌ No active voice channels");
      }

      targetChannel = channels.reduce((prev, curr) =>
        curr.members.size > prev.members.size ? curr : prev,
      );
    }

    try {
      await voiceManager.joinChannel(guild, targetChannel);
      await interaction.editReply(`✅ Joined **${targetChannel.name}**`);
    } catch (error) {
      console.error("[ERROR] Failed to join:", error);
      await interaction.editReply("❌ Failed to join voice channel");
    }
  },
};
