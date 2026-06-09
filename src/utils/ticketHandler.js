import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  AttachmentBuilder,
  PermissionsBitField,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
} from "discord.js";
import supabase from "./supabaseClient.js";
import config from "../../config.js";
import {
  setupSessions,
  renderTicketDashboard,
} from "../commands/ticket-setup.js";
import { eReply, eSend, EMBED_COLOR, addFooter } from "./embed.js";
import { i, icon } from "./icons.js";
import { createLogger } from "./logger.js";
import { swallow } from "./resilience.js";

const log = createLogger("tickets");

const activeTickets = new Set();

/** User IDs with a ticket creation currently in flight, used as a synchronous
 * single-flight lock so a double-click cannot create two tickets. */
const ticketCreationInProgress = new Set();

/**
 * Handles ticket-related interactions (buttons, modals).
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @returns {Promise<void>}
 */
export async function handleTicketInteraction(interaction) {
  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("tkt_modal_reason")
  ) {
    const reason = interaction.fields.getTextInputValue("reasonInput");
    await createTicketInstance(interaction, {
      ticketType: "text",
      aiEnabled: true,
      reason,
    });
    return;
  }

  if (interaction.customId === "tkt_open_simple") {
    const modal = new ModalBuilder()
      .setCustomId("tkt_modal_reason")
      .setTitle("Create Ticket");

    const reasonInput = new TextInputBuilder()
      .setCustomId("reasonInput")
      .setLabel("Type A Valid Reason")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Reason")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId.startsWith("tsetup_")) {
    const session = setupSessions.get(interaction.user.id);
    if (!session) {
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply(
          eReply(
            `${i("ERROR")} sᴇssɪᴏɴ ᴇxᴘɪʀᴇᴅ`,
            "ᴘʟᴇᴀsᴇ ʀᴜɴ `/setup-ticket` ᴀɢᴀɪɴ.",
          ),
        );
      }
      return;
    }

    if (interaction.customId === "tsetup_edit_embed") {
      const modal = new ModalBuilder()
        .setCustomId("tsetup_modal_embed")
        .setTitle("ᴇᴅɪᴛ ᴛɪᴄᴋᴇᴛ ᴇᴍʙᴇᴅ");

      const titleInput = new TextInputBuilder()
        .setCustomId("titleInput")
        .setLabel("ᴇᴍʙᴇᴅ ᴛɪᴛʟᴇ")
        .setStyle(TextInputStyle.Short)
        .setValue(session.title)
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId("descInput")
        .setLabel("ᴇᴍʙᴇᴅ ᴅᴇsᴄʀɪᴘᴛɪᴏɴ")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(session.description)
        .setRequired(true);

      const currentMods = session.ticketMods || [];
      const modsInput = new TextInputBuilder()
        .setCustomId("modsInput")
        .setLabel("ᴍᴏᴅ ɪᴅs (ᴄᴏᴍᴍᴀ sᴇᴘ.)")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(currentMods.join(", "))
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(modsInput),
      );

      return await interaction.showModal(modal);
    }

    if (
      interaction.customId === "tsetup_add_text_tkt" ||
      interaction.customId === "tsetup_add_vc_tkt"
    ) {
      const isVc = interaction.customId === "tsetup_add_vc_tkt";
      const modal = new ModalBuilder()
        .setCustomId(isVc ? "tsetup_modal_tkt_vc" : "tsetup_modal_tkt_txt")
        .setTitle(`${isVc ? "ᴠᴏɪᴄᴇ" : "ᴛᴇxᴛ"} ᴛɪᴄᴋᴇᴛ`);

      const labelInput = new TextInputBuilder()
        .setCustomId("labelBtn")
        .setLabel("ʙᴜᴛᴛᴏɴ ʟᴀʙᴇʟ")
        .setStyle(TextInputStyle.Short)
        .setValue(`\u200B\u2009ᴏᴘᴇɴ ᴛɪᴄᴋᴇᴛ`)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(labelInput));

      if (!isVc) {
        const aiInput = new TextInputBuilder()
          .setCustomId("aiInput")
          .setLabel("ᴀɪ ᴀssɪsᴛᴀɴᴄᴇ? (true/false)")
          .setStyle(TextInputStyle.Short)
          .setValue("true")
          .setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(aiInput));
      }

      return await interaction.showModal(modal);
    }

    if (interaction.customId === "tsetup_add_text") {
      const modal = new ModalBuilder()
        .setCustomId("tsetup_modal_txt")
        .setTitle("ᴛᴇxᴛ ʀᴇᴘʟʏ");
      const labelInput = new TextInputBuilder()
        .setCustomId("labelBtn")
        .setLabel("ʙᴜᴛᴛᴏɴ ʟᴀʙᴇʟ")
        .setStyle(TextInputStyle.Short)
        .setValue("ᴛɪᴛʟᴇ ᴏғ ᴛʜɪs ʙᴜᴛᴛᴏɴ")
        .setRequired(true);
      const contentInput = new TextInputBuilder()
        .setCustomId("contentInput")
        .setLabel("ᴡʜᴀᴛ ᴛᴇxᴛ sʜᴏᴜʟᴅ ᴛʜɪs sʜᴏᴡ ᴡʜᴇɴ ᴄʟɪᴄᴋᴇᴅ?")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(labelInput),
        new ActionRowBuilder().addComponents(contentInput),
      );
      return await interaction.showModal(modal);
    }

    if (interaction.customId === "tsetup_add_image") {
      const modal = new ModalBuilder()
        .setCustomId("tsetup_modal_img")
        .setTitle("ɪᴍᴀɢᴇ ʀᴇᴘʟʏ");
      const labelInput = new TextInputBuilder()
        .setCustomId("labelBtn")
        .setLabel("ʙᴜᴛᴛᴏɴ ʟᴀʙᴇʟ")
        .setStyle(TextInputStyle.Short)
        .setValue(`\u200B\u2009ᴘᴀʏᴍᴇɴᴛ`)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(labelInput));
      return await interaction.showModal(modal);
    }

    if (interaction.customId === "tsetup_clear_buttons") {
      session.buttons = [];
      return await renderTicketDashboard(interaction, true);
    }

    if (interaction.customId === "tsetup_preview") {
      const previewContainer = new ContainerBuilder()
        .setAccentColor(session.color)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `${icon("EDITOR")} **ᴘʀᴇᴠɪᴇᴡ** — ᴛʜɪs ɪs ʜᴏᴡ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ ᴘᴀɴᴇʟ ᴡɪʟʟ ʟᴏᴏᴋ.`,
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small),
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${session.title}\n${session.description}`,
          ),
        );

      if (session.buttons.length > 0) {
        const previewRow = new ActionRowBuilder().addComponents(
          session.buttons.map((btn) =>
            new ButtonBuilder()
              .setCustomId(`preview_${btn.label}`)
              .setLabel(btn.label)
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
          ),
        );
        previewContainer.addActionRowComponents(previewRow);
      }

      return await interaction.reply({
        components: [previewContainer],
        flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      });
    }

    if (interaction.customId === "tsetup_publish") {
      const targetChannel = await interaction.guild.channels
        .fetch(session.targetChannelId)
        .catch(() => null);
      if (!targetChannel) {
        return await interaction.update({
          content: `${icon("ERROR")} **ᴇʀʀᴏʀ:** ᴛᴀʀɢᴇᴛ ᴄʜᴀɴɴᴇʟ ɴᴏ ʟᴏɴɢᴇʀ ᴇxɪsᴛs ᴏʀ ʙᴏᴛ ʟᴀᴄᴋs ᴀᴄᴄᴇss.`,
          embeds: [],
          components: [],
        });
      }

      const row = new ActionRowBuilder();

      global.customActions = global.customActions || new Map();

      for (const btn of session.buttons) {
        if (btn.type === "ticket") {
          const aiFlag = btn.aiAssist ? "1" : "0";
          const statelessCustomId = `tkt_open|${btn.ticketType}|${aiFlag}`;
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(statelessCustomId)
              .setLabel(btn.label)
              .setStyle(ButtonStyle.Secondary),
          );
        } else {
          const actionKey = Math.random().toString(36).substr(2, 9);

          global.customActions.set(actionKey, {
            type: btn.type,
            content: btn.content,
          });

          if (supabase) {
            try {
              await supabase.from("ticket_actions").insert({
                action_id: actionKey,
                type: btn.type,
                content: btn.content,
              });
            } catch (err) {
              log.error("[SUPABASE] Error saving custom action:", err);
            }
          }

          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`tkt_action|${actionKey}`)
              .setLabel(btn.label)
              .setStyle(ButtonStyle.Secondary),
          );
        }
      }

      const panelContainer = new ContainerBuilder()
        .setAccentColor(session.color)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${session.title}\n${session.description}`,
          ),
        )
        .addSeparatorComponents(
          new SeparatorBuilder()
            .setDivider(true)
            .setSpacing(SeparatorSpacingSize.Small),
        )
        .addActionRowComponents(row);

      await targetChannel.send({
        components: [panelContainer],
        flags: MessageFlags.IsComponentsV2,
      });
      setupSessions.delete(interaction.user.id);

      return await interaction.update({
        content: `${i("DONE")} **ᴛɪᴄᴋᴇᴛ ᴘᴀɴᴇʟ ᴘᴜʙʟɪsʜᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ ᴛᴏ <#${session.targetChannelId}>.**`,
        embeds: [],
        components: [],
      });
    }
  }

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("tsetup_modal_")
  ) {
    const session = setupSessions.get(interaction.user.id);
    if (!session) {
      if (!interaction.replied && !interaction.deferred) {
        return await interaction.reply(
          eReply(
            `${i("ERROR")} sᴇssɪᴏɴ ᴇxᴘɪʀᴇᴅ`,
            "ᴛʜᴇ ʙᴏᴛ ʀᴇsᴛᴀʀᴛᴇᴅ. ᴘʟᴇᴀsᴇ ʀᴜɴ `/setup-ticket` ᴀɢᴀɪɴ.",
          ),
        );
      }
      return;
    }

    if (interaction.customId === "tsetup_modal_embed") {
      session.title = interaction.fields.getTextInputValue("titleInput");
      session.description = interaction.fields.getTextInputValue("descInput");
      const modsRaw = interaction.fields.getTextInputValue("modsInput");
      const parsedIds = modsRaw
        .split(/[\s,]+/)
        .map((id) => id.replace(/[<@!>]/g, "").trim())
        .filter((id) => /^\d+$/.test(id));
      session.ticketMods = parsedIds;
      if (supabase && parsedIds.length > 0) {
        try {
          await supabase.from("ticket_actions").upsert(
            {
              action_id: "ticket_mods_config",
              type: "config",
              content: JSON.stringify(parsedIds),
            },
            { onConflict: "action_id" },
          );
        } catch (err) {
          log.error("[SUPABASE] Error saving ticket mods:", err);
        }
      }
    } else if (
      interaction.customId === "tsetup_modal_tkt_txt" ||
      interaction.customId === "tsetup_modal_tkt_vc"
    ) {
      const isVc = interaction.customId === "tsetup_modal_tkt_vc";
      session.buttons.push({
        type: "ticket",
        label: interaction.fields.getTextInputValue("labelBtn"),
        ticketType: isVc ? "vc" : "text",
        aiAssist: isVc
          ? false
          : interaction.fields.getTextInputValue("aiInput").toLowerCase() ===
            "true",
      });
    } else if (interaction.customId === "tsetup_modal_txt") {
      session.buttons.push({
        type: "text",
        label: interaction.fields.getTextInputValue("labelBtn"),
        content: interaction.fields.getTextInputValue("contentInput"),
      });
    } else if (interaction.customId === "tsetup_modal_img") {
      const label = interaction.fields.getTextInputValue("labelBtn");

      await interaction.deferUpdate();

      const waitingMsg = await interaction.followUp(
        eReply(
          `${i("PENDING")} ᴡᴀɪᴛɪɴɢ ғᴏʀ ɪᴍᴀɢᴇ`,
          `ᴘʟᴇᴀsᴇ sᴇɴᴅ ᴛʜᴇ ɪᴍᴀɢᴇ ғᴏʀ ᴛʜᴇ \`${label}\` ʙᴜᴛᴛᴏɴ ɪɴ ᴛʜɪs ᴄʜᴀɴɴᴇʟ ɴᴏᴡ. (ʏᴏᴜ ʜᴀᴠᴇ 60 sᴇᴄᴏɴᴅs.)\n*ᴛʜᴇ ʙᴏᴛ ᴡɪʟʟ sᴇᴄᴜʀᴇ ᴛʜᴇ ɪᴍᴀɢᴇ ᴀɴᴅ ᴅᴇʟᴇᴛᴇ ʏᴏᴜʀ ᴍᴇssᴀɢᴇ ᴀᴜᴛᴏᴍᴀᴛɪᴄᴀʟʟʏ.*`,
        ),
      );

      const filter = (m) =>
        m.author.id === interaction.user.id && m.attachments.size > 0;
      try {
        const collected = await interaction.channel.awaitMessages({
          filter,
          max: 1,
          time: 60000,
          errors: ["time"],
        });
        const msg = collected.first();
        const attachment = msg.attachments.first();

        let finalImageUrl = attachment.url;
        const logChannelId =
          config.ticketLogsChannelId || "1489647372811243742";
        const logChannel = await interaction.client.channels
          .fetch(logChannelId)
          .catch(() => null);

        if (logChannel) {
          const sentMsg = await logChannel.send({
            content: `**Ticket Image Upload:** \`${label}\` (via <@${interaction.user.id}>)`,
            files: [
              {
                attachment: attachment.url,
                name: attachment.name || "image.png",
              },
            ],
          });
          if (sentMsg.attachments.size > 0) {
            finalImageUrl = sentMsg.attachments.first().url;
            msg.delete().catch(() => null);
          }
        }

        session.buttons.push({
          type: "image",
          label: label,
          content: finalImageUrl,
        });
        await waitingMsg.delete().catch(() => null);
        return await renderTicketDashboard(interaction, true);
      } catch {
        return interaction.editReply(
          eReply(
            `${i("ERROR")} ᴛɪᴍᴇ ᴇxᴘɪʀᴇᴅ`,
            "ʏᴏᴜ ᴅɪᴅɴ'ᴛ ᴜᴘʟᴏᴀᴅ ᴀɴ ɪᴍᴀɢᴇ ɪɴ ᴛɪᴍᴇ. ʀᴜɴ `/setup-ticket` ᴛᴏ ʀᴇsᴜᴍᴇ ᴏʀ ᴛʀʏ ᴀɢᴀɪɴ.",
          ),
        );
      }
    }
    return await renderTicketDashboard(interaction, true);
  }

  if (interaction.customId.startsWith("tkt_open|")) {
    await createTicketInstance(interaction);
  } else if (interaction.customId.startsWith("tkt_action|")) {
    const key = interaction.customId.split("|")[1];

    let actionData = null;
    if (global.customActions && global.customActions.has(key)) {
      actionData = global.customActions.get(key);
    } else if (supabase) {
      const { data } = await supabase
        .from("ticket_actions")
        .select("type, content")
        .eq("action_id", key)
        .single();
      if (data) {
        actionData = data;
        global.customActions = global.customActions || new Map();
        global.customActions.set(key, actionData);
      }
    }

    if (actionData) {
      if (actionData.type === "text") {
        await interaction.reply(eReply("Action Response", actionData.content));
      } else if (actionData.type === "image") {
        await interaction.reply(eReply("Action Response", actionData.content));
      }
    } else {
      await interaction.reply(
        eReply(
          `${i("ERROR")} ᴇxᴘɪʀᴇᴅ ᴀᴄᴛɪᴏɴ`,
          "ᴛʜɪs ᴄᴜsᴛᴏᴍ ʙᴜᴛᴛᴏɴ ʜᴀs ᴇxᴘɪʀᴇᴅ ᴏʀ ɪs ɪɴᴠᴀʟɪᴅ (ʙᴏᴛ ʀᴇsᴛᴀʀᴛᴇᴅ).",
        ),
      );
    }
  } else if (interaction.customId === "ticket_close") {
    await closeTicketThread(interaction);
  } else if (interaction.customId === "ticket_escalate") {
    await escalateTicket(interaction);
  }
}

