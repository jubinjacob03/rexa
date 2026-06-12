import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} from "discord.js";
import { eReply, addFooter, EMBED_COLOR } from "./embed.js";
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

/**
 * Appends the embed body (title + description) to a container. Shared by the
 * live builder preview and the final published payload so both render
 * identically.
 * @param {import('discord.js').ContainerBuilder} container
 * @param {object} config
 * @param {boolean} withPlaceholder - Show a hint when there is no content yet.
 */
function appendEmbedBody(container, config, withPlaceholder = false) {
  let bodyText = "";
  if (config.title) bodyText += `### ${config.title}\n`;
  if (config.description) bodyText += config.description;
  bodyText = bodyText.trim();

  if (bodyText) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(bodyText),
    );
  } else if (withPlaceholder) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "-# *ɴᴏᴛʜɪɴɢ ʜᴇʀᴇ ʏᴇᴛ — ᴜsᴇ **ᴇᴅɪᴛ ᴄᴏɴᴛᴇɴᴛ** ᴛᴏ ʙᴇɢɪɴ.*",
      ),
    );
  }
}

/**
 * Builds the final publishable payload — always carries the default Shantha footer.
 * @param {object} config
 * @returns {Promise<object>}
 */
export async function getPreviewPayload(config) {
  const container = new ContainerBuilder().setAccentColor(config.color);
  appendEmbedBody(container, config);
  addFooter(container);

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

  const hexColor = `#${config.color.toString(16).padStart(6, "0")}`;

  const header = new ContainerBuilder().setAccentColor(config.color);
  header.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${icon("EDITOR")} ᴇᴍʙᴇᴅ ʙᴜɪʟᴅᴇʀ`),
  );
  header.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small),
  );
  header.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${icon("PUBLISH")} **ᴘᴜʙʟɪsʜᴇs ᴛᴏ** <#${config.targetChannelId}>`,
    ),
  );
  header.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(false)
      .setSpacing(SeparatorSpacingSize.Small),
  );
  header.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${icon("PALETTE")} **ᴀᴄᴄᴇɴᴛ ᴄᴏʟᴏʀ** \`${hexColor}\``,
    ),
  );

  const preview = new ContainerBuilder().setAccentColor(config.color);
  preview.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("-# ʟɪᴠᴇ ᴘʀᴇᴠɪᴇᴡ"),
  );
  preview.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Large),
  );
  appendEmbedBody(preview, config, true);
  addFooter(preview);

  const panel = new ContainerBuilder().setAccentColor(config.color);
  panel.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ebld_edit_text")
        .setLabel("ᴇᴅɪᴛ ᴄᴏɴᴛᴇɴᴛ")
        .setEmoji(icon("MEMO"))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ebld_edit_color")
        .setLabel("sᴇᴛ ᴄᴏʟᴏʀ")
        .setEmoji(icon("PALETTE"))
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  panel.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Large),
  );
  panel.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ebld_publish")
        .setLabel("ᴘᴜʙʟɪsʜ")
        .setEmoji(icon("PUBLISH"))
        .setStyle(ButtonStyle.Success)
        .setDisabled(!config.title && !config.description),
      new ButtonBuilder()
        .setCustomId("ebld_cancel")
        .setLabel("ᴅɪsᴄᴀʀᴅ")
        .setStyle(ButtonStyle.Danger),
    ),
  );

  const payload = {
    components: [header, preview, panel],
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

/**
 * Builds a simple ephemeral V2 status card (used for publish / discard results).
 * @param {string} title
 * @param {string} description
 * @returns {object}
 */
function statusCard(title, description) {
  const container = new ContainerBuilder().setAccentColor(EMBED_COLOR);
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}\n${description}`),
  );
  return {
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  };
}

export async function handleEmbedBuilderInteraction(interaction) {
  const userId = interaction.user.id;
  const config = embedSessions.get(userId);
  if (!config) {
    return interaction.reply(
      eReply("Notice", "No active embed builder session found."),
    );
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
        new ActionRowBuilder().addComponents(descInput),
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
        .setValue(`#${config.color.toString(16).padStart(6, "0")}`);

      modal.addComponents(new ActionRowBuilder().addComponents(colorInput));

      await interaction.showModal(modal);
      return;
    }

    if (interaction.customId === "ebld_publish") {
      const targetChannel = await interaction.guild.channels
        .fetch(config.targetChannelId)
        .catch(() => null);
      if (!targetChannel) {
        return interaction.reply(
          eReply("Error", "Target channel no longer exists."),
        );
      }

      const finalPayload = await getPreviewPayload(config);
      await targetChannel.send(finalPayload);
      embedSessions.delete(userId);

      await interaction.update(
        statusCard(
          `${icon("SUCCESS")} ᴘᴜʙʟɪsʜᴇᴅ`,
          `Your embed has been published to <#${config.targetChannelId}>.`,
        ),
      );
      return;
    }

    if (interaction.customId === "ebld_cancel") {
      embedSessions.delete(userId);
      await interaction.update(
        statusCard(
          `${icon("WARNING")} ᴅɪsᴄᴀʀᴅᴇᴅ`,
          "Embed builder session was discarded.",
        ),
      );
      return;
    }
  }

  if (interaction.isModalSubmit()) {
    if (interaction.customId === "ebld_modal_text") {
      config.title = interaction.fields.getTextInputValue("title_input") || "";
      config.description =
        interaction.fields.getTextInputValue("desc_input") || "";
      await renderEmbedDashboard(interaction, true);
      return;
    }

    if (interaction.customId === "ebld_modal_color") {
      let hex = (
        interaction.fields.getTextInputValue("color_input") || ""
      ).trim();
      if (hex.startsWith("#")) hex = hex.substring(1);
      const colorInt = parseInt(hex, 16);
      if (!isNaN(colorInt) && colorInt >= 0 && colorInt <= 0xffffff) {
        config.color = colorInt;
      }
      await renderEmbedDashboard(interaction, true);
      return;
    }
  }
}
