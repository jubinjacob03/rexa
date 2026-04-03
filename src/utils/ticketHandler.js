import {
  EmbedBuilder,
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
} from "discord.js";
import supabase from "./supabaseClient.js";
import config from "../../config.js";
import {
  setupSessions,
  renderTicketDashboard,
} from "../commands/ticket-setup.js";

// Keep a simple in-memory log of active tickets for now to prevent spam
const activeTickets = new Set();

export async function handleTicketInteraction(interaction) {
  // --------- ADMIN SETUP ROUTING --------- //
  if (interaction.customId.startsWith("tsetup_")) {
    const session = setupSessions.get(interaction.user.id);
    if (!session) {
      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: "❌ ꜱᴇꜱꜱɪᴏɴ ᴇxᴘɪʀᴇᴅ. ᴘʟᴇᴀꜱᴇ ʀᴜɴ `/setup-ticket` ᴀɢᴀɪɴ.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (interaction.customId === "tsetup_edit_embed") {
      const modal = new ModalBuilder()
        .setCustomId("tsetup_modal_embed")
        .setTitle("🖋️ ᴇᴅɪᴛ ᴛɪᴄᴋᴇᴛ ᴇᴍʙᴇᴅ");

      const titleInput = new TextInputBuilder()
        .setCustomId("titleInput")
        .setLabel("ᴇᴍʙᴇᴅ ᴛɪᴛʟᴇ")
        .setStyle(TextInputStyle.Short)
        .setValue(session.title)
        .setRequired(true);

      const descInput = new TextInputBuilder()
        .setCustomId("descInput")
        .setLabel("ᴇᴍʙᴇᴅ ᴅᴇꜱᴄʀɪᴘᴛɪᴏɴ")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(session.description)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
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
        .setTitle(`💠${isVc ? "ᴠᴏɪᴄᴇ" : "ᴛᴇxᴛ"} ᴛɪᴄᴋᴇᴛ`);

      const labelInput = new TextInputBuilder()
        .setCustomId("labelBtn")
        .setLabel("ʙᴜᴛᴛᴏɴ ʟᴀʙᴇʟ")
        .setStyle(TextInputStyle.Short)
        .setValue("🎫 ᴏᴘᴇɴ ᴛɪᴄᴋᴇᴛ")
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(labelInput));

      // AI Assistance is NOT added for VC tickets
      if (!isVc) {
        const aiInput = new TextInputBuilder()
          .setCustomId("aiInput")
          .setLabel("ᴀɪ ᴀꜱꜱɪꜱᴛᴀɴᴄᴇ? (true/false)")
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
        .setTitle("💠ᴛᴇxᴛ ʀᴇᴘʟʏ");
      const labelInput = new TextInputBuilder()
        .setCustomId("labelBtn")
        .setLabel("ʙᴜᴛᴛᴏɴ ʟᴀʙᴇʟ")
        .setStyle(TextInputStyle.Short)
        .setValue("📕 ᴛɪᴛʟᴇ ᴏғ ᴛʜɪs ʙᴜᴛᴛᴏɴ")
        .setRequired(true);
      const contentInput = new TextInputBuilder()
        .setCustomId("contentInput")
        .setLabel("ᴡʜᴀᴛ ᴛᴇxᴛ ꜱʜᴏᴜʟᴅ ᴛʜɪꜱ ꜱʜᴏᴡ ᴡʜᴇɴ ᴄʟɪᴄᴋᴇᴅ?")
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
        .setTitle("💠ɪᴍᴀɢᴇ ʀᴇᴘʟʏ");
      const labelInput = new TextInputBuilder()
        .setCustomId("labelBtn")
        .setLabel("ʙᴜᴛᴛᴏɴ ʟᴀʙᴇʟ")
        .setStyle(TextInputStyle.Short)
        .setValue("💳 ᴘᴀʏᴍᴇɴᴛ")
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(labelInput));
      return await interaction.showModal(modal);
    }

    if (interaction.customId === "tsetup_clear_buttons") {
      session.buttons = [];
      return await renderTicketDashboard(interaction, true);
    }

    if (interaction.customId === "tsetup_set_mods") {
      const modal = new ModalBuilder()
        .setCustomId("tsetup_modal_mods")
        .setTitle("🛡️ ꜱᴇᴛ ᴛɪᴄᴋᴇᴛ ᴍᴏᴅᴇʀᴀᴛᴏʀꜱ");
      const modsInput = new TextInputBuilder()
        .setCustomId("modsInput")
        .setLabel("ᴜꜱᴇʀ ɪᴅꜱ ᴏʀ @ᴍᴇɴᴛɪᴏɴꜱ (ᴄᴏᴍᴍᴀ-ꜱᴇᴘᴀʀᴀᴛᴇᴅ)")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("123456789012345678, 987654321098765432")
        .setValue((session.ticketMods || []).join(", "))
        .setRequired(false)
        .setMaxLength(1000);
      modal.addComponents(new ActionRowBuilder().addComponents(modsInput));
      return await interaction.showModal(modal);
    }

    if (interaction.customId === "tsetup_publish") {
      const targetChannel = await interaction.guild.channels
        .fetch(session.targetChannelId)
        .catch(() => null);
      if (!targetChannel) {
        return await interaction.update({
          content:
            "❌ **ᴇʀʀᴏʀ:** ᴛᴀʀɢᴇᴛ ᴄʜᴀɴɴᴇʟ ɴᴏ ʟᴏɴɢᴇʀ ᴇxɪꜱᴛꜱ ᴏʀ ʙᴏᴛ ʟᴀᴄᴋꜱ ᴀᴄᴄᴇꜱꜱ.",
          embeds: [],
          components: [],
        });
      }

      const embed = new EmbedBuilder()
        .setColor(session.color)
        .setTitle(session.title)
        .setDescription(session.description)
        .setTimestamp();

      const row = new ActionRowBuilder();
      const dbConfigStore = {}; // Memory/Supabase JSON fallback trick

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

          // Persistent Save via Supabase
          if (supabase) {
            try {
              await supabase.from("ticket_actions").insert({
                action_id: actionKey,
                type: btn.type,
                content: btn.content,
              });
            } catch (err) {
              console.error("[SUPABASE] Error saving custom action:", err);
            }
          }

          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`tkt_action|${actionKey}`)
              .setLabel(btn.label)
              .setStyle(ButtonStyle.Success),
          );
        }
      }

      await targetChannel.send({ embeds: [embed], components: [row] });
      setupSessions.delete(interaction.user.id);

      return await interaction.update({
        content: `✅ **ᴛɪᴄᴋᴇᴛ ᴘᴀɴᴇʟ ᴘᴜʙʟɪꜱʜᴇᴅ ꜱᴜᴄᴄᴇꜱꜱꜰᴜʟʟʏ ᴛᴏ <#${session.targetChannelId}>.**`,
        embeds: [],
        components: [],
      });
    }
  }

  // Handle Modal Submits
  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith("tsetup_modal_")
  ) {
    const session = setupSessions.get(interaction.user.id);
    if (!session) {
      if (!interaction.replied && !interaction.deferred) {
        return await interaction.reply({
          content:
            "❌ **ꜱᴇꜱꜱɪᴏɴ ᴇxᴘɪʀᴇᴅ:** ᴛʜᴇ ʙᴏᴛ ʀᴇꜱᴛᴀʀᴛᴇᴅ. ᴘʟᴇᴀꜱᴇ ʀᴜɴ `/setup-ticket` ᴀɢᴀɪɴ.",
          flags: MessageFlags.Ephemeral,
        });
      }
      return;
    }

    if (interaction.customId === "tsetup_modal_embed") {
      session.title = interaction.fields.getTextInputValue("titleInput");
      session.description = interaction.fields.getTextInputValue("descInput");
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

      const waitingMsg = await interaction.followUp({
        content: `⏳ **ᴡᴀɪᴛɪɴɢ ꜰᴏʀ ɪᴍᴀɢᴇ:** ᴘʟᴇᴀꜱᴇ ꜱᴇɴᴅ ᴛʜᴇ ɪᴍᴀɢᴇ ꜰᴏʀ ᴛʜᴇ \`${label}\` ʙᴜᴛᴛᴏɴ ɪɴ ᴛʜɪꜱ ᴄʜᴀɴɴᴇʟ ɴᴏᴡ. (ʏᴏᴜ ʜᴀᴠᴇ 60 ꜱᴇᴄᴏɴᴅꜱ).\n*ᴛʜᴇ ʙᴏᴛ ᴡɪʟʟ ᴀᴜᴛᴏᴍᴀᴛɪᴄᴀʟʟʏ ꜱᴇᴄᴜʀᴇ ᴛʜᴇ ɪᴍᴀɢᴇ ɪɴ ᴛʜᴇ ᴄᴅɴ ʟᴏɢɢɪɴɢ ᴄʜᴀɴɴᴇʟ ᴀɴᴅ ᴅᴇʟᴇᴛᴇ ʏᴏᴜʀ ᴏʀɪɢɪɴᴀʟ ᴍᴇꜱꜱᴀɢᴇ ᴛᴏ ᴋᴇᴇᴘ ᴛʜᴇ ᴄʜᴀᴛ ᴄʟᴇᴀɴ.*`,
        flags: MessageFlags.Ephemeral,
      });

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
      } catch (err) {
        return interaction.editReply({
          content:
            "❌ **ᴛɪᴍᴇ ᴇxᴘɪʀᴇᴅ:** ʏᴏᴜ ᴅɪᴅɴ'ᴛ ᴜᴘʟᴏᴀᴅ ᴀɴ ɪᴍᴀɢᴇ ɪɴ ᴛɪᴍᴇ. ʀᴜɴ `/setup-ticket` ᴛᴏ ʀᴇꜱᴜᴍᴇ ᴏʀ ᴛʀʏ ᴀɢᴀɪɴ.",
          embeds: [],
          components: [],
        });
      }
    } else if (interaction.customId === "tsetup_modal_mods") {
      const raw = interaction.fields.getTextInputValue("modsInput");
      const ids = raw
        .split(",")
        .map((s) => s.trim().replace(/<@!?|>/g, ""))
        .filter((s) => /^\d{17,20}$/.test(s));

      session.ticketMods = ids;

      if (supabase) {
        try {
          await supabase.from("ticket_actions").upsert(
            {
              action_id: "ticket_mods_config",
              type: "config",
              content: JSON.stringify(ids),
            },
            { onConflict: "action_id" },
          );
        } catch (err) {
          console.error("[SUPABASE] Error saving ticket mods:", err);
        }
      }
    }
    return await renderTicketDashboard(interaction, true);
  }

  // --------- NORMAL USER ROUTING --------- //
  if (interaction.customId.startsWith("tkt_open|")) {
    await createTicketInstance(interaction);
  } else if (interaction.customId.startsWith("tkt_action|")) {
    const key = interaction.customId.split("|")[1];

    let actionData = null;
    if (global.customActions && global.customActions.has(key)) {
      actionData = global.customActions.get(key);
    } else if (supabase) {
      // Fallback: look it up in Supabase if the bot restarted
      const { data } = await supabase
        .from("ticket_actions")
        .select("type, content")
        .eq("action_id", key)
        .single();
      if (data) {
        actionData = data;
        // Re-cache it locally
        global.customActions = global.customActions || new Map();
        global.customActions.set(key, actionData);
      }
    }

    if (actionData) {
      if (actionData.type === "text") {
        await interaction.reply({
          content: actionData.content,
          flags: MessageFlags.Ephemeral,
        });
      } else if (actionData.type === "image") {
        await interaction.reply({
          content: actionData.content,
          flags: MessageFlags.Ephemeral,
        });
      }
    } else {
      await interaction.reply({
        content:
          "❌ ᴛʜɪꜱ ᴄᴜꜱᴛᴏᴍ ʙᴜᴛᴛᴏɴ ʜᴀꜱ ᴇxᴘɪʀᴇᴅ ᴏʀ ɪꜱ ɪɴᴠᴀʟɪᴅ (ʙᴏᴛ ʀᴇꜱᴛᴀʀᴛᴇᴅ).",
        flags: MessageFlags.Ephemeral,
      });
    }
  } else if (interaction.customId === "ticket_close") {
    await closeTicketThread(interaction);
  } else if (interaction.customId === "ticket_escalate") {
    await escalateTicket(interaction);
  }
}