/**
 * Creates a new ticket instance (channel or thread) for a user.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @param {Object} [options={}] - Additional options for the ticket.
 * @param {string} [options.ticketType] - The type of ticket ('text' or 'vc').
 * @param {boolean} [options.aiEnabled] - Whether AI assistance is enabled for this ticket.
 * @param {string} [options.reason] - The reason for opening the ticket.
 * @returns {Promise<void>}
 */
async function createTicketInstance(interaction, options = {}) {
  const userId = interaction.user.id;
  if (ticketCreationInProgress.has(userId)) {
    return interaction
      .reply(
        eReply(
          `${i("PENDING")} ᴘʟᴇᴀsᴇ ᴡᴀɪᴛ`,
          "ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ ɪs ᴀʟʀᴇᴀᴅʏ ʙᴇɪɴɢ ᴄʀᴇᴀᴛᴇᴅ.",
        ),
      )
      .catch(() => {});
  }
  ticketCreationInProgress.add(userId);
  try {
    return await createTicketInstanceImpl(interaction, options);
  } finally {
    ticketCreationInProgress.delete(userId);
  }
}

/**
 * Creates the ticket channel and welcome message. Always invoked through
 * {@link createTicketInstance}, which serializes concurrent requests per user.
 * @param {import('discord.js').Interaction} interaction
 * @param {Object} [options={}]
 * @returns {Promise<void>}
 */
