import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from "discord.js";
import { loadConfig, updateConfig } from "../utils/automodManager.js";

const ON = "` ᴏɴ `";
const OFF = "` ᴏꜰꜰ `";

export function generateAutomodDashboard() {
  const config = loadConfig();

  const embed = new EmbedBuilder()
    .setTitle("ᴀᴜᴛᴏᴍᴏᴅ ᴄᴏɴꜰɪɢᴜʀᴀᴛɪᴏɴ")
    .setDescription(
      "Manage autonomous moderation rules and rate limits for this server.",
    )
    .setColor(config.enabled ? "#57F287" : "#ED4245")
    .addFields(
      {
        name: "ᴍᴀꜱᴛᴇʀ ꜱᴡɪᴛᴄʜ",
        value: config.enabled ? ON : OFF,
        inline: false,
      },
      { name: "\u200b", value: "\u200b", inline: false },
      {
        name: "ꜱᴘᴀᴍ ꜰɪʟᴛᴇʀ",
        value: config.spam ? ON : OFF,
        inline: true,
      },
      {
        name: "ʀᴀɪᴅ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ",
        value: config.raid ? ON : OFF,
        inline: true,
      },
      {
        name: "ᴛᴏxɪᴄɪᴛʏ ꜰɪʟᴛᴇʀ",
        value: config.toxicity ? ON : OFF,
        inline: true,
      },
      { name: "\u200b", value: "\u200b", inline: false },
      {
        name: "ʀᴀᴛᴇ ʟɪᴍɪᴛꜱ  ·  ᴘᴇʀ 10ꜱ",
        value: [
          `ᴍᴇꜱꜱᴀɢᴇꜱ          **${config.limits.messageSpam}**`,
          `ᴄʜᴀɴɴᴇʟ ᴅᴇʟᴇᴛᴇꜱ   **${config.limits.channelDelete}**`,
          `ɴɪᴄᴋɴᴀᴍᴇ ᴄʜᴀɴɢᴇꜱ  **${config.limits.nicknameChange}**`,
          `ᴍᴇꜱꜱᴀɢᴇ ᴅᴇʟᴇᴛᴇꜱ   **${config.limits.messageDelete}**`,
        ].join("\n"),
        inline: false,
      },
    )
    .setFooter({ text: "Changes take effect immediately." })
    .setTimestamp();

  const toggleButtonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("automod_toggle_master")
      .setLabel(config.enabled ? "ᴅɪꜱᴀʙʟᴇ ᴀᴜᴛᴏᴍᴏᴅ" : "ᴇɴᴀʙʟᴇ ᴀᴜᴛᴏᴍᴏᴅ")
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("automod_edit_limits")
      .setLabel("ᴇᴅɪᴛ ʟɪᴍɪᴛꜱ")
      .setStyle(ButtonStyle.Secondary),
  );

  const featureSelectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("automod_feature_select")
      .setPlaceholder("ᴛᴏɢɢʟᴇ ɪɴᴅɪᴠɪᴅᴜᴀʟ ꜰᴇᴀᴛᴜʀᴇꜱ")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("ꜱᴘᴀᴍ ꜰɪʟᴛᴇʀ")
          .setDescription(
            config.spam
              ? "Currently enabled — click to disable"
              : "Currently disabled — click to enable",
          )
          .setValue("toggle_spam"),
        new StringSelectMenuOptionBuilder()
          .setLabel("ʀᴀɪᴅ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ")
          .setDescription(
            config.raid
              ? "Currently enabled — click to disable"
              : "Currently disabled — click to enable",
          )
          .setValue("toggle_raid"),
        new StringSelectMenuOptionBuilder()
          .setLabel("ᴛᴏxɪᴄɪᴛʏ ꜰɪʟᴛᴇʀ")
          .setDescription(
            config.toxicity
              ? "Currently enabled — click to disable"
              : "Currently disabled — click to enable",
          )
          .setValue("toggle_toxicity"),
      ),
  );

  return { embeds: [embed], components: [toggleButtonRow, featureSelectRow] };
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
        content: "ᴏɴʟʏ ᴛʜᴇ ꜱᴇʀᴠᴇʀ ᴏᴡɴᴇʀ ᴄᴀɴ ᴄᴏɴꜰɪɢᴜʀᴇ ᴀᴜᴛᴏᴍᴏᴅ.",
        ephemeral: true,
      });
    }

    const dashboard = generateAutomodDashboard();
    await interaction.reply({
      ...dashboard,
      ephemeral: true,
    });
  },
};

export async function handleAutomodInteraction(interaction) {
  if (interaction.guild && interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({
      content: "ᴏɴʟʏ ᴛʜᴇ ꜱᴇʀᴠᴇʀ ᴏᴡɴᴇʀ ᴄᴀɴ ᴍᴏᴅɪꜰʏ ᴀᴜᴛᴏᴍᴏᴅ ꜱᴇᴛᴛɪɴɢꜱ.",
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
  } else if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "automod_feature_select"
  ) {
    const selected = interaction.values[0];
    if (selected === "toggle_spam")
      newConfig = updateConfig({ spam: !currentConfig.spam });
    if (selected === "toggle_raid")
      newConfig = updateConfig({ raid: !currentConfig.raid });
    if (selected === "toggle_toxicity")
      newConfig = updateConfig({ toxicity: !currentConfig.toxicity });
  }

  const updatedDashboard = generateAutomodDashboard();
  await interaction.update({
    ...updatedDashboard,
  });
}
