import { SlashCommandBuilder } from "discord.js";
import voiceManager from "../voice/VoiceManager.js";
import { eReply } from "../utils/embed.js";
import { i } from "../utils/icons.js";

/**
 * Command to stop playback and leave the voice channel.
 * @module leaveCommand
 */
export default {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Stop and leave voice channel"),

  /**
   * Executes the leave command.
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The interaction object.
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    const guildId = interaction.guild.id;
    const connection = voiceManager.getConnection(guildId);

    if (!connection) {
      return interaction.reply(
        eReply(
          `${i("ERROR")} ɴᴏᴛ ᴄᴏɴɴᴇᴄᴛᴇᴅ`,
          "ɴᴏᴛ ᴄᴏɴɴᴇᴄᴛᴇᴅ ᴛᴏ ᴀɴʏ ᴠᴏɪᴄᴇ ᴄʜᴀɴɴᴇʟ.",
        ),
      );
    }

    voiceManager.stop(guildId);
    voiceManager.leaveChannel(guildId);

    await interaction.reply(
      eReply(`${i("SUCCESS")} sᴛᴏᴘᴘᴇᴅ`, "ʟᴇғᴛ ᴛʜᴇ ᴠᴏɪᴄᴇ ᴄʜᴀɴɴᴇʟ."),
    );
  },
};