async function createTicketInstanceImpl(interaction, options = {}) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }

  if (activeTickets.has(interaction.user.id)) {
    const guild = interaction.guild;
    const existingChannel = guild.channels.cache.find(
      (c) =>
        c.name.includes(interaction.user.username.toLowerCase()) &&
        (c.name.startsWith("ticket-") || c.name.endsWith("s-ᴛɪᴄᴋᴇᴛ")),
    );

    if (!existingChannel) {
      activeTickets.delete(interaction.user.id);
      if (supabase) {
        await supabase
          .from("active_tickets")
          .delete()
          .eq("user_id", interaction.user.id)
          .catch(() => {});
      }
    } else {
      return interaction.editReply(
        eReply(
          `${i("ERROR")} ᴀᴄᴛɪᴠᴇ ᴛɪᴄᴋᴇᴛ`,
          "ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀɴ ᴀᴄᴛɪᴠᴇ ᴛɪᴄᴋᴇᴛ.",
        ),
      );
    }
  }

  if (supabase) {
    const { data } = await supabase
      .from("active_tickets")
      .select("user_id")
      .eq("user_id", interaction.user.id)
      .single();
    if (data) {
      const guild = interaction.guild;
      const existingChannel = guild.channels.cache.find(
        (c) =>
          c.name.includes(interaction.user.username.toLowerCase()) &&
          (c.name.startsWith("ticket-") || c.name.endsWith("s-ᴛɪᴄᴋᴇᴛ")),
      );

      if (!existingChannel) {
        await supabase
          .from("active_tickets")
          .delete()
          .eq("user_id", interaction.user.id)
          .catch(() => {});
      } else {
        activeTickets.add(interaction.user.id);
        return interaction.editReply(
          eReply(
            `${i("ERROR")} ᴀᴄᴛɪᴠᴇ ᴛɪᴄᴋᴇᴛ`,
            "ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀɴ ᴀᴄᴛɪᴠᴇ ᴛɪᴄᴋᴇᴛ.",
          ),
        );
      }
    }
  }

  const customIdParts = interaction.customId.split("|");
  const ticketType = options.ticketType || customIdParts[1] || "text";
  const aiEnabled =
    typeof options.aiEnabled === "boolean"
      ? options.aiEnabled
      : customIdParts[2] === "1";
  const ticketReason = options.reason?.trim();

  const guild = interaction.guild;
  const channel = interaction.channel;
  let ticketChannel;

  try {
    const ticketName = `ticket-${interaction.user.username.toLowerCase()}`;

    const defaultRoles = [config.ownerRoleId, config.administratorRoleId].filter(
      Boolean,
    );
    let modRoles =
      defaultRoles.length > 0
        ? defaultRoles
        : [config.moderatorRoleId].filter(Boolean);
    const permissionOverwrites = [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
        ],
      },
      {
        id: interaction.client.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageThreads,
        ],
      },
    ];

    for (const roleId of modRoles) {
      permissionOverwrites.push({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
        ],
      });
    }

    if (config.ownerRoleId) {
      permissionOverwrites.push({
        id: config.ownerRoleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
        ],
      });
    }

    if (ticketType === "vc") {
      ticketChannel = await guild.channels.create({
        name: `${interaction.user.username}'s ᴛɪᴄᴋᴇᴛ`,
        type: ChannelType.GuildVoice,
        parent: channel.parentId,
        permissionOverwrites: permissionOverwrites,
      });
    } else {
      ticketChannel = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: channel.parentId,
        topic: aiEnabled ? "ticket_ai_enabled" : "ticket_human",
        permissionOverwrites: permissionOverwrites,
      });
    }

    activeTickets.add(interaction.user.id);
    if (supabase) {
      try {
        await supabase
          .from("active_tickets")
          .insert({ user_id: interaction.user.id });
      } catch (err) {
        log.debug("Failed to record active ticket:", err?.message || err);
      }
    }

    if (ticketType === "vc" && interaction.member.voice?.channel) {
      await interaction.member.voice.setChannel(ticketChannel).catch(() => {});
    }

    const descriptionText = aiEnabled
      ? "ᴘʟᴇᴀsᴇ ᴅᴇsᴄʀɪʙᴇ ʏᴏᴜʀ ɪssᴜᴇ ɪɴ ᴅᴇᴛᴀɪʟ. ᴏᴜʀ **ᴀɪ sᴜᴘᴘᴏʀᴛ ʙᴏᴛ** ᴡɪʟʟ ᴀssɪsᴛ ʏᴏᴜ sʜᴏʀᴛʟʏ. ɪғ ɪᴛ ʀᴇǫᴜɪʀᴇs ʜᴜᴍᴀɴ ɪɴᴛᴇʀᴠᴇɴᴛɪᴏɴ, ᴄʟɪᴄᴋ 'ᴇsᴄᴀʟᴀᴛᴇ'.\n\nᴜsᴇ ᴛʜᴇ ᴄʟᴏsᴇ ʙᴜᴛᴛᴏɴ ᴡʜᴇɴ ʏᴏᴜʀ ɪssᴜᴇ ɪs ʀᴇsᴏʟᴠᴇᴅ."
      : "ᴘʟᴇᴀsᴇ ᴅᴇsᴄʀɪʙᴇ ʏᴏᴜʀ ɪssᴜᴇ. ᴀ **ʜᴜᴍᴀɴ ᴍᴏᴅᴇʀᴀᴛᴏʀ** ᴡɪʟʟ ʙᴇ ᴡɪᴛʜ ʏᴏᴜ ᴀs sᴏᴏɴ ᴀs ᴘᴏssɪʙʟᴇ. ʏᴏᴜ ᴍᴀʏ ᴘɪɴɢ ᴛʜᴇᴍ ᴠɪᴀ ᴛʜᴇ 'ᴇsᴄᴀʟᴀᴛᴇ' ʙᴜᴛᴛᴏɴ.\n\nᴜsᴇ ᴛʜᴇ ᴄʟᴏsᴇ ʙᴜᴛᴛᴏɴ ᴡʜᴇɴ ʏᴏᴜʀ ɪssᴜᴇ ɪs ʀᴇsᴏʟᴠᴇᴅ.";

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_escalate")
        .setEmoji(icon("BELL"))
        .setLabel("ᴇsᴄᴀʟᴀᴛᴇ ᴛᴏ sᴛᴀғғ")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setEmoji(icon("LOCK"))
        .setLabel("ᴄʟᴏsᴇ ᴛɪᴄᴋᴇᴛ")
        .setStyle(ButtonStyle.Danger),
    );

    let mentionText = `<@${interaction.user.id}>`;
    const pingStr = config.ownerRoleId ? `<@&${config.ownerRoleId}>` : "";

    if (!aiEnabled) {
      mentionText += ` ${pingStr} **ᴀ ɴᴇᴡ ᴛɪᴄᴋᴇᴛ ʀᴇǫᴜɪʀᴇs ᴀᴛᴛᴇɴᴛɪᴏɴ.**`;
    } else {
      mentionText += ` ${pingStr} **ᴀ ɴᴇᴡ ᴛɪᴄᴋᴇᴛ (ᴀɪ-ᴀssɪsᴛᴇᴅ) ʜᴀs ʙᴇᴇɴ ᴄʀᴇᴀᴛᴇᴅ.**`;
    }

    const _reasonLine = ticketReason ? `\n> ${ticketReason}` : "";

    const ticketContainer = new ContainerBuilder()
      .setAccentColor(EMBED_COLOR)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## ${icon("TICKET")} ᴛɪᴄᴋᴇᴛ - ${interaction.user.username}\n**Wᴇʟᴄᴏᴍᴇ ᴛᴏ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ.**\n\n${descriptionText}`,
            ),
          )
          .setThumbnailAccessory(
            new ThumbnailBuilder().setURL(
              guild.iconURL({ dynamic: true, size: 256 }) ||
                interaction.user.displayAvatarURL({ dynamic: true, size: 256 }),
            ),
          ),
      );

    if (ticketReason) {
      ticketContainer.addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small),
      );

      ticketContainer.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `\`\`\`ansi\n\u001b[1;37m ʀᴇᴀsᴏɴ\u001b[0m\n\n\u001b[0m${ticketReason}\u001b[0m\`\`\``,
        ),
      );
    }

    ticketContainer
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small),
      )
      .addActionRowComponents(row);

    addFooter(ticketContainer);

    await swallow(ticketChannel.send(mentionText), "Ticket mention message");

    await swallow(
      ticketChannel.send({
        components: [ticketContainer],
        flags: MessageFlags.IsComponentsV2,
      }),
      "Ticket welcome message",
    );

    await interaction.editReply(
      eReply(
        `${i("DONE")} ᴛɪᴄᴋᴇᴛ ᴄʀᴇᴀᴛᴇᴅ`,
        `ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ ʜᴀs ʙᴇᴇɴ ᴄʀᴇᴀᴛᴇᴅ: <#${ticketChannel.id}>`,
      ),
    );
  } catch (error) {
    log.error("[TICKETS] Error creating ticket:", error);
    activeTickets.delete(interaction.user.id);
    if (supabase) {
      try {
        await supabase
          .from("active_tickets")
          .delete()
          .eq("user_id", interaction.user.id);
      } catch (e) {
        log.debug("Supabase ticket cleanup failed:", e?.message || e);
      }
    }
    if (ticketChannel) {
      await ticketChannel.delete().catch(() => {});
    }
    await interaction.editReply(
      eReply(
        `${i("ERROR")} ᴇʀʀᴏʀ`,
        "ᴀɴ ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ ᴄʀᴇᴀᴛɪɴɢ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ. ᴘʟᴇᴀsᴇ ᴛʀʏ ᴀɢᴀɪɴ.",
      ),
    );
  }
}

