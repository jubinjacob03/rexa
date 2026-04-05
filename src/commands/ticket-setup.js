import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import supabase from "../utils/supabaseClient.js";
import { EMBED_COLOR } from "../utils/embed.js";
import { icon } from "../utils/icons.js";

// Stateless in-memory store for admin setup sessions (only lasts during mapping)
export const setupSessions = new Map();

export default {
  data: new SlashCommandBuilder()
    .setName("setup-ticket")
    .setDescription("Launch the Advanced Ticket Setup Dashboard")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The channel where the ticket panel will be published")
        .setRequired(true),
    ),

  async execute(interaction) {
    const targetChannel = interaction.options.getChannel("channel");

    let ticketMods = [];
    if (supabase) {
      const { data } = await supabase
        .from("ticket_actions")
        .select("content")
        .eq("action_id", "ticket_mods_config")
        .single();
      if (data?.content) {
        try {
          ticketMods = JSON.parse(data.content);
        } catch {}
      }
    }

    // Initialize default ticket configuration for this admin session
    setupSessions.set(interaction.user.id, {
      title: "🎟️ sᴜᴘᴘᴏʀᴛ ᴛɪᴄᴋᴇᴛs",
      description:
        "ᴄʟɪᴄᴋ ᴛʜᴇ ʙᴜᴛᴛᴏɴ ʙᴇʟᴏᴡ ᴛᴏ ᴏᴘᴇɴ ᴀ ᴘʀɪᴠᴀᴛᴇ ᴛɪᴄᴋᴇᴛ.\nᴏᴜʀ ᴀɪ ᴀssɪsᴛᴀɴᴛ ᴀɴᴅ sᴛᴀғғ ᴡɪʟʟ ʙᴇ ᴡɪᴛʜ ʏᴏᴜ sʜᴏʀᴛʟʏ.",
      color: EMBED_COLOR,
      targetChannelId: targetChannel.id,
      targetChannelName: targetChannel.name,
      buttons: [],
      ticketMods,
    });

    await renderTicketDashboard(interaction);
  },
};

export async function renderTicketDashboard(interaction, isUpdate = false) {
  const config = setupSessions.get(interaction.user.id);
  if (!config) return;

  const controlsEmbed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`ᴛɪᴄᴋᴇᴛ ᴇᴅɪᴛᴏʀ — ${icon("EDITOR")}`)
    .setDescription(
      "ᴜsᴇ ᴛʜᴇ ʙᴜᴛᴛᴏɴs ʙᴇʟᴏᴡ ᴛᴏ ᴄᴏɴғɪɢᴜʀᴇ ᴀɴᴅ ᴘᴜʙʟɪsʜ ʏᴏᴜʀ ᴛɪᴄᴋᴇᴛ ᴛᴏ ᴛʜᴇ sᴇʟᴇᴄᴛᴇᴅ ᴄʜᴀɴɴᴇʟ.",
    )
    .setTimestamp();

  if (interaction.guild?.iconURL()) {
    controlsEmbed.setThumbnail(
      interaction.guild.iconURL({ size: 256, dynamic: true }),
    );
  }

  const hasTextTicket = config.buttons.some(
    (b) => b.type === "ticket" && b.ticketType === "text",
  );
  const hasVcTicket = config.buttons.some(
    (b) => b.type === "ticket" && b.ticketType === "vc",
  );
  const hasTicketBtn = hasTextTicket || hasVcTicket;
  const full = config.buttons.length >= 3;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tsetup_edit_embed")
      .setLabel("ᴇᴅɪᴛ ᴇᴍʙᴇᴅ")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("tsetup_add_text_tkt")
      .setLabel("ᴛᴇxᴛ ᴛɪᴄᴋᴇᴛ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(hasTextTicket || full),
    new ButtonBuilder()
      .setCustomId("tsetup_add_vc_tkt")
      .setLabel("ᴠᴄ ᴛɪᴄᴋᴇᴛ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(hasVcTicket || full),
    new ButtonBuilder()
      .setCustomId("tsetup_add_text")
      .setLabel("ᴀᴅᴅ ᴛᴇxᴛ ʀᴇᴘʟʏ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTicketBtn || full),
    new ButtonBuilder()
      .setCustomId("tsetup_add_image")
      .setLabel("ᴀᴅᴅ ɪᴍᴀɢᴇ ʀᴇᴘʟʏ")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasTicketBtn || full),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tsetup_clear_buttons")
      .setEmoji(icon("WARNING"))
      .setLabel("ᴄʟᴇᴀʀ ʙᴜᴛᴛᴏɴꜱ")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(config.buttons.length === 0),
    new ButtonBuilder()
      .setCustomId("tsetup_publish")
      .setEmoji(icon("DONE"))
      .setLabel(`ᴘᴜʙʟɪsʜ ᴛᴏ #${config.targetChannelName}`)
      .setStyle(ButtonStyle.Success)
      .setDisabled(!hasTicketBtn),
    new ButtonBuilder()
      .setCustomId("tsetup_preview")
      .setEmoji(icon("TYPE"))
      .setLabel("ᴘʀᴇᴠɪᴇᴡ")
      .setStyle(ButtonStyle.Secondary),
  );

  const payload = {
    embeds: [controlsEmbed],
    components: [row1, row2],
    flags: MessageFlags.Ephemeral,
  };

  if (isUpdate) {
    try {
      await interaction.editReply(payload);
    } catch {
      await interaction.update(payload);
    }
  } else {
    await interaction.reply(payload);
  }
}
