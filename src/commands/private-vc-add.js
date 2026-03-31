import { SlashCommandBuilder } from "discord.js";
import {
  getVCByMember,
  getVCData,
  addMember,
} from "../utils/privateVCManager.js";

export default {
  data: new SlashCommandBuilder()
    .setName("vc-add")
    .setDescription("Add a member to your current private voice channel.")
    .addUserOption((o) =>
      o.setName("member").setDescription("Member to add").setRequired(true),
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
    if (targetUser.bot) {
      return interaction.editReply("You cannot add bots.");
    }

    const data = getVCData(channelId);
    if (data.members.has(targetUser.id)) {
      return interaction.editReply(
        `<@${targetUser.id}> is already in this VC.`,
      );
    }

    if (getVCByMember(targetUser.id)) {
      return interaction.editReply(
        `<@${targetUser.id}> is already in another private VC and cannot be added.`,
      );
    }

    const targetMember = await guild.members
      .fetch(targetUser.id)
      .catch(() => null);
    if (!targetMember) {
      return interaction.editReply("Could not find that member.");
    }

    const ok = await addMember(channelId, targetMember, guild);
    if (!ok) {
      return interaction.editReply("Failed to add member.");
    }

    await interaction.editReply(
      `✅ <@${targetUser.id}> has been added to the private VC.${
        targetMember.voice?.channel
          ? ""
          : " They are not in voice — they can now join manually."
      }`,
    );
  },
};
