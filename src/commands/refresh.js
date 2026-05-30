import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { updateStatusMessage } from "../utils/statusUpdater.js";
import { eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";

/**
 * Command to manually refresh the server information message.
 * @module refreshCommand
 */
export default {
  data: new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Manually refresh the server information message")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  /**
   * Executes the refresh command.
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The interaction object.
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await updateStatusMessage(interaction.client);
      await interaction.editReply(
        eSend(
          `${i("SUCCESS")} ʀᴇғʀᴇsʜᴇᴅ`,
          "sᴇʀᴠᴇʀ ɪɴғᴏʀᴍᴀᴛɪᴏɴ ʜᴀs ʙᴇᴇɴ ʀᴇғʀᴇsʜᴇᴅ!",
        ),
      );
    } catch (error) {
      console.error("[ERROR] Failed to refresh status:", error);
      await interaction.editReply(
        eSend(
          `${i("ERROR")} ғᴀɪʟᴇᴅ`,
          "ғᴀɪʟᴇᴅ ᴛᴏ ʀᴇғʀᴇsʜ sᴇʀᴠᴇʀ ɪɴғᴏʀᴍᴀᴛɪᴏɴ. ᴄʜᴇᴄᴋ ᴄᴏɴsᴏʟᴇ ғᴏʀ ᴅᴇᴛᴀɪʟs.",
        ),
      );
    }
  },
};
