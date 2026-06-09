import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { EMBED_COLOR } from "../utils/embed.js";
import { checkModerationPermission } from "../utils/moderation.js";
import { embedSessions, renderEmbedDashboard } from "../utils/embedBuilderHandler.js";
import { eReply } from "../utils/embed.js";

export default {
  data: new SlashCommandBuilder()
    .setName("embed-builder")
    .setDescription("Launch the interactive Embed Builder Dashboard")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The target channel where the embed will be published")
        .setRequired(true),
    ),

  async execute(interaction) {
    if (
      !(await checkModerationPermission(
        interaction.guild,
        interaction.user.id,
        "mod",
      ))
    ) {
      return interaction.reply(eReply("Notice", "Admins/Moderators only."));
    }

    const targetChannel = interaction.options.getChannel("channel");

    embedSessions.set(interaction.user.id, {
      title: "",
      description: "",
      color: EMBED_COLOR,
      thumbnailUrl: "",
      fields: [],
      footerText: "",
      targetChannelId: targetChannel.id,
      targetChannelName: targetChannel.name,
      timestamp: Date.now(),
    });

    await renderEmbedDashboard(interaction);
  },
};