async function createTicketInstance(interaction) {
  // First check memory to save db calls, otherwise ping db
  if (activeTickets.has(interaction.user.id)) {
    return interaction.reply({
      content: "❌ ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀɴ ᴀᴄᴛɪᴠᴇ ᴛɪᴄᴋᴇᴛ.",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (supabase) {
    const { data } = await supabase
      .from("active_tickets")
      .select("user_id")
      .eq("user_id", interaction.user.id)
      .single();
    if (data) {
      activeTickets.add(interaction.user.id);
      return interaction.reply({
        content: "❌ ʏᴏᴜ ᴀʟʀᴇᴀᴅʏ ʜᴀᴠᴇ ᴀɴ ᴀᴄᴛɪᴠᴇ ᴛɪᴄᴋᴇᴛ.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const customIdParts = interaction.customId.split("|");
  const ticketType = customIdParts[1]; // 'thread', 'text', or 'vc'
  const aiEnabled = customIdParts[2] === "1";

  const guild = interaction.guild;
  const channel = interaction.channel;

  try {
    let ticketChannel;
    const ticketName = `ticket-${interaction.user.username.toLowerCase()}`;

    // Modifiers array mapping from config
    const modRoles = config.ticketModeratorRoles || [];
    const permissionOverwrites = [
      {
        id: guild.id, // @everyone
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: interaction.user.id, // Ticket owner
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.Connect,
          PermissionsBitField.Flags.Speak,
        ],
      },
      {
        id: interaction.client.user.id, // The Bot
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ManageThreads,
        ],
      },
    ];

    // Give mods visibility but hide alerts initially
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

    // Add owner role natively
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

    // Branch logic based on Admin's preferred Creation Type
    if (ticketType === "vc") {
      ticketChannel = await guild.channels.create({
        name: `${interaction.user.username}'s ᴛɪᴄᴋᴇᴛ`,
        type: ChannelType.GuildVoice,
        parent: channel.parentId, // Create in same category as ticket panel
        permissionOverwrites: permissionOverwrites,
      });
    } else {
      ticketChannel = await guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: channel.parentId, // Create in same category as ticket panel
        permissionOverwrites: permissionOverwrites,
      });
    }

    activeTickets.add(interaction.user.id);
    if (supabase) {
      try {
        await supabase
          .from("active_tickets")
          .insert({ user_id: interaction.user.id });
      } catch {
        null;
      }
    }

    if (ticketType === "vc" && interaction.member.voice?.channel) {
      await interaction.member.voice.setChannel(ticketChannel).catch(() => {});
    }

    const descriptionText = aiEnabled
      ? "ᴘʟᴇᴀꜱᴇ ᴅᴇꜱᴄʀɪʙᴇ ʏᴏᴜʀ ɪꜱꜱᴜᴇ ɪɴ ᴅᴇᴛᴀɪʟ. ᴏᴜʀ **ᴀɪ ꜱᴜᴘᴘᴏʀᴛ ʙᴏᴛ** ᴡɪʟʟ ᴀꜱꜱɪꜱᴛ ʏᴏᴜ ꜱʜᴏʀᴛʟʏ. ɪꜰ ɪᴛ ʀᴇQᴜɪʀᴇꜱ ʜᴜᴍᴀɴ ɪɴᴛᴇʀᴠᴇɴᴛɪᴏɴ, ᴄʟɪᴄᴋ 'ᴇꜱᴄᴀʟᴀᴛᴇ'."
      : "ᴘʟᴇᴀꜱᴇ ᴅᴇꜱᴄʀɪʙᴇ ʏᴏᴜʀ ɪꜱꜱᴜᴇ. ᴀ **ʜᴜᴍᴀɴ ᴍᴏᴅᴇʀᴀᴛᴏʀ** ᴡɪʟʟ ʙᴇ ᴡɪᴛʜ ʏᴏᴜ ᴀꜱ ꜱᴏᴏɴ ᴀꜱ ᴘᴏꜱꜱɪʙʟᴇ. ʏᴏᴜ ᴍᴀʏ ᴘɪɴɢ ᴛʜᴇᴍ ᴠɪᴀ ᴛʜᴇ 'ᴇꜱᴄᴀʟᴀᴛᴇ' ʙᴜᴛᴛᴏɴ.";

    const embed = new EmbedBuilder()
      .setColor("#00ff00")
      .setTitle(`🎫 ᴡᴇʟᴄᴏᴍᴇ ᴛᴏ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ, ${interaction.user.username}`)
      .setDescription(descriptionText)
      .setFooter({
        text: "ᴜꜱᴇ ᴛʜᴇ ᴄʟᴏꜱᴇ ʙᴜᴛᴛᴏɴ ᴡʜᴇɴ ʏᴏᴜʀ ɪꜱꜱᴜᴇ ɪꜱ ʀᴇꜱᴏʟᴠᴇᴅ.",
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket_escalate")
        .setLabel("🔔 ᴇꜱᴄᴀʟᴀᴛᴇ ᴛᴏ ꜱᴛᴀꜰꜰ")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket_close")
        .setLabel("🔒 ᴄʟᴏꜱᴇ ᴛɪᴄᴋᴇᴛ")
        .setStyle(ButtonStyle.Danger),
    );

    let mentionText = `<@${interaction.user.id}>`;
    if (!aiEnabled) {
      const pingStr =
        modRoles.length > 0
          ? modRoles.map((r) => `<@&${r}>`).join(" ")
          : `<@&${config.moderatorRoleId}>`;
      mentionText += ` ${pingStr} **A ɴᴇᴡ ᴛɪᴄᴋᴇᴛ ʀᴇQᴜɪʀᴇꜱ ᴀᴛᴛᴇɴᴛɪᴏɴ.**`;
    } else {
      const pingStr =
        modRoles.length > 0
          ? modRoles.map((r) => `<@&${r}>`).join(" ")
          : `<@&${config.moderatorRoleId}>`;
      mentionText += ` ${pingStr} **A ɴᴇᴡ ᴛɪᴄᴋᴇᴛ \(ᴀɪ-ᴀꜱꜱɪꜱᴛᴇᴅ\) ʜᴀꜱ ʙᴇᴇɴ ᴄʀᴇᴀᴛᴇᴅ.**`;
    }

    await ticketChannel.send({
      content: mentionText,
      embeds: [embed],
      components: [row],
    });

    await interaction.editReply({
      content: `✅ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ ʜᴀꜱ ʙᴇᴇɴ ᴄʀᴇᴀᴛᴇᴅ: <#${ticketChannel.id}>`,
    });
  } catch (error) {
    console.error("[TICKETS] Error creating ticket:", error);
    await interaction.editReply({
      content: "❌ ᴀɴ ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ ᴄʀᴇᴀᴛɪɴɢ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ.",
    });
  }
}

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
      "❌ ᴛʜɪꜱ ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜꜱᴇᴅ ɪɴ ᴛᴇxᴛ-ʙᴀꜱᴇᴅ ᴏʀ ᴠᴏɪᴄᴇ-ʙᴀꜱᴇᴅ ᴛɪᴄᴋᴇᴛꜱ.",
    );
  }

  try {
    const logChannelId = config.ticketLogsChannelId || "1489647372811243742"; // Hardcode fallback
    let logChannel = null;
    if (logChannelId) {
      logChannel = await interaction.guild.channels
        .fetch(logChannelId)
        .catch(() => null);
    }

    if (thread.type === ChannelType.GuildVoice) {
      if (logChannel) {
        await logChannel.send({
          content: `🔒 **ᴠᴏɪᴄᴇ ᴛɪᴄᴋᴇᴛ ᴄʟᴏꜱᴇᴅ:** \`${thread.name}\` ᴄʟᴏꜱᴇᴅ ʙʏ <@${interaction.user.id}>. (Nᴏ ᴛʀᴀɴꜱᴄʀɪᴘᴛ ꜰᴏʀ ᴠᴏɪᴄᴇ ᴛɪᴄᴋᴇᴛꜱ)`,
        });
      }
      await interaction.editReply({
        content: "🔒 **ᴠᴏɪᴄᴇ ᴛɪᴄᴋᴇᴛ ɪꜱ ᴄʟᴏꜱɪɴɢ.**",
      });
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
          content: `🔒 **ᴛɪᴄᴋᴇᴛ ᴄʟᴏꜱᴇᴅ:** \`${thread.name}\` ᴄʟᴏꜱᴇᴅ ʙʏ <@${interaction.user.id}>. ᴛʀᴀɴꜱᴄʀɪᴘᴛ ᴀᴛᴛᴀᴄʜᴇᴅ.`,
          files: [attachment],
        });
      }

      await interaction.editReply({
        content:
          "🔒 **ᴛɪᴄᴋᴇᴛ ɪꜱ ᴄʟᴏꜱɪɴɢ.** ᴛʜᴇ ᴛʀᴀɴꜱᴄʀɪᴘᴛ ʜᴀꜱ ʙᴇᴇɴ ꜱᴀᴠᴇᴅ ᴛᴏ ᴛʜᴇ ʟᴏɢɢɪɴɢ ᴄʜᴀɴɴᴇʟ.",
      });
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
          // Find ticket owner from channel permission overwrites (type 1 = member)
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
          } catch {}
        }

        await thread.delete();
      } catch (err) {
        console.error("[TICKETS] Error archiving channel/thread:", err);
      }
    }, 4000);
  } catch (error) {
    console.error("[TICKETS] Error closing ticket:", error);
    if (!interaction.replied) {
      await interaction.editReply({
        content: "❌ ᴀɴ ᴇʀʀᴏʀ ᴏᴄᴄᴜʀʀᴇᴅ ᴡʜɪʟᴇ ᴄʟᴏꜱɪɴɢ ᴛʜᴇ ᴛɪᴄᴋᴇᴛ.",
      });
    }
  }
}

