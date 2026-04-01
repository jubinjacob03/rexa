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

export function generateAutomodDashboard() {
  const config = loadConfig();

  const on = config.enabled;
  const icon = on ? "🟢" : "🔴";

  const description = [
    `**AUTOMOD IS ${on ? "ACTIVE" : "INACTIVE"}.**`,
    "",
    `${config.spam ? "✦" : "·"}  Spam Filter       —  ${config.spam ? "**on**" : "off"}`,
    `${config.raid ? "✦" : "·"}  Raid Protection   —  ${config.raid ? "**on**" : "off"}`,
    `${config.toxicity ? "✦" : "·"}  Toxicity Filter   —  ${config.toxicity ? "**on**" : "off"}`,
    "",
    `**RATE LIMITS  ·  PER 10s**`,
    `Messages  **${config.limits.messageSpam}**  ·  Channel deletes  **${config.limits.channelDelete}**  ·  Nickname changes  **${config.limits.nicknameChange}**  ·  Message deletes  **${config.limits.messageDelete}**`,
  ].join("\n");

  const embed = new EmbedBuilder()
    .setTitle(`${icon} Automod Configuration`)
    .setDescription(description)
    .setColor(on ? "#57F287" : "#ED4245")
    .setTimestamp();

  const toggleButtonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("automod_toggle_master")
      .setLabel(on ? "Disable Automod" : "Enable Automod")
      .setStyle(on ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("automod_edit_limits")
      .setLabel("Edit Limits")
      .setStyle(ButtonStyle.Secondary),
  );

  const featureSelectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("automod_feature_select")
      .setPlaceholder("Toggle individual features...")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Spam Filter")
          .setDescription(
            config.spam
              ? "Enabled — click to disable"
              : "Disabled — click to enable",
          )
          .setValue("toggle_spam"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Raid Protection")
          .setDescription(
            config.raid
              ? "Enabled — click to disable"
              : "Disabled — click to enable",
          )
          .setValue("toggle_raid"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Toxicity Filter")
          .setDescription(
            config.toxicity
              ? "Enabled — click to disable"
              : "Disabled — click to enable",
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
        content: "Only the server owner can configure Automod.",
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