/**
 * Closes an active ticket thread or channel.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @returns {Promise<void>}
 */
async function closeTicketThread(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }

  const thread = interaction.channel;
  const isTextCompatible =
    thread.type === ChannelType.PrivateThread ||
    thread.type === ChannelType.GuildText ||
    thread.type === ChannelType.GuildVoice;

  if (!isTextCompatible) {
    return interaction.editReply(
      eReply(
        `${i("ERROR")} ɪɴᴠᴀʟɪᴅ ᴄʜᴀɴɴᴇʟ`,
        "ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ᴛᴇxᴛ-ʙᴀsᴇᴅ ᴏʀ ᴠᴏɪᴄᴇ-ʙᴀsᴇᴅ ᴛɪᴄᴋᴇᴛs.",
      ),
    );
  }

  try {
    const logChannelId = config.ticketLogsChannelId || "1489647372811243742";
    let logChannel = null;
    if (logChannelId) {
      logChannel = await interaction.guild.channels
        .fetch(logChannelId)
        .catch(() => null);
    }

    if (thread.type === ChannelType.GuildVoice) {
      if (logChannel) {
        await logChannel.send({
          content: `${icon("LOCK")} **ᴠᴏɪᴄᴇ ᴛɪᴄᴋᴇᴛ ᴄʟᴏsᴇᴅ:** \`${thread.name}\` ᴄʟᴏsᴇᴅ ʙʏ <@${interaction.user.id}>. (ɴᴏ ᴛʀᴀɴsᴄʀɪᴘᴛ ғᴏʀ ᴠᴏɪᴄᴇ ᴛɪᴄᴋᴇᴛs)`,
        });
      }
      await interaction.editReply(
        eReply(`${i("LOCK")} ᴄʟᴏsɪɴɢ`, "ᴠᴏɪᴄᴇ ᴛɪᴄᴋᴇᴛ ɪs ᴄʟᴏsɪɴɢ."),
      );
    } else {
      const messages = await thread.messages.fetch({ limit: 100 });
      let transcript = `TRANSCRIPT FOR TICKET: ${thread.name}\n`;
      transcript += "====================================================\n\n";

      const messageArr = Array.from(messages.values()).reverse();

      for (const msg of messageArr) {
        if (
          msg.embeds.length > 0 &&
          msg.author.bot &&
          msg.author.id === interaction.client.user.id
        )
          continue;
        const time = new Date(msg.createdTimestamp).toLocaleString();
        transcript += `[${time}] ${msg.author.username}:\n${msg.content || "<Embed/Attachments>"}\n\n`;
      }

      const attachment = new AttachmentBuilder(
        Buffer.from(transcript, "utf-8"),
        {
          name: `${thread.name}-transcript.txt`,
        },
      );

      if (logChannel) {
        await logChannel.send({
          content: `${icon("LOCK")} **ᴛɪᴄᴋᴇᴛ ᴄʟᴏsᴇᴅ:** \`${thread.name}\` ᴄʟᴏsᴇᴅ ʙʏ <@${interaction.user.id}>. ᴛʀᴀɴsᴄʀɪᴘᴛ ᴀᴛᴛᴀᴄʜᴇᴅ.`,
          files: [attachment],
        });
      }

      await interaction.editReply(
        eReply(
          `${i("LOCK")} ᴄʟᴏsɪɴɢ`,
          "ᴛɪᴄᴋᴇᴛ ɪs ᴄʟᴏsɪɴɢ. ᴛʜᴇ ᴛʀᴀɴsᴄʀɪᴘᴛ ʜᴀs ʙᴇᴇɴ sᴀᴠᴇᴅ ᴛᴏ ᴛʜᴇ ʟᴏɢɢɪɴɢ ᴄʜᴀɴɴᴇʟ.",
        ),
      );
    }

    setTimeout(async () => {
      try {
        const usersToRemove = [];
        if (thread.isThread()) {
          thread.members.cache.forEach((member) => {
            activeTickets.delete(member.id);
            usersToRemove.push(member.id);
          });
        } else {
          thread.permissionOverwrites.cache.forEach((overwrite) => {
            if (
              overwrite.type === 1 &&
              overwrite.id !== interaction.client.user.id
            ) {
              activeTickets.delete(overwrite.id);
              usersToRemove.push(overwrite.id);
            }
          });
        }

        if (supabase && usersToRemove.length > 0) {
          try {
            await supabase
              .from("active_tickets")
              .delete()
              .in("user_id", usersToRemove);
          } catch (e) {
            log.debug("Supabase bulk ticket cleanup failed:", e?.message || e);
          }
        }

        await thread.delete();
      } catch (err) {
        log.error("[TICKETS] Error archiving channel/thread:", err);
      }
    }, 4000);
  } catch (error) {
    log.error("[TICKETS] Error closing ticket:", error);
    if (!interaction.replied) {
      await interaction.editReply(
        eReply(
          `${i("ERROR")} ᴇʀʀᴏʀ`,
          "ᴀɴ ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ ᴄʟᴏsɪɴɢ ᴛʜᴇ ᴛɪᴄᴋᴇᴛ.",
        ),
      );
    }
  }
}

