import { SlashCommandBuilder, MessageFlags } from "discord.js";
import {
  getVCByMember,
  getVCData,
  addMember,
} from "../utils/privateVCManager.js";
import { eSend } from "../utils/embed.js";
import { i } from "../utils/icons.js";

/**
 * Command to add a member to a private voice channel.
 * @module privateVcAddCommand
 */
export default {
  data: new SlashCommandBuilder()
    .setName("private-vc-add")
    .setDescription("Add a member to your current private voice channel.")
    .addUserOption((o) =>
      o.setName("member").setDescription("Member to add").setRequired(true),
    ),

  /**
   * Executes the private-vc-add command.
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
    
    // Prevent adding bots to the private VC
    if (targetUser.bot) {
      return interaction.editReply(
        eSend(`${i("ERROR")} ɪɴᴠᴀʟɪᴅ`, "ʏᴏᴜ ᴄᴀɴɴᴏᴛ ᴀᴅᴅ ʙᴏᴛs."),
      );
    }

    const data = getVCData(channelId);
    
    // Check if the target user is already in the private VC
    if (data.members.has(targetUser.id)) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ᴀʟʀᴇᴀᴅʏ ᴀᴅᴅᴇᴅ`,
          `<@${targetUser.id}> ɪs ᴀʟʀᴇᴀᴅʏ ɪɴ ᴛʜɪs ᴠᴄ.`,
        ),
      );
    }

    // Check if the target user is already in another private VC
    if (getVCByMember(targetUser.id)) {
      return interaction.editReply(
        eSend(
          `${i("ERROR")} ᴜɴᴀᴠᴀɪʟᴀʙʟᴇ`,
          `<@${targetUser.id}> ɪs ᴀʟʀᴇᴀᴅʏ ɪɴ ᴀɴᴏᴛʜᴇʀ ᴘʀɪᴠᴀᴛᴇ ᴠᴄ ᴀɴᴅ ᴄᴀɴɴᴏᴛ ʙᴇ ᴀᴅᴅᴇᴅ.`,
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

    // Attempt to add the member to the private VC
    const ok = await addMember(channelId, targetMember, guild);
    if (!ok) {
      return interaction.editReply(
        eSend(`${i("ERROR")} ғᴀɪʟᴇᴅ`, "ғᴀɪʟᴇᴅ ᴛᴏ ᴀᴅᴅ ᴍᴇᴍʙᴇʀ."),
      );
    }

    await interaction.editReply(
      eSend(
        `${i("DONE")} ᴍᴇᴍʙᴇʀ ᴀᴅᴅᴇᴅ`,
        `<@${targetUser.id}> ʜᴀs ʙᴇᴇɴ ᴀᴅᴅᴇᴅ ᴛᴏ ᴛʜᴇ ᴘʀɪᴠᴀᴛᴇ ᴠᴄ.${
          targetMember.voice?.channel
            ? ""
            : " ᴛʜᴇʏ ᴀʀᴇ ɴᴏᴛ ɪɴ ᴠᴏɪᴄᴇ — ᴛʜᴇʏ ᴄᴀɴ ɴᴏᴡ ᴊᴏɪɴ ᴍᴀɴᴜᴀʟʟʏ."
        }`,
      ),
    );
  },
};
