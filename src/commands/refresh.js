import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { updateStatusMessage } from "../utils/statusUpdater.js";
import { eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";

export default {
  data: new SlashCommandBuilder()
    .setName("refresh")
    .setDescription("Manually refresh the server information message")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
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
