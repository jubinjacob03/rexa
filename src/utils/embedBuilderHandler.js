import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SectionBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from "discord.js";
import { eReply } from "./embed.js";
import { icon } from "./icons.js";

export const embedSessions = new Map();

setInterval(
  () => {
    const now = Date.now();
    for (const [userId, session] of embedSessions.entries()) {
      if (now - session.timestamp > 30 * 60 * 1000) {
        embedSessions.delete(userId);
      }
    }
  },
  30 * 60 * 1000,
);

export async function getPreviewPayload(config) {
  const container = new ContainerBuilder().setAccentColor(config.color);
  
  let bodyText = "";
  if (config.title) bodyText += `### ${config.title}\n`;
  if (config.description) bodyText += `${config.description}`;

  if (bodyText) {
    if (config.thumbnailUrl) {
      const section = new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(bodyText)
        )
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(config.thumbnailUrl));
      container.addSectionComponents(section);
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(bodyText)
      );
    }
  }

  if (config.fields && config.fields.length > 0) {
    if (bodyText) {
      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small)
      );
    }
    const fieldLines = config.fields
      .map((f) => `**${f.name}**\n${f.value}`)
      .join("\n\n");
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(fieldLines)
    );
  }

  if (config.footerText) {
    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    );
    const ts = Math.floor(Date.now() / 1000);
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${config.footerText} · <t:${ts}:f>`)
    );
  } else {
    const ts = Math.floor(Date.now() / 1000);
    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    );
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Shantha · <t:${ts}:f>`)
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  };
}

export async function renderEmbedDashboard(interaction, isUpdate = false) {
  const config = embedSessions.get(interaction.user.id);
  if (!config) {
    return interaction.reply(eReply("Error", "No active session found."));
  }

  const container = new ContainerBuilder().setAccentColor(config.color);
  
  const summaryText = `## 🛠️ ᴇᴍʙᴇᴅ ʙᴜɪʟᴅᴇʀ\nᴄᴏɴғɪɢᴜʀᴇ ʏᴏᴜʀ ᴠ2 ᴄᴀʀᴅ. ɪᴛ ᴡɪʟʟ ʙᴇ sᴇɴᴛ ᴛᴏ <#${config.targetChannelId}>.\n\n` +
    `• **ᴛɪᴛʟᴇ:** ${config.title ? `\`${config.title}\`` : "*ɴᴏɴᴇ*"}\n` +
    `• **ᴅᴇsᴄʀɪᴘᴛɪᴏɴ:** ${config.description ? `\`${config.description.length > 80 ? config.description.substring(0, 80) + "..." : config.description}\`` : "*ɴᴏɴᴇ*"}\n` +
    `• **ᴀᴄᴄᴇɴᴛ ᴄᴏʟᴏʀ:** \`#${config.color.toString(16).padStart(6, "0")}\`\n` +
    `• **ᴛʜᴜᴍʙɴᴀɪʟ:** ${config.thumbnailUrl ? `\`${config.thumbnailUrl}\`` : "*ɴᴏɴᴇ*"}\n` +
    `• **ғᴏᴏᴛᴇʀ:** ${config.footerText ? `\`${config.footerText}\`` : "*ɴᴏɴᴇ*"}\n` +
    `• **ғɪᴇʟᴅs:** ${config.fields.length}/5 ғɪᴇʟᴅs`;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(summaryText)
  );

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ebld_edit_text")
      .setLabel("ᴇᴅɪᴛ ᴄᴏɴᴛᴇɴᴛ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ebld_edit_media")
      .setLabel("ᴇᴅɪᴛ ᴍᴇᴅɪᴀ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ebld_edit_color")
      .setLabel("sᴇᴛ ᴄᴏʟᴏʀ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ebld_add_field")
      .setLabel("ᴀᴅᴅ ғɪᴇʟᴅ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(config.fields.length >= 5),
    new ButtonBuilder()
      .setCustomId("ebld_clear_fields")
      .setLabel("ᴄʟᴇᴀʀ ғɪᴇʟᴅs")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(config.fields.length === 0)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ebld_preview")
      .setLabel("ᴘʀᴇᴠɪᴇᴡ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ebld_publish")
      .setLabel(`ᴘᴜʙʟɪsʜ ᴛᴏ #${config.targetChannelName}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(!config.title && !config.description && config.fields.length === 0),
    new ButtonBuilder()
      .setCustomId("ebld_cancel")
      .setLabel("ᴅɪsᴄᴀʀᴅ")
      .setStyle(ButtonStyle.Danger)
  );

  container.addActionRowComponents(row1);
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  );
  container.addActionRowComponents(row2);

  const ts = Math.floor(Date.now() / 1000);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# Shantha · <t:${ts}:f>`)
  );

  const payload = {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };

  if (isUpdate) {
    try {
      await interaction.update(payload);
    } catch {
      await interaction.editReply(payload);
    }
  } else {
    await interaction.reply(payload);
  }
}

