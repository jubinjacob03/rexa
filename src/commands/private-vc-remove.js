import { SlashCommandBuilder } from "discord.js";
import {
  getVCByMember,
  getVCData,
  removeMember,
} from "../utils/privateVCManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("vc-remove")
    .setDescription("Remove a member from your current private voice channel.")
    .addUserOption((o) =>
      o.setName("member").setDescription("Member to remove").setRequired(true),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const invokerId = interaction.user.id;

    const channelId = getVCByMember(invokerId);
    if (!channelId) {
      return interaction.editReply("You are not in a private VC.");
    }

    const invokerMember = interaction.member;
    if (invokerMember.voice?.channelId !== channelId) {
      return interaction.editReply(
        "You must be connected to your private VC to use this command.",
      );
    }

    const targetUser = interaction.options.getUser("member");

    const data = getVCData(channelId);
    if (!data.members.has(targetUser.id)) {
      return interaction.editReply(
        `<@${targetUser.id}> is not in this private VC.`,
      );
    }

    if (targetUser.id === invokerId) {
      return interaction.editReply(
        "You cannot remove yourself. Leave the VC instead.",
      );
    }

    const targetMember = await guild.members
      .fetch(targetUser.id)
      .catch(() => null);
    if (!targetMember) {
      return interaction.editReply("Could not find that member.");
    }

    await removeMember(channelId, targetMember, guild);

    await interaction.editReply(
      `✅ <@${targetUser.id}> has been removed from the private VC.`,
    );
  },
};
