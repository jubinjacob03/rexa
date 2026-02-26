import { SlashCommandBuilder } from "discord.js";
import {
  canCreate,
  activeCount,
  createPrivateVC,
} from "../utils/privateVCManager.js";
import config from "../../config.js";

export default {
  data: new SlashCommandBuilder()
    .setName("private")
    .setDescription("Create a private voice channel for selected members.")
    .addUserOption((o) =>
      o.setName("member1").setDescription("Member to invite").setRequired(true),
    )
    .addUserOption((o) =>
      o
        .setName("member2")
        .setDescription("Member to invite")
        .setRequired(false),
    )
    .addUserOption((o) =>
      o
        .setName("member3")
        .setDescription("Member to invite")
        .setRequired(false),
    )
    .addUserOption((o) =>
      o
        .setName("member4")
        .setDescription("Member to invite")
        .setRequired(false),
    )
    .addUserOption((o) =>
      o
        .setName("member5")
        .setDescription("Member to invite")
        .setRequired(false),
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const invoker = interaction.member;

    if (!canCreate()) {
      return interaction.editReply(
        `Maximum of ${config.privateVC.maxSimultaneous} private VCs are already active. Wait for one to end.`,
      );
    }

    const memberMap = new Map([[invoker.id, invoker]]);
    for (const key of ["member1", "member2", "member3", "member4", "member5"]) {
      const user = interaction.options.getUser(key);
      if (!user) continue;
      if (user.bot) continue;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (member) memberMap.set(member.id, member);
    }

    const members = [...memberMap.values()];

    const channel = await createPrivateVC(guild, members);
    if (!channel) {
      return interaction.editReply(
        "Failed to create private VC. Please try again.",
      );
    }

    const mentions = members
      .filter((m) => m.id !== invoker.id)
      .map((m) => `<@${m.id}>`)
      .join(", ");

    await interaction.editReply(
      `✅ **${channel.name}** created!\nInvited: ${mentions || "no others"}\n\nMembers not in voice will need to join manually.`,
    );
  },
};