export async function handleEmbedBuilderInteraction(interaction) {
  const userId = interaction.user.id;
  const config = embedSessions.get(userId);
  if (!config) {
    return interaction.reply({
      content: "No active embed builder session found.",
      ephemeral: true,
    });
  }

  config.timestamp = Date.now();

  if (interaction.isButton()) {
    if (interaction.customId === "ebld_edit_text") {
      const modal = new ModalBuilder()
        .setCustomId("ebld_modal_text")
        .setTitle("Edit Embed Content");

      const titleInput = new TextInputBuilder()
        .setCustomId("title_input")
        .setLabel("Title")
        .setPlaceholder("Enter title...")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(config.title || "");

      const descInput = new TextInputBuilder()
        .setCustomId("desc_input")
        .setLabel("Description")
        .setPlaceholder("Enter description...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setValue(config.description || "");

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "ebld_edit_media") {
      const modal = new ModalBuilder()
        .setCustomId("ebld_modal_media")
        .setTitle("Edit Thumbnail & Footer");

      const thumbInput = new TextInputBuilder()
        .setCustomId("thumb_input")
        .setLabel("Thumbnail URL")
        .setPlaceholder("https://example.com/image.png")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(config.thumbnailUrl || "");

      const footerInput = new TextInputBuilder()
        .setCustomId("footer_input")
        .setLabel("Footer Text")
        .setPlaceholder("Enter footer text...")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(config.footerText || "");

      modal.addComponents(
        new ActionRowBuilder().addComponents(thumbInput),
        new ActionRowBuilder().addComponents(footerInput)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "ebld_edit_color") {
      const modal = new ModalBuilder()
        .setCustomId("ebld_modal_color")
        .setTitle("Set Accent Color");

      const colorInput = new TextInputBuilder()
        .setCustomId("color_input")
        .setLabel("Color Hex (e.g. #00ddff)")
        .setPlaceholder("#00ddff")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(config.color ? `#${config.color.toString(16).padStart(6, "0")}` : "#00ddff");

      modal.addComponents(new ActionRowBuilder().addComponents(colorInput));

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "ebld_add_field") {
      const modal = new ModalBuilder()
        .setCustomId("ebld_modal_add_field")
        .setTitle("Add Embed Field");

      const fieldName = new TextInputBuilder()
        .setCustomId("field_name")
        .setLabel("Field Name")
        .setPlaceholder("e.g. Info")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const fieldValue = new TextInputBuilder()
        .setCustomId("field_value")
        .setLabel("Field Value")
        .setPlaceholder("e.g. Details go here...")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(fieldName),
        new ActionRowBuilder().addComponents(fieldValue)
      );

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "ebld_clear_fields") {
      config.fields = [];
      await renderEmbedDashboard(interaction, true);
      return;
    }

    if (interaction.customId === "ebld_preview") {
      const previewPayload = await getPreviewPayload(config);
      await interaction.reply(previewPayload);
      return;
    }

    if (interaction.customId === "ebld_publish") {
      const targetChannel = await interaction.guild.channels.fetch(config.targetChannelId).catch(() => null);
      if (!targetChannel) {
        return interaction.reply({
          content: "Target channel no longer exists.",
          ephemeral: true,
        });
      }

      const finalPayload = await getPreviewPayload(config);
      delete finalPayload.flags;
      finalPayload.flags = MessageFlags.IsComponentsV2;

      await targetChannel.send(finalPayload);
      embedSessions.delete(userId);

      await interaction.update({
        components: [],
        content: `## ${icon("SUCCESS")} ᴘᴜʙʟɪsʜᴇᴅ\nYour custom embed has been published to <#${config.targetChannelId}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (interaction.customId === "ebld_cancel") {
      embedSessions.delete(userId);
      await interaction.update({
        components: [],
        content: `## ${icon("WARNING")} ᴅɪsᴄᴀʀᴅᴇᴅ\nEmbed builder session was discarded.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ebld_modal_text") {
      config.title = interaction.fields.getTextInputValue("title_input") || "";
      config.description = interaction.fields.getTextInputValue("desc_input") || "";
      await renderEmbedDashboard(interaction, true);
      return;
    }

    if (interaction.customId === "ebld_modal_media") {
      config.thumbnailUrl = interaction.fields.getTextInputValue("thumb_input") || "";
      config.footerText = interaction.fields.getTextInputValue("footer_input") || "";
      await renderEmbedDashboard(interaction, true);
      return;
    }

    if (interaction.customId === "ebld_modal_color") {
      let hex = (interaction.fields.getTextInputValue("color_input") || "").trim();
      if (hex.startsWith("#")) hex = hex.substring(1);
      const colorInt = parseInt(hex, 16);
      if (!isNaN(colorInt) && colorInt >= 0 && colorInt <= 0xffffff) {
        config.color = colorInt;
      }
      await renderEmbedDashboard(interaction, true);
      return;
    }

    if (interaction.customId === "ebld_modal_add_field") {
      const name = interaction.fields.getTextInputValue("field_name") || "";
      const value = interaction.fields.getTextInputValue("field_value") || "";
      if (name && value) {
        config.fields.push({ name, value });
      }
      await renderEmbedDashboard(interaction, true);
      return;
    }
  }
}
