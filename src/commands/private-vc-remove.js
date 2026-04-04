import { SlashCommandBuilder, MessageFlags } from "discord.js";
import {
  getVCByMember,
  getVCData,
  removeMember,
} from "../utils/privateVCManager.js";
import { eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";

export default {
  data: new SlashCommandBuilder()
    .setName("private-vc-remove")
    .setDescription("Remove a member from your current private voice channel.")
    .addUserOption((o) =>
      o.setName("member").setDescription("Member to remove").setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const invokerId = interaction.user.id;

    const channelId = getVCByMember(invokerId);
    if (!channelId) {
      return interaction.editReply(
        eSend(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "ʏᴏᴜ ᴀʀᴇ ɴᴏᴛ ɪɴ ᴀ ᴘʀɪᴠᴀᴛᴇ ᴠᴄ."),
      );
    }

    const invokerMember = interaction.member;
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
    if (!data.members.has(targetUser.id)) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ɴᴏᴛ ɪɴ ᴠᴄ`,
          `<@${targetUser.id}> ɪs ɴᴏᴛ ɪɴ ᴛʜɪs ᴘʀɪᴠᴀᴛᴇ ᴠᴄ.`,
        ),
      );
    }

    if (targetUser.id === invokerId) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ɪɴᴠᴀʟɪᴅ`,
          "ʏᴏᴜ ᴄᴀɴɴᴏᴛ ʀᴇᴍᴏᴠᴇ ʏᴏᴜʀsᴇʟғ. ʟᴇᴀᴠᴇ ᴛʜᴇ ᴠᴄ ɪɴsᴛᴇᴀᴅ.",
        ),
      );
    }

    const targetMember = await guild.members
      .fetch(targetUser.id)
      .catch(() => null);
    if (!targetMember) {
      return interaction.editReply(
        eSend(`${i("ERROR")} ɴᴏᴛ ғᴏᴜɴᴅ`, "ᴄᴏᴜʟᴅ ɴᴏᴛ ғɪɴᴅ ᴛʜᴀᴛ ᴍᴇᴍʙᴇʀ."),
      );
    }

    await removeMember(channelId, targetMember, guild);

    await interaction.editReply(
      eSend(
        `${i("DONE")} ᴍᴇᴍʙᴇʀ ʀᴇᴍᴏᴠᴇᴅ`,
        `<@${targetUser.id}> ʜᴀs ʙᴇᴇɴ ʀᴇᴍᴏᴠᴇᴅ ғʀᴏᴍ ᴛʜᴇ ᴘʀɪᴠᴀᴛᴇ ᴠᴄ.`,
      ),
    );
  },
};