async function escalateTicket(interaction) {
  try {
    const thread = interaction.channel;
    const isTextCompatible =
      thread.type === ChannelType.PrivateThread ||
      thread.type === ChannelType.GuildText ||
      thread.type === ChannelType.GuildVoice;

    if (!isTextCompatible) {
      return interaction.reply({
        content:
          "❌ ᴛʜɪꜱ ᴄᴏᴍᴍᴀɴᴅ ᴄᴀɴ ᴏɴʟʏ ʙᴇ ᴜꜱᴇᴅ ɪɴ ᴛᴇxᴛ-ʙᴀꜱᴇᴅ ᴏʀ ᴠᴏɪᴄᴇ-ʙᴀꜱᴇᴅ ᴛɪᴄᴋᴇᴛꜱ.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Load ticket mods from DB
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
        } catch {}
      }
    }

    const pings =
      ticketModIds.length > 0
        ? ticketModIds.map((id) => `<@${id}>`).join(" ")
        : config.ticketModeratorRoles?.length > 0
          ? config.ticketModeratorRoles.map((r) => `<@&${r}>`).join(" ")
          : `<@&${config.moderatorRoleId}>`;

    await interaction.reply({
      content: `🔔 ${pings} **A uꜱᴇʀ ʜᴀꜱ ᴇꜱᴄᴀʟᴀᴛᴇᴅ ᴛʜɪꜱ ᴛɪᴄᴋᴇᴛ ᴛᴏ ʜᴜᴍᴀɴ ꜱᴛᴀꜰꜰ!**`,
    });
  } catch (error) {
    console.error("[TICKETS] Error escalating ticket:", error);
  }
}
