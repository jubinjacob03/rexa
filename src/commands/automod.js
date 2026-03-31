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
  PermissionFlagsBits
} from "discord.js";
import { loadConfig, updateConfig } from "../utils/automodManager.js";

export function generateAutomodDashboard() {
  const config = loadConfig();

  const embed = new EmbedBuilder()
    .setTitle("🛡️ AutoMod Configuration")
    .setDescription("Configure the autonomous moderation AI rules and flags for this server.")
    .setColor(config.enabled ? "#00FF00" : "#FF0000")
    .addFields(
      { name: "Master Switch", value: config.enabled ? "✅ **ON**" : "❌ **OFF**", inline: false },
      { name: "Spam Filter", value: config.spam ? "✅ Enabled" : "❌ Disabled", inline: true },
      { name: "Raid Protection", value: config.raid ? "✅ Enabled" : "❌ Disabled", inline: true },
      { name: "Toxicity Filter", value: config.toxicity ? "✅ Enabled" : "❌ Disabled", inline: true },
      { 
        name: "Current Limits (Per 10s)", 
        value: `✉️ Messages: **${config.limits.messageSpam}**\n🗑️ Ch. Deletes: **${config.limits.channelDelete}**\n✏️ Nicknames: **${config.limits.nicknameChange}**\n🗑️ Msg Deletes: **${config.limits.messageDelete}**`, 
        inline: false 
      }
    )
    .setFooter({ text: "Changes take effect immediately." })
    .setTimestamp();

  const toggleButtonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("automod_toggle_master")
      .setLabel(config.enabled ? "Disable AutoMod" : "Enable AutoMod")
      .setStyle(config.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("automod_edit_limits")
      .setLabel("Edit Limits")
      .setStyle(ButtonStyle.Secondary)
  );

  const featureSelectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("automod_feature_select")
      .setPlaceholder("Toggle individual features...")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel("Toggle Spam Filter")
          .setDescription("Prevents sending too many messages fast")
          .setValue("toggle_spam")
          .setEmoji(config.spam ? "✅" : "❌"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Toggle Raid Protection")
          .setDescription("Prevents rapid channel/nickname changes")
          .setValue("toggle_raid")
          .setEmoji(config.raid ? "✅" : "❌"),
        new StringSelectMenuOptionBuilder()
          .setLabel("Toggle Toxicity Filter")
          .setDescription("AI detection for slurs and heavy toxicity")
          .setValue("toggle_toxicity")
          .setEmoji(config.toxicity ? "✅" : "❌")
      )
  );

  return { embeds: [embed], components: [toggleButtonRow, featureSelectRow] };
}

export default {
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure the autonomous AI Moderation system")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (interaction.guild && interaction.user.id !== interaction.guild.ownerId) {
      return interaction.reply({
        content: "❌ Only the server owner can configure AutoMod.",
        ephemeral: true
      });
    }

    const dashboard = generateAutomodDashboard();
    await interaction.reply({
      ...dashboard,
      ephemeral: true
    });
  }
};

export async function handleAutomodInteraction(interaction) {
  if (interaction.guild && interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({
      content: "❌ Only the server owner can modify AutoMod settings.",
      ephemeral: true
    });
  }

  const currentConfig = loadConfig();
  let newConfig = { ...currentConfig };

  if (interaction.isButton() && interaction.customId === "automod_toggle_master") {
    newConfig = updateConfig({ enabled: !currentConfig.enabled });
  } else if (interaction.isButton() && interaction.customId === "automod_edit_limits") {
    const modal = new ModalBuilder()
      .setCustomId('automod_limits_modal')
      .setTitle('Edit AutoMod Limits (Per 10s)');

    const msgInput = new TextInputBuilder()
      .setCustomId('limit_msg')
      .setLabel('Max messages per 10s')
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.messageSpam.toString())
      .setRequired(true);

    const chDelInput = new TextInputBuilder()
      .setCustomId('limit_chdel')
      .setLabel('Max channels deleted per 10s')
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.channelDelete.toString())
      .setRequired(true);

    const nickInput = new TextInputBuilder()
      .setCustomId('limit_nick')
      .setLabel('Max nickname changes per 10s')
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.nicknameChange.toString())
      .setRequired(true);

    const msgDelInput = new TextInputBuilder()
      .setCustomId('limit_msgdel')
      .setLabel('Max messages deleted per 10s')
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.messageDelete.toString())
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(msgInput),
      new ActionRowBuilder().addComponents(chDelInput),
      new ActionRowBuilder().addComponents(nickInput),
      new ActionRowBuilder().addComponents(msgDelInput)
    );

    return await interaction.showModal(modal);
  } else if (interaction.isModalSubmit() && interaction.customId === "automod_limits_modal") {
    const msg = parseInt(interaction.fields.getTextInputValue('limit_msg')) || 5;
    const chDel = parseInt(interaction.fields.getTextInputValue('limit_chdel')) || 2;
    const nick = parseInt(interaction.fields.getTextInputValue('limit_nick')) || 3;
    const msgDel = parseInt(interaction.fields.getTextInputValue('limit_msgdel')) || 3;
    
    newConfig = updateConfig({
      limits: {
        messageSpam: msg,
        channelDelete: chDel,
        nicknameChange: nick,
        messageDelete: msgDel
      }
    });
  } else if (interaction.isStringSelectMenu() && interaction.customId === "automod_feature_select") {
    const selected = interaction.values[0];
    if (selected === "toggle_spam") newConfig = updateConfig({ spam: !currentConfig.spam });
    if (selected === "toggle_raid") newConfig = updateConfig({ raid: !currentConfig.raid });
    if (selected === "toggle_toxicity") newConfig = updateConfig({ toxicity: !currentConfig.toxicity });
  }

  const updatedDashboard = generateAutomodDashboard();
  await interaction.update({
    ...updatedDashboard
  });
}
