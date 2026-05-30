import { SlashCommandBuilder, MessageFlags } from "discord.js";
import voiceManager from "../voice/VoiceManager.js";
import { ChannelType } from "discord.js";
import { eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";

/**
 * Command to join a voice channel for playback.
 * @module joinCommand
 */
export default {
  data: new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join voice channel for playback"),

  /**
   * Executes the join command.
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The interaction object.
   * @returns {Promise<void>}
   */
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
        return interaction.editReply(
          eSend(
            `${i("ERROR")} ɴᴏ ᴠᴏɪᴄᴇ ᴄʜᴀɴɴᴇʟs`,
            "ɴᴏ ᴀᴄᴛɪᴠᴇ ᴠᴏɪᴄᴇ ᴄʜᴀɴɴᴇʟs ғᴏᴜɴᴅ.",
          ),
        );
      }

      targetChannel = channels.reduce((prev, curr) =>
        curr.members.size > prev.members.size ? curr : prev,
      );
    }

    try {
      await voiceManager.joinChannel(guild, targetChannel);
      await interaction.editReply(
        eSend(
          `${i("SUCCESS")} ᴊᴏɪɴᴇᴅ`,
          `ᴄᴏɴɴᴇᴄᴛᴇᴅ ᴛᴏ **${targetChannel.name}**.`,
        ),
      );
    } catch (error) {
      console.error("[ERROR] Failed to join:", error);
      await interaction.editReply(
        eSend(`${i("ERROR")} ғᴀɪʟᴇᴅ`, "ғᴀɪʟᴇᴅ ᴛᴏ ᴊᴏɪɴ ᴠᴏɪᴄᴇ ᴄʜᴀɴɴᴇʟ."),
      );
    }
  },
};
