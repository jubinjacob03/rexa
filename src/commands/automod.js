import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from "discord.js";
import { loadConfig, updateConfig } from "../utils/automodManager.js";

export function generateAutomodDashboard(guild = null) {
  const config = loadConfig();
  const on = config.enabled;

  const embed = new EmbedBuilder()
    .setTitle(`ᴀᴜᴛᴏᴍᴏᴅ — ${on ? "ᴀᴄᴛɪᴠᴇ" : "ɪɴᴀᴄᴛɪᴠᴇ"}`)
    .setDescription(
      `**ʀᴀᴛᴇ ʟɪᴍɪᴛꜱ • ᴘᴇʀ 10ꜱ**\nᴍꜱɢ **${config.limits.messageSpam}** • ᴄʜ. ᴅᴇʟ **${config.limits.channelDelete}** • ɴɪᴄᴋ **${config.limits.nicknameChange}** • ᴍꜱɢ ᴅᴇʟ **${config.limits.messageDelete}**`,
    )
    .setColor("#00CED1")
    .setTimestamp();

  if (guild?.iconURL()) {
    embed.setThumbnail(guild.iconURL({ size: 256, dynamic: true }));
  }

  // Row 1: master toggle + edit limits
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("automod_toggle_master")
      .setLabel(on ? "ᴅɪꜱᴀʙʟᴇ ᴀᴜᴛᴏᴍᴏᴅ" : "ᴇɴᴀʙʟᴇ ᴀᴜᴛᴏᴍᴏᴅ")
      .setStyle(on ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("automod_edit_limits")
      .setLabel("ᴇᴅɪᴛ ʟɪᴍɪᴛꜱ")
      .setStyle(ButtonStyle.Secondary),
  );

  // Row 2: fixed-color feature buttons, label reflects on/off state
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("automod_toggle_spam")
      .setLabel(`ꜱᴘᴀᴍ ꜰɪʟᴛᴇʀ — ${config.spam ? "ᴏɴ" : "ᴏꜰꜰ"}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("automod_toggle_raid")
      .setLabel(`ʀᴀɪᴅ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ — ${config.raid ? "ᴏɴ" : "ᴏꜰꜰ"}`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("automod_toggle_toxicity")
      .setLabel(`ᴛᴏxɪᴄɪᴛʏ ꜰɪʟᴛᴇʀ — ${config.toxicity ? "ᴏɴ" : "ᴏꜰꜰ"}`)
      .setStyle(ButtonStyle.Success),
  );

  return { embeds: [embed], components: [row1, row2] };
}

export default {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure the autonomous AI Moderation system")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (
      interaction.guild &&
      interaction.user.id !== interaction.guild.ownerId
    ) {
      return interaction.reply({
        content: "Only the server owner can configure Automod.",
        ephemeral: true,
      });
    }

    const dashboard = generateAutomodDashboard(interaction.guild);
    await interaction.reply({
      ...dashboard,
      ephemeral: true,
    });
  },
};

export async function handleAutomodInteraction(interaction) {
  if (interaction.guild && interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({
      content: "Only the server owner can modify Automod settings.",
      ephemeral: true,
    });
  }

  const currentConfig = loadConfig();
  let newConfig = { ...currentConfig };

  if (
    interaction.isButton() &&
    interaction.customId === "automod_toggle_master"
  ) {
    newConfig = updateConfig({ enabled: !currentConfig.enabled });
  } else if (
    interaction.isButton() &&
    interaction.customId === "automod_edit_limits"
  ) {
    const modal = new ModalBuilder()
      .setCustomId("automod_limits_modal")
      .setTitle("Rate Limits (Per 10s)");

    const msgInput = new TextInputBuilder()
      .setCustomId("limit_msg")
      .setLabel("Max Messages")
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.messageSpam.toString())
      .setRequired(true);

    const chDelInput = new TextInputBuilder()
      .setCustomId("limit_chdel")
      .setLabel("Max Channel Deletes")
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.channelDelete.toString())
      .setRequired(true);

    const nickInput = new TextInputBuilder()
      .setCustomId("limit_nick")
      .setLabel("Max Nickname Changes")
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.nicknameChange.toString())
      .setRequired(true);

    const msgDelInput = new TextInputBuilder()
      .setCustomId("limit_msgdel")
      .setLabel("Max Message Deletes")
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.messageDelete.toString())
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(msgInput),
      new ActionRowBuilder().addComponents(chDelInput),
      new ActionRowBuilder().addComponents(nickInput),
      new ActionRowBuilder().addComponents(msgDelInput),
    );

    return await interaction.showModal(modal);
  } else if (
    interaction.isButton() &&
    interaction.customId === "automod_toggle_spam"
  ) {
    newConfig = updateConfig({ spam: !currentConfig.spam });
  } else if (
    interaction.isButton() &&
    interaction.customId === "automod_toggle_raid"
  ) {
    newConfig = updateConfig({ raid: !currentConfig.raid });
  } else if (
    interaction.isButton() &&
    interaction.customId === "automod_toggle_toxicity"
  ) {
    newConfig = updateConfig({ toxicity: !currentConfig.toxicity });
  } else if (
    interaction.isModalSubmit() &&
    interaction.customId === "automod_limits_modal"
  ) {
    const msg =
      parseInt(interaction.fields.getTextInputValue("limit_msg")) || 5;
    const chDel =
      parseInt(interaction.fields.getTextInputValue("limit_chdel")) || 2;
    const nick =
      parseInt(interaction.fields.getTextInputValue("limit_nick")) || 3;
    const msgDel =
      parseInt(interaction.fields.getTextInputValue("limit_msgdel")) || 3;

    newConfig = updateConfig({
      limits: {
        messageSpam: msg,
        channelDelete: chDel,
        nicknameChange: nick,
        messageDelete: msgDel,
      },
    });
  }

  const updatedDashboard = generateAutomodDashboard(interaction.guild);
  await interaction.update({
    ...updatedDashboard,
  });
}