/**
 * Escalates a ticket to human staff.
 * @param {import('discord.js').Interaction} interaction - The interaction object.
 * @returns {Promise<void>}
 */
async function escalateTicket(interaction) {
  try {
    const thread = interaction.channel;
    const isTextCompatible =
      thread.type === ChannelType.PrivateThread ||
      thread.type === ChannelType.GuildText ||
      thread.type === ChannelType.GuildVoice;

    if (!isTextCompatible) {
      return interaction.reply(
        eReply(
          `${i("ERROR")} ɪɴᴠᴀʟɪᴅ ᴄʜᴀɴɴᴇʟ`,
          "ᴛʜɪs ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜsᴇᴅ ɪɴ ᴛᴇxᴛ-ʙᴀsᴇᴅ ᴏʀ ᴠᴏɪᴄᴇ-ʙᴀsᴇᴅ ᴛɪᴄᴋᴇᴛs.",
        ),
      );
    }

    if (thread.isTextBased() && thread.topic === "ticket_ai_enabled") {
      await thread.setTopic("ticket_human").catch(() => {});
    }

    let ticketModIds = [];
    if (supabase) {
      const { data: modsData } = await supabase
        .from("ticket_actions")
        .select("content")
        .eq("action_id", "ticket_mods_config")
        .single();
      if (modsData?.content) {
        try {
          ticketModIds = JSON.parse(modsData.content);
        } catch (e) {
          log.debug("Malformed ticket mod list; ignoring:", e?.message || e);
        }
      }
    }

    const pings =
      ticketModIds.length > 0
        ? ticketModIds.map((id) => `<@${id}>`).join(" ")
        : [config.ownerRoleId, config.administratorRoleId].filter(Boolean).length > 0
          ? [config.ownerRoleId, config.administratorRoleId]
              .filter(Boolean)
              .map((r) => `<@&${r}>`)
              .join(" ")
          : `<@&${config.moderatorRoleId}>`;

    await interaction.channel.send({
      content: `${icon("BELL")} ${pings}`,
    });
    await interaction.reply(
      eSend(
        `${i("BELL")} ᴇsᴄᴀʟᴀᴛᴇᴅ ᴛᴏ sᴛᴀғғ`,
        "ᴀ ᴜsᴇʀ ʜᴀs ᴇsᴄᴀʟᴀᴛᴇᴅ ᴛʜɪs ᴛɪᴄᴋᴇᴛ ᴀɴᴅ ʀᴇǫᴜɪʀᴇs ʜᴜᴍᴀɴ ᴀᴛᴛᴇɴᴛɪᴏɴ.",
      ),
    );
  } catch (error) {
    log.error("[TICKETS] Error escalating ticket:", error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction
        .reply(eReply(`${i("ERROR")} ᴇʀʀᴏʀ`, "ғᴀɪʟᴇᴅ ᴛᴏ ᴇsᴄᴀʟᴀᴛᴇ ᴛɪᴄᴋᴇᴛ."))
        .catch(() => {});
    }
  }
}
