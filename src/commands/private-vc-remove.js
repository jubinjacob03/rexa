import { SlashCommandBuilder, MessageFlags } from "discord.js";
import {
  getVCByMember,
  getVCData,
  removeMember,
} from "../utils/privateVCManager.js";
import { eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";

/**
 * Command to remove a member from a private voice channel.
 * @module privateVcRemoveCommand
 */
export default {
  data: new SlashCommandBuilder()
    .setName("private-vc-remove")
    .setDescription("Remove a member from your current private voice channel.")
    .addUserOption((o) =>
      o.setName("member").setDescription("Member to remove").setRequired(true),
    ),

  /**
   * Executes the private-vc-remove command.
   * @param {import("discord.js").ChatInputCommandInteraction} interaction - The interaction object.
   * @returns {Promise<void>}
   */
  async execute(interaction) {
    // Defer the reply to ensure the interaction doesn't timeout
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const invokerId = interaction.user.id;

    // Retrieve the private VC associated with the invoker
    const channelId = getVCByMember(invokerId);
    if (!channelId) {
      return interaction.editReply(
        eSend(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ɪɴ ᴀ ᴘʀɪᴠᴀᴛᴇ ᴠᴄ."),
      );
    }

    const invokerMember = interaction.member;

    // Ensure the invoker is currently connected to their private VC
    if (invokerMember.voice?.channelId !== channelId) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ɴᴏᴛ ᴄᴏɴɴᴇᴄᴛᴇᴅ`,
          "ʏᴏᴜ ᴍᴜsᴛ ʙᴇ ᴄᴏɴɴᴇᴄᴛᴇᴅ ᴛᴏ ʏᴏᴜʀ ᴘʀɪᴠᴀᴛᴇ ᴠᴄ ᴛᴏ ᴜsᴇ ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ.",
        ),
      );
    }

    const targetUser = interaction.options.getUser("member");
    const data = getVCData(channelId);

    // Check if the target user is actually in the private VC
    if (!data.members.has(targetUser.id)) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ɴᴏᴛ ɪɴ ᴠᴄ`,
          `<@${targetUser.id}> ɪs ɴᴏᴛ ɪɴ ᴛʜɪs ᴘʀɪᴠᴀᴛᴇ ᴠᴄ.`,
        ),
      );
    }

    // Prevent the invoker from removing themselves
    if (targetUser.id === invokerId) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ɪɴᴠᴀʟɪᴅ`,
          "ʏᴏᴜ ᴄᴀɴɴᴏᴛ ʀᴇᴍᴏᴠᴇ ʏᴏᴜʀsᴇʟғ. ʟᴇᴀᴠᴇ ᴛʜᴇ ᴠᴄ ɪɴsᴛᴇᴀᴅ.",
        ),
      );
    }

    // Fetch the target member from the guild
    const targetMember = await guild.members
      .fetch(targetUser.id)
      .catch(() => null);

    if (!targetMember) {
      return interaction.editReply(
        eSend(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "ᴄᴏᴜʟᴅ ɴᴏᴛ ғɪɴᴅ ᴛʜᴀᴛ ᴍᴇᴍʙᴇʀ."),
      );
    }

    // Remove the member from the private VC
    await removeMember(channelId, targetMember, guild);

    await interaction.editReply(
      eSend(
        `${i("DONE")} ᴍᴇᴍʙᴇʀ ʀᴇᴍᴏᴠᴇᴅ`,
        `<@${targetUser.id}> ʜᴀs ʙᴇᴇɴ ʀᴇᴍᴏᴠᴇᴅ ғʀᴏᴍ ᴛʜᴇ ᴘʀɪᴠᴀᴛᴇ ᴠᴄ.`,
      ),
    );
  },
};
