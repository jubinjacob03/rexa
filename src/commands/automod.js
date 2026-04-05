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
  MessageFlags,
} from "discord.js";
import { loadConfig, updateConfig } from "../utils/automodManager.js";
import { EMBED_COLOR, eReply } from "../utils/embed.js";
import { i, icon } from "../utils/icons.js";

export async function generateAutomodDashboard(guild = null) {
  const config = await loadConfig();
  const on = config.enabled;

  const embed = new EmbedBuilder()
    .setTitle(`ᴀᴜᴛᴏᴍᴏᴅ — ${on ? `${i("SUCCESS")}` : `${i("ERROR")}`}`)
    .setDescription(
      `**ʀᴀᴛᴇ ʟɪᴍɪᴛs • ᴘᴇʀ 10s**\n${icon("LABEL")} ᴍsɢ **${config.limits.messageSpam}** • ${icon("CHANNELS")} ᴄʜ. ᴅᴇʟ **${config.limits.channelDelete}** • ${icon("MEMBERS")} ɴɪᴄᴋ **${config.limits.nicknameChange}** • ${icon("PURGE")} ᴍsɢ ᴅᴇʟ **${config.limits.messageDelete}**`,
    )
    .setColor(EMBED_COLOR)
    .setTimestamp();

  if (guild?.iconURL()) {
    embed.setThumbnail(guild.iconURL({ size: 256, dynamic: true }));
  }

  // Row 1: feature toggle buttons
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("automod_toggle_spam")
      .setLabel(`sᴘᴀᴍ ғɪʟᴛᴇʀ — ${config.spam ? "ᴏɴ" : "ᴏғғ"}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("automod_toggle_raid")
      .setLabel(`ʀᴀɪᴅ ᴘʀᴏᴛᴇᴄᴛɪᴏɴ — ${config.raid ? "ᴏɴ" : "ᴏғғ"}`)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("automod_toggle_toxicity")
      .setLabel(`ᴛᴏxɪᴄɪᴛʏ ғɪʟᴛᴇʀ — ${config.toxicity ? "ᴏɴ" : "ᴏғғ"}`)
      .setStyle(ButtonStyle.Secondary),
  );

  // Row 2: master toggle + edit limits
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("automod_toggle_master")
      .setLabel(on ? "ᴅɪsᴀʙʟᴇ ᴀᴜᴛᴏᴍᴏᴅ" : "ᴇɴᴀʙʟᴇ ᴀᴜᴛᴏᴍᴏᴅ")
      .setStyle(on ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("automod_edit_limits")
      .setLabel("ᴇᴅɪᴛ ʟɪᴍɪᴛs")
      .setStyle(ButtonStyle.Primary),
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
      return interaction.reply(
        eReply(
          `${i("ERROR")} ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ`,
          "ᴏɴʟʏ ᴛʜᴇ sᴇʀᴠᴇʀ ᴏᴡɴᴇʀ ᴄᴀɴ ᴄᴏɴғɪɢᴜʀᴇ ᴀᴜᴛᴏᴍᴏᴅ.",
        ),
      );
    }

    const dashboard = await generateAutomodDashboard(interaction.guild);
    await interaction.reply({
      ...dashboard,
      flags: MessageFlags.Ephemeral,
    });
  },
};

export async function handleAutomodInteraction(interaction) {
  if (interaction.guild && interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply(
      eReply(
        `${i("ERROR")} ᴀᴄᴄᴇss ᴅᴇɴɪᴇᴅ`,
        "ᴏɴʟʏ ᴛʜᴇ sᴇʀᴠᴇʀ ᴏᴡɴᴇʀ ᴄᴀɴ ᴍᴏᴅɪғʏ ᴀᴜᴛᴏᴍᴏᴅ ᴄᴏɴғɪɢᴜʀᴀᴛɪᴏɴs.",
      ),
    );
  }

  const currentConfig = await loadConfig();
  let newConfig = { ...currentConfig };

  if (
    interaction.isButton() &&
    interaction.customId === "automod_toggle_master"
  ) {
    newConfig = await updateConfig({ enabled: !currentConfig.enabled });
  } else if (
    interaction.isButton() &&
    interaction.customId === "automod_edit_limits"
  ) {
    const modal = new ModalBuilder()
      .setCustomId("automod_limits_modal")
      .setTitle("ʀᴀᴛᴇ ʟɪᴍɪᴛs (ᴘᴇʀ 10s)");

    const msgInput = new TextInputBuilder()
      .setCustomId("limit_msg")
      .setLabel("ᴍᴀx ᴍᴇssᴀɢᴇs")
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.messageSpam.toString())
      .setRequired(true);

    const chDelInput = new TextInputBuilder()
      .setCustomId("limit_chdel")
      .setLabel("ᴍᴀx ᴄʜᴀɴɴᴇʟ ᴅᴇʟᴇᴛᴇs")
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.channelDelete.toString())
      .setRequired(true);

    const nickInput = new TextInputBuilder()
      .setCustomId("limit_nick")
      .setLabel("ᴍᴀx ɴɪᴄᴋɴᴀᴍᴇ ᴄʜᴀɴɢᴇs")
      .setStyle(TextInputStyle.Short)
      .setValue(currentConfig.limits.nicknameChange.toString())
      .setRequired(true);

    const msgDelInput = new TextInputBuilder()
      .setCustomId("limit_msgdel")
      .setLabel("ᴍᴀx ᴍᴇssᴀɢᴇ ᴅᴇʟᴇᴛᴇs")
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
    newConfig = await updateConfig({ spam: !currentConfig.spam });
  } else if (
    interaction.isButton() &&
    interaction.customId === "automod_toggle_raid"
  ) {
    newConfig = await updateConfig({ raid: !currentConfig.raid });
  } else if (
    interaction.isButton() &&
    interaction.customId === "automod_toggle_toxicity"
  ) {
    newConfig = await updateConfig({ toxicity: !currentConfig.toxicity });
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

    newConfig = await updateConfig({
      limits: {
        messageSpam: msg,
        channelDelete: chDel,
        nicknameChange: nick,
        messageDelete: msgDel,
      },
    });
  }

  const updatedDashboard = await generateAutomodDashboard(interaction.guild);
  await interaction.update({
    ...updatedDashboard,
  });
}
